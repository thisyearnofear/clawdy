import type { ArenaSnapshot } from './arenaEpisode'
import type { CinematicShot, CinematicShotKind } from './arenaCinematic'

/**
 * Broadcast grammar: compiles recorded arena facts into Orbis prompt text.
 *
 * This is the prompt side of the AI-video stage in docs/SCENES.md — a shot or
 * a live state transition becomes one bounded prompt intent. Two rules from
 * the scene contract are enforced here by construction:
 *
 * - Prompts are rebuilt from recorded facts. Every transition line is derived
 *   from the trigger's `reason` and the snapshot fields that motivated it; a
 *   trigger can only exist because the recording (or the live authority)
 *   produced the matching transition.
 * - Deltas preserve the scene. Only the first prompt of a broadcast restates
 *   the full style anchor; follow-ups begin "The same unbroken scene
 *   continues" and describe one visible change, so Orbis morphs the scene at
 *   the chunk boundary instead of re-rendering it.
 *
 * Rendered output is presentation, never evidence: this module owns no
 * transport and nothing it emits feeds back into a match, an observation, or
 * an evaluation.
 */

export type BroadcastTriggerKind = CinematicShotKind

export interface BroadcastTrigger {
  kind: BroadcastTriggerKind
  /** Entrant the moment belongs to; null for arena-wide shots. */
  agentId: string | null
  /** The recorded fact that motivated this prompt, for audit/debug UI. */
  reason: string
  /** Higher priority wins the director's pending slot; newest wins a tie. */
  priority: number
}

/**
 * Intent handed to the director. `build` is resolved at dispatch time so the
 * initial-vs-delta decision is made against what actually shipped — if the
 * establish prompt loses its pending slot to a faster event, the surviving
 * intent still opens with the full style anchor instead of an orphan delta.
 */
export interface BroadcastIntent {
  reason: string
  kind: BroadcastTriggerKind
  priority: number
  createdAt: number
  build: (initial: boolean) => { prompt: string; audioPrompt: string }
}

export const BROADCAST_TRIGGER_PRIORITIES: Record<BroadcastTriggerKind, number> = {
  recovery: 100,
  finish: 95,
  flood: 90,
  bank: 80,
  collect: 70,
  establish: 60,
  follow: 10,
}

const BROADCAST_STYLE_ANCHOR = [
  'a sun-baked sandstone basin arena',
  'two small autonomous rovers racing for glowing amber energy cores',
  'rust-red rock shelves and a pale floodable valley floor',
  'chalk route ribbons tracing each road',
  'warm desert light, cinematic documentary camera',
  'readable, grounded, no text or overlays',
].join(', ')

function agentName(agentId: string | null): string {
  if (agentId === 'champion') return 'the green champion rover'
  if (agentId === 'rival') return 'the rust rival hauler'
  return agentId ? `rover ${agentId}` : 'the rovers'
}

function transitionLine(trigger: BroadcastTrigger, snapshot: ArenaSnapshot): string {
  const name = agentName(trigger.agentId)
  switch (trigger.kind) {
    case 'establish':
      return 'Both rovers wait at their bases as the basin opens up — cores glint on the field, the valley lies dry and quiet for now.'
    case 'flood':
      return 'Water begins rising through the low valley. A bright shoreline advances over the amber routes while the higher sandstone ridge stays dry. A rover on the flooded route slows; keep the same arena and rovers.'
    case 'collect':
      return `${name} reaches a glowing amber core and lifts it aboard, its cargo light brightening.`
    case 'bank': {
      const agent = snapshot.agents.find(candidate => candidate.id === trigger.agentId)
      const tally = agent ? ` Its banked tally now reads ${agent.banked}.` : ''
      return `${name} rolls onto its base pad and deposits its cargo — the beacon flares as the cores bank.${tally}`
    }
    case 'recovery':
      return `${name} stalls out and the arena recovery drone drags it clear — hazard lights, dust, a hard reset onto its base pad.`
    case 'finish': {
      if (snapshot.status !== 'finished') return 'The match clock runs down toward the horn.'
      const winner = snapshot.winner
      const line = winner === null
        ? 'The horn sounds on a dead heat — both rovers hold as the basin light settles.'
        : `The horn sounds and ${agentName(winner)} holds the winning tally as the basin light settles.`
      return `${line} Pull wide for the closing frame.`
    }
    case 'follow':
      return `${name} runs its route — hold a low tracking shot beside it as the basin slides past.`
  }
}

