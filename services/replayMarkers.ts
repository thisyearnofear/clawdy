import type { ArenaRecording } from './arenaEpisode'

/**
 * Replay attribution markers: a compact, human-readable account of what
 * decided a match, derived from an `ArenaRecording` and stored next to the
 * replay so a viewer can answer "why did my rover lose" without scrubbing
 * 240 checkpoints.
 *
 * Sources, in order of trust:
 *  - the sim's own append-only `events` (bumps, core spawns) — authoritative;
 *  - per-checkpoint state diffs (energy bottoming out, physics recoveries,
 *    bank deposits) — derived, tick is the first checkpoint showing it.
 *
 * Pure: same recording → same markers. Never mutates the recording.
 */

export type ReplayMarker = {
  /** `bump` / `core-spawn` / `battery-out` / `recovery` / `bank`. */
  type: string
  tick: number
  /** Entrant slot the marker is about (`champion` / `rival`), when relevant. */
  agentId?: string
  /** Plain-language detail, e.g. "stole 1 cargo from champion". */
  note?: string
  /** Which recording in a stored replay produced this marker (set by the caller). */
  side?: number
}

/** Cap keeps a stored marker list bounded no matter how eventful a match gets. */
export const MAX_REPLAY_MARKERS = 200

/** Energy at or below this is "out" — moves are charged up-front, so energy can go negative mid-transit. */
const BATTERY_EPSILON = 0.001

function agentName(recording: ArenaRecording, slotId: string): string {
  const entrant = recording.scenario.entrants.find(candidate => candidate.id === slotId)
  return entrant?.policyVersion ?? slotId
}

export function summarizeReplayMarkers(recording: ArenaRecording): ReplayMarker[] {
  if (!recording || !Array.isArray(recording.checkpoints)) return []
  const markers: ReplayMarker[] = []

  // Authoritative sim events accumulate on the state; the last checkpoint
  // (or the snapshot at finalTick) carries the whole list.
  const final = recording.checkpoints.at(-1)?.state
  for (const event of final?.events ?? []) {
    if (event.type === 'bump') {
      markers.push({
        type: 'bump',
        tick: event.tick,
        agentId: event.loserId,
        note: `${agentName(recording, event.winnerId)} stole ${event.stolen} cargo; ${agentName(recording, event.loserId)} staggered`,
      })
    } else if (event.type === 'core_spawn') {
      markers.push({ type: 'core-spawn', tick: event.tick, note: `${event.resourceId} at ${event.nodeId} (value ${event.value})` })
    } else {
      // A future ArenaSimEvent still becomes a marker rather than silently
      // dropping: emit its type, the first *Id field as the subject, and the
      // remaining scalar fields as the note. The union is statically
      // exhaustive today, so read through a generic record.
      const generic = event as unknown as { type: string; tick: number } & Record<string, unknown>
      const entries = Object.entries(generic).filter(([key]) => key !== 'type' && key !== 'tick')
      const subjectKey = entries.find(([key, value]) => key.endsWith('Id') && typeof value === 'string')?.[0]
      const subject = generic[subjectKey ?? ''] as string | undefined
      const note = entries
        .filter(([key, value]) => key !== subjectKey && (typeof value === 'string' || typeof value === 'number'))
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')
      markers.push({ type: generic.type, tick: generic.tick, agentId: subject, note: note || undefined })
    }
  }

  // Derived markers: walk checkpoints once, remembering per-agent counters.
  const batteryOut = new Set<string>()
  const lastRecoveries = new Map<string, number>()
  const lastBanked = new Map<string, number>()
  for (const { state } of recording.checkpoints) {
    for (const agent of state.agents) {
      if (!batteryOut.has(agent.id) && agent.energy <= BATTERY_EPSILON) {
        batteryOut.add(agent.id)
        markers.push({ type: 'battery-out', tick: state.tick, agentId: agent.id, note: 'energy exhausted' })
      }
      const recoveries = lastRecoveries.get(agent.id) ?? 0
      if (agent.recoveries > recoveries) {
        markers.push({ type: 'recovery', tick: state.tick, agentId: agent.id, note: `recovered after a stall (${agent.recoveries} total)` })
        lastRecoveries.set(agent.id, agent.recoveries)
      }
      const banked = lastBanked.get(agent.id) ?? 0
      if (agent.banked > banked) {
        markers.push({ type: 'bank', tick: state.tick, agentId: agent.id, note: `banked ${agent.banked - banked} (total ${agent.banked})` })
        lastBanked.set(agent.id, agent.banked)
      }
    }
  }

  markers.sort((a, b) => a.tick - b.tick || a.type.localeCompare(b.type))
  return markers.slice(0, MAX_REPLAY_MARKERS)
}
