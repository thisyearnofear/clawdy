import type { ArenaRecording, ArenaSnapshot } from './arenaEpisode'

/**
 * Deterministic storyboard planner for replay cinematics.
 *
 * A storyboard is a pure function of the recording: shots may only reference
 * events that appear in the recorded checkpoints (see docs/SCENES.md). This
 * module owns no camera math — it describes which recorded span each shot
 * covers and which recorded fact motivated it, so the renderer and any future
 * generative stage share one validated contract.
 */

export type CinematicShotKind = 'establish' | 'follow' | 'flood' | 'collect' | 'bank' | 'recovery' | 'finish'

export interface CinematicShot {
  kind: CinematicShotKind
  /** Inclusive checkpoint index where the shot starts. */
  fromIndex: number
  /** Exclusive checkpoint index where the shot ends. */
  toIndex: number
  /** Entrant the camera focuses on; null for wide shots. */
  agentId: string | null
  /** The recorded fact that motivated this shot, for audit/debug UI. */
  reason: string
}

/** How many checkpoints a shot holds around its triggering event. */
const EVENT_LEAD_FRAMES = 2
const EVENT_TAIL_FRAMES = 14
const ESTABLISH_FRAMES = 8
const FINISH_FRAMES = 24

type CinematicEvent = {
  index: number
  kind: Exclude<CinematicShotKind, 'establish' | 'follow' | 'finish'>
  agentId: string | null
  reason: string
  priority: number
}

function detectEvents(checkpoints: { state: ArenaSnapshot }[]): CinematicEvent[] {
  const events: CinematicEvent[] = []
  for (let index = 1; index < checkpoints.length; index++) {
    const prev = checkpoints[index - 1].state
    const curr = checkpoints[index].state

    if (!prev.weather.flooded && curr.weather.flooded) {
      events.push({ index, kind: 'flood', agentId: null, reason: `flood begins at tick ${curr.tick}`, priority: 2 })
    }

    for (const agent of curr.agents) {
      const before = prev.agents.find(candidate => candidate.id === agent.id)
      if (!before) continue
      if (agent.recoveries > before.recoveries) {
        events.push({ index, kind: 'recovery', agentId: agent.id, reason: `${agent.id} recovered at tick ${curr.tick}`, priority: 1 })
      }
      if (agent.banked > before.banked) {
        events.push({ index, kind: 'bank', agentId: agent.id, reason: `${agent.id} banked ${agent.banked - before.banked} at tick ${curr.tick}`, priority: 3 })
      }
    }

    for (const resource of curr.resources) {
      const before = prev.resources.find(candidate => candidate.id === resource.id)
      if (before && before.collectedBy === null && resource.collectedBy !== null) {
        events.push({ index, kind: 'collect', agentId: resource.collectedBy, reason: `${resource.collectedBy} collected ${resource.id} at tick ${curr.tick}`, priority: 4 })
      }
    }
  }
  // Multiple facts on one checkpoint produce a single shot: the most dramatic wins.
  const byIndex = new Map<number, CinematicEvent>()
  for (const event of events) {
    const existing = byIndex.get(event.index)
    if (!existing || event.priority < existing.priority) byIndex.set(event.index, event)
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index)
}

/** Focus whichever entrant spends the most frames in transit over the span; ties favor the champion. */
function dominantAgent(checkpoints: { state: ArenaSnapshot }[], from: number, to: number): string | null {
  const counts = new Map<string, number>()
  for (let index = from; index < to; index++) {
    for (const agent of checkpoints[index].state.agents) {
      if (agent.transit) counts.set(agent.id, (counts.get(agent.id) ?? 0) + 1)
    }
  }
  let best: string | null = null
  let bestCount = 0
  for (const [id, count] of counts) {
    if (count > bestCount || (count === bestCount && id === 'champion')) {
      best = id
      bestCount = count
    }
  }
  return best ?? checkpoints[0]?.state.agents[0]?.id ?? null
}

function followShot(checkpoints: { state: ArenaSnapshot }[], from: number, to: number): CinematicShot {
  const agentId = dominantAgent(checkpoints, from, to)
  return { kind: 'follow', fromIndex: from, toIndex: to, agentId, reason: agentId ? `${agentId} on route` : 'field coverage' }
}

/**
 * Partition a recording's checkpoints into an ordered, contiguous shot list.
 * Every index in [0, checkpointCount) belongs to exactly one shot.
 */
export function planCinematicShots(recording: Pick<ArenaRecording, 'checkpoints'>): CinematicShot[] {
  const checkpoints = recording.checkpoints
  const count = checkpoints.length
  if (count === 0) return []

  const events = detectEvents(checkpoints)
  const shots: CinematicShot[] = []
  let cursor = 0

  const establishEnd = Math.min(ESTABLISH_FRAMES, events[0]?.index ?? count, count)
  shots.push({ kind: 'establish', fromIndex: 0, toIndex: establishEnd, agentId: null, reason: 'opening frame' })
  cursor = establishEnd

  for (const event of events) {
    const frontier = shots.at(-1)!.toIndex
    let start = Math.max(frontier, event.index - EVENT_LEAD_FRAMES)
    if (event.index < start) {
      // The trigger frame lies inside the previous shot — a later event is a
      // hard cut, so the previous shot ends at the trigger and this shot owns
      // the fact it describes.
      start = event.index
      shots.at(-1)!.toIndex = start
    } else if (start > frontier) {
      shots.push(followShot(checkpoints, frontier, start))
    }
    const end = Math.min(count, event.index + EVENT_TAIL_FRAMES)
    if (end > start) shots.push({ kind: event.kind, fromIndex: start, toIndex: end, agentId: event.agentId, reason: event.reason })
    cursor = shots.at(-1)!.toIndex
  }

  if (cursor < count) {
    const finished = checkpoints[count - 1].state.status === 'finished'
    const tailStart = finished ? Math.max(cursor, count - FINISH_FRAMES) : cursor
    if (tailStart > cursor) shots.push(followShot(checkpoints, cursor, tailStart))
    const agentId = finished ? (checkpoints[count - 1].state.winner ?? null) : dominantAgent(checkpoints, tailStart, count)
    shots.push({
      kind: finished ? 'finish' : 'follow',
      fromIndex: tailStart,
      toIndex: count,
      agentId,
      reason: finished ? `match ends, winner: ${checkpoints[count - 1].state.winner ?? 'draw'}` : 'recording ends mid-run',
    })
  }

  return shots
}

/** The shot covering a replay checkpoint index, or null outside the storyboard. */
export function shotAt(shots: CinematicShot[], index: number): CinematicShot | null {
  for (const shot of shots) {
    if (index >= shot.fromIndex && index < shot.toIndex) return shot
  }
  return null
}