function audioLine(trigger: BroadcastTrigger): string {
  switch (trigger.kind) {
    case 'flood':
      return 'Rising water, a low rumble through the valley, rain on stone; no spoken instructions.'
    case 'collect':
      return 'A soft pickup chime over wind and servo hum; no spoken instructions.'
    case 'bank':
      return 'A warm resolving tone as cargo lands; wind over sandstone; no spoken instructions.'
    case 'recovery':
      return 'A low warning tone, a drone winch, then quiet dust settling; no spoken instructions.'
    case 'finish':
      return 'A horn, then a calm settling cadence over desert wind; no spoken instructions.'
    default:
      return 'Wind over sandstone and faint servo hum; no spoken instructions or urgent alarms.'
  }
}

/**
 * Compile one trigger + the snapshot that carries its facts into a broadcast
 * intent. Pure — safe to call for every shot boundary or live transition.
 */
export function buildBroadcastIntent(
  trigger: BroadcastTrigger,
  snapshot: ArenaSnapshot,
  now = Date.now(),
): BroadcastIntent {
  return {
    reason: trigger.reason,
    kind: trigger.kind,
    priority: trigger.priority,
    createdAt: now,
    build: (initial) => {
      const transition = transitionLine(trigger, snapshot)
      const prompt = initial
        ? `${BROADCAST_STYLE_ANCHOR}. ${transition} Medium-wide, eye-level documentary shot, one continuous take.`
        : `The same unbroken scene continues. ${transition}`
      return { prompt, audioPrompt: audioLine(trigger) }
    },
  }
}

/** Wrap a storyboard shot as a broadcast trigger (review path). */
export function triggerFromShot(shot: CinematicShot): BroadcastTrigger {
  return {
    kind: shot.kind,
    agentId: shot.agentId,
    reason: shot.reason,
    priority: BROADCAST_TRIGGER_PRIORITIES[shot.kind],
  }
}

/**
 * Diff two consecutive snapshots into broadcast triggers (live path). Mirrors
 * the storyboard planner's recorded-facts detection so live broadcasts and
 * replay broadcasts describe the same world; only facts that actually
 * transitioned produce a trigger.
 */
export function broadcastTriggersBetween(prev: ArenaSnapshot, curr: ArenaSnapshot): BroadcastTrigger[] {
  const triggers: BroadcastTrigger[] = []

  if (!prev.weather.flooded && curr.weather.flooded) {
    triggers.push({ kind: 'flood', agentId: null, reason: `flood begins at tick ${curr.tick}`, priority: BROADCAST_TRIGGER_PRIORITIES.flood })
  }

  for (const agent of curr.agents) {
    const before = prev.agents.find(candidate => candidate.id === agent.id)
    if (!before) continue
    if (agent.recoveries > before.recoveries) {
      triggers.push({ kind: 'recovery', agentId: agent.id, reason: `${agent.id} recovered at tick ${curr.tick}`, priority: BROADCAST_TRIGGER_PRIORITIES.recovery })
    }
    if (agent.banked > before.banked) {
      triggers.push({ kind: 'bank', agentId: agent.id, reason: `${agent.id} banked ${agent.banked - before.banked} at tick ${curr.tick}`, priority: BROADCAST_TRIGGER_PRIORITIES.bank })
    }
  }

  for (const resource of curr.resources) {
    const before = prev.resources.find(candidate => candidate.id === resource.id)
    if (before && before.collectedBy === null && resource.collectedBy !== null) {
      triggers.push({ kind: 'collect', agentId: resource.collectedBy, reason: `${resource.collectedBy} collected ${resource.id} at tick ${curr.tick}`, priority: BROADCAST_TRIGGER_PRIORITIES.collect })
    }
  }

  if (prev.status !== 'finished' && curr.status === 'finished') {
    triggers.push({ kind: 'finish', agentId: curr.winner, reason: `match ends, winner: ${curr.winner ?? 'draw'}`, priority: BROADCAST_TRIGGER_PRIORITIES.finish })
  }

  return triggers
}
