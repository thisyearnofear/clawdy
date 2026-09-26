import type { ArenaAction, ArenaAgentState } from '../../services/arenaEpisode'
import type { CollectorStrategy } from '../../services/arenaPolicy'
import { POLICY_SCHEMA_VERSION, type PolicyCheckpoint } from '../../services/policyModel'

/**
 * v1 checkpoints remain metadata-readable (lineage, export) but must never
 * reach the session runner — createLearnedPolicy refuses them with
 * checkpoint-execution-mismatch.
 */
export const isExecutableCheckpoint = (checkpoint: PolicyCheckpoint) =>
  checkpoint.schemaVersion === POLICY_SCHEMA_VERSION

export const POLICY_LABELS: Record<CollectorStrategy, string> = {
  learned: 'Your trained brain',
  safe: 'Careful (house baseline)',
  greedy: 'Fast (house baseline)',
  weather: 'Flood-aware (house baseline)',
}

export const PLAY_HINT_KEY = 'clawdy_play_hint_v1'
export const COACH_NUDGE_KEY = 'clawdy_coach_nudge_v1'

export function readHintDismissed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(PLAY_HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function actionsEqual(a: ArenaAction, b: ArenaAction): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'move' && b.type === 'move') return a.edgeId === b.edgeId
  if (a.type === 'collect' && b.type === 'collect') return a.resourceId === b.resourceId
  return true
}

export function formatStat(value: number): string {
  const rounded = Math.round(value)
  return Math.abs(value - rounded) < 1e-6 ? String(rounded) : value.toFixed(1)
}

export function actionLabel(action: ArenaAction): string {
  if (action.type === 'move') return `move ${action.edgeId}`
  if (action.type === 'collect') return `collect ${action.resourceId}`
  return action.type
}

export function describeArenaDecision(agent: ArenaAgentState): string {
  if (agent.recoveries > 0 && agent.lastOutcome?.reason === 'movement-blocked') return 'Blocked route. Recovered to the last safe station.'
  const outcome = agent.lastOutcome
  if (!outcome) return 'Waiting for the first observation.'
  if (!outcome.accepted) return `Action rejected: ${outcome.reason?.replaceAll('-', ' ')}.`
  if (agent.transit) {
    const route = agent.transit.edgeId.includes('ridge') ? 'the high route'
      : agent.transit.edgeId.includes('valley') ? 'the valley'
      : agent.transit.edgeId.includes('shortcut') || agent.transit.edgeId.includes('diag') ? 'a shortcut'
      : agent.transit.edgeId.includes('cross') ? 'a cross trail'
      : 'the next station'
    return `Following ${route}.`
  }
  if (outcome.action?.type === 'bank') return 'Delivered cargo to base.'
  if (outcome.action?.type === 'collect') return 'Collected an energy core.'
  if (outcome.action?.type === 'drain') return 'Spent energy to clear the low routes.'
  return 'Observing the next opportunity.'
}
