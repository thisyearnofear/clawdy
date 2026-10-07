import {
  ARENA_RULES,
  capacityOf,
  type ArenaAction,
  type ArenaAgentState,
  type ArenaObservation,
  type ArenaSimEvent,
} from './arenaEpisode'
import { routeLabel, stationLabel } from './routeLabels'

/**
 * Decision language — mid-run captions from real intent data only.
 * Format: planned action · alternative · one plain reason
 * (flood / rival / steal / energy / cargo pressure / bank).
 * Never invents explainability: missing fields stay absent rather than guessed.
 */

export type DecisionReasonKind = 'flood' | 'rival' | 'steal' | 'energy' | 'cargo' | 'bank'

export interface DecisionCaption {
  planned: string
  alternative: string | null
  reason: DecisionReasonKind | null
  reasonLabel: string | null
  /** Compact HUD/card line. Omits empty segments. */
  line: string
}

/** Richer mid-run reason phrases — pressure language players can skim. */
const REASON_LABELS: Record<DecisionReasonKind, string> = {
  flood: 'flood pressure',
  rival: 'rival nearby',
  steal: 'steal window',
  energy: 'low energy',
  cargo: 'cargo pressure',
  bank: 'banking',
}

function actionPhrase(action: ArenaAction, observation?: ArenaObservation | null): string {
  if (action.type === 'move') {
    const edge = observation?.edges.find(candidate => candidate.id === action.edgeId)
    const at = observation?.self.nodeId
    const destination = edge && at
      ? (edge.from === at ? edge.to : edge.from)
      : undefined
    return `take ${routeLabel(action.edgeId, destination)}`
  }
  if (action.type === 'collect') return 'collect core'
  if (action.type === 'bank') return 'bank at base'
  if (action.type === 'drain') return 'drain valley'
  return 'wait'
}

function plannedPhrase(agent: ArenaAgentState, observation?: ArenaObservation | null): string | null {
  if (agent.transit) {
    return `heading to ${stationLabel(agent.transit.to)} via ${routeLabel(agent.transit.edgeId, agent.transit.to)}`
  }
  const outcome = agent.lastOutcome
  if (outcome?.accepted && outcome.action) {
    return actionPhrase(outcome.action, observation)
  }
  if (outcome && !outcome.accepted && outcome.action) {
    return `blocked ${actionPhrase(outcome.action, observation)}`
  }
  return null
}

function actionsEqual(a: ArenaAction, b: ArenaAction): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'move' && b.type === 'move') return a.edgeId === b.edgeId
  if (a.type === 'collect' && b.type === 'collect') return a.resourceId === b.resourceId
  return true
}

/**
 * First legal alternative that differs from the planned/taken action.
 * Uses observation.availableActions only — never synthesizes options.
 */
function alternativePhrase(
  agent: ArenaAgentState,
  observation?: ArenaObservation | null,
): string | null {
  if (!observation) return null
  const planned = agent.lastOutcome?.accepted ? agent.lastOutcome.action : null
  const plannedMove = agent.transit?.edgeId
    ?? (planned && planned.type === 'move' ? planned.edgeId : null)
  for (const action of observation.availableActions) {
    if (planned && actionsEqual(action, planned)) continue
    if (action.type === 'move' && plannedMove && action.edgeId === plannedMove) continue
    // Prefer concrete verbs over wait noise when something better is legal.
    if (action.type === 'wait') continue
    return actionPhrase(action, observation)
  }
  // Fall back to wait only when it is the sole distinct legal option.
  const wait = observation.availableActions.find(action => action.type === 'wait')
  if (wait && !(planned && planned.type === 'wait')) return actionPhrase(wait, observation)
  return null
}

/** Recent bump with cargo taken involving this agent (steal window / aftermath). */
export function recentStealEvent(
  events: readonly ArenaSimEvent[] | undefined,
  agentId: string,
  tick: number,
  windowTicks = 40,
): Extract<ArenaSimEvent, { type: 'bump' }> | null {
  if (!events) return null
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type !== 'bump') continue
    if (tick - event.tick > windowTicks) break
    if (event.stolen <= 0) continue
    if (event.winnerId === agentId || event.loserId === agentId) return event
  }
  return null
}

