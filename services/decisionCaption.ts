import {
  ARENA_RULES,
  capacityOf,
  type ArenaAction,
  type ArenaAgentState,
  type ArenaObservation,
} from './arenaEpisode'
import { routeLabel, stationLabel } from './routeLabels'

/**
 * Decision language v1 — mid-run captions from real intent data only.
 * Format: planned action · alternative · one plain reason (flood/rival/energy/cargo/bank).
 * Never invents explainability: missing fields stay absent rather than guessed.
 */

export type DecisionReasonKind = 'flood' | 'rival' | 'energy' | 'cargo' | 'bank'

export interface DecisionCaption {
  planned: string
  alternative: string | null
  reason: DecisionReasonKind | null
  reasonLabel: string | null
  /** Compact HUD/card line. Omits empty segments. */
  line: string
}

const REASON_LABELS: Record<DecisionReasonKind, string> = {
  flood: 'flood',
  rival: 'rival',
  energy: 'energy',
  cargo: 'cargo',
  bank: 'bank',
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

/**
 * One plain reason bucket from live state. Priority matches player-visible
 * stakes: banking score > cargo pressure > flood > energy > rival presence.
 */
export function decideReason(input: {
  agent: ArenaAgentState
  observation?: ArenaObservation | null
  flooded?: boolean
}): DecisionReasonKind | null {
  const { agent, observation } = input
  const flooded = input.flooded ?? observation?.weather.flooded ?? false
  const capacity = capacityOf(agent)
  const action = agent.lastOutcome?.accepted ? agent.lastOutcome.action : null

  if (action?.type === 'bank' || (agent.cargo > 0 && agent.nodeId.includes('base'))) {
    return 'bank'
  }
  if (agent.cargo >= capacity || (action?.type === 'collect' && agent.cargo + 1 >= capacity)) {
    return 'cargo'
  }
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

/** Player-facing door labels — Clash vs Prove, Tutor for depth. */
export type PlayerDoor = 'clash' | 'tutor' | 'prove' | 'rush'

export function playerDoorLabel(options: {
  rulesetId?: string
  isMatch?: boolean
  /** Internal play modes may include eval-only variants; only compete maps to Prove. */
  playMode?: string
}): PlayerDoor {
  if (options.rulesetId === 'skirmish') return 'clash'
  if (options.isMatch || options.playMode === 'compete') return 'prove'
  if (options.playMode === 'rush') return 'rush'
  return 'tutor'
}

export const PLAYER_DOOR_COPY: Record<PlayerDoor, string> = {
  clash: 'Clash',
  tutor: 'Tutor',
  prove: 'Prove',
  rush: 'Rush',
}