/**
 * One plain reason bucket from live state. Priority matches player-visible
 * stakes: banking > cargo pressure > steal > flood > energy > rival presence.
 */
export function decideReason(input: {
  agent: ArenaAgentState
  observation?: ArenaObservation | null
  flooded?: boolean
  events?: readonly ArenaSimEvent[]
  tick?: number
}): DecisionReasonKind | null {
  const { agent, observation } = input
  const flooded = input.flooded ?? observation?.weather.flooded ?? false
  const capacity = capacityOf(agent)
  const action = agent.lastOutcome?.accepted ? agent.lastOutcome.action : null
  const tick = input.tick ?? agent.lastOutcome?.tick ?? 0

  if (action?.type === 'bank' || (agent.cargo > 0 && agent.nodeId.includes('base'))) {
    return 'bank'
  }
  if (agent.cargo >= capacity || (action?.type === 'collect' && agent.cargo + 1 >= capacity)) {
    return 'cargo'
  }
  const steal = recentStealEvent(input.events, agent.id, tick)
  if (steal) return 'steal'
  // Raider steal window: steal-all trait + visible rival carrying cargo.
  const rivalWithCargo = observation?.rivals.some(rival => rival.visible && (rival.cargo ?? 0) > 0) ?? false
  if (agent.traits?.stealAll && rivalWithCargo) return 'steal'
  if (flooded) return 'flood'
  if (agent.transit) {
    const edge = observation?.edges.find(candidate => candidate.id === agent.transit!.edgeId)
    if (edge?.floodable && flooded) return 'flood'
  }
  const maxEnergy = agent.traits?.maxEnergy ?? ARENA_RULES.initialEnergy
  if (agent.energy <= maxEnergy * 0.35 || action?.type === 'drain') return 'energy'
  const rivalVisible = observation?.rivals.some(rival => rival.visible) ?? false
  if (rivalVisible) return 'rival'
  return null
}

export function formatDecisionCaption(input: {
  agent: ArenaAgentState
  observation?: ArenaObservation | null
  flooded?: boolean
  events?: readonly ArenaSimEvent[]
  tick?: number
}): DecisionCaption | null {
  const planned = plannedPhrase(input.agent, input.observation)
  if (!planned) return null
  const alternative = alternativePhrase(input.agent, input.observation)
  const reason = decideReason(input)
  const reasonLabel = reason ? REASON_LABELS[reason] : null
  const parts = [planned]
  if (alternative) parts.push(alternative)
  if (reasonLabel) parts.push(reasonLabel)
  return {
    planned,
    alternative,
    reason,
    reasonLabel,
    line: parts.join(' · '),
  }
}

/** Player-facing doors — Clash vs Prove only (Practice/Rush taxonomy stays internal). */
export type PlayerDoor = 'clash' | 'prove'

export function playerDoorLabel(options: {
  rulesetId?: string
  isMatch?: boolean
  /** Internal play modes may include eval-only variants; only compete maps to Prove. */
  playMode?: string
}): PlayerDoor {
  if (options.isMatch || options.playMode === 'compete') return 'prove'
  return 'clash'
}

export const PLAYER_DOOR_COPY: Record<PlayerDoor, string> = {
  clash: 'Clash',
  prove: 'Prove',
}

/** Strong first-minute perk moments — HUD + feed copy keyed by chassis. */
export function perkTelegraphMoment(chassis: 'scout' | 'hauler' | 'raider'): {
  tip: string
  feed: string
  tone: 'info' | 'bank' | 'flood'
} {
  if (chassis === 'hauler') {
    return {
      tip: 'Hauler perk: cargo bed holds 4 — empty slots glow on your rover. Bank big or bank often before the bed slows you.',
      feed: 'Hauler · 4 cargo live on-world',
      tone: 'bank',
    }
  }
  if (chassis === 'raider') {
    return {
      tip: 'Raider perk: win a bump and you steal a whole load (up to free space). Watch for contested stretches — sparks mean staggered.',
      feed: 'Raider · steal-all on bump',
      tone: 'info',
    }
  }
  return {
    tip: 'Scout perk: vision rings mark two route hops — look past the next junction before you commit.',
    feed: 'Scout · 2-hop vision rings live',
    tone: 'info',
  }
}
