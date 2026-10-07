import type { ArenaAction, ArenaAgentState, ArenaObservation } from '../../services/arenaEpisode'
import { formatDecisionCaption } from '../../services/decisionCaption'
import type { CollectorStrategy } from '../../services/arenaPolicy'
import { POLICY_SCHEMA_VERSION, type PolicyCheckpoint } from '../../services/policyModel'
import { routeLabel, stationLabel } from '../../services/routeLabels'

export { disambiguateRouteLabels, routeLabel, stationLabel } from '../../services/routeLabels'

/**
 * v1 checkpoints remain metadata-readable (lineage, export) but must never
 * reach the session runner — createLearnedPolicy refuses them with
 * checkpoint-execution-mismatch.
 */
export const isExecutableCheckpoint = (checkpoint: PolicyCheckpoint) =>
  checkpoint.schemaVersion === POLICY_SCHEMA_VERSION

export const POLICY_LABELS: Record<CollectorStrategy, string> = {
  learned: 'Trained brain',
  safe: 'Careful (house baseline)',
  greedy: 'Fast (house baseline)',
  weather: 'Flood-aware (house baseline)',
  poach: 'Poacher (house baseline)',
}

export const PLAY_HINT_KEY = 'clawdy_play_hint_v1'
export const COACH_NUDGE_KEY = 'clawdy_coach_nudge_v1'
export const COACH_ANYTIME_KEY = 'clawdy_coach_anytime_v1'
export const COACH_MISTAKE_KEY = 'clawdy_coach_mistake_v1'

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

export type StatusTone = 'success' | 'caution' | 'error' | 'busy'

/**
 * Status-card copy is plain English, not structured data, so there is no
 * explicit severity field to key off. These keyword buckets are a light
 * heuristic over a known, short set of player-facing strings — good enough
 * to drive an icon and a color, not a general-purpose classifier.
 */
export function classifyStatusTone(message: string): StatusTone {
  const text = message.toLowerCase()
  if (/(couldn't|could not|can't|cannot|didn't|wouldn't|failed|refused|blocked|unexpectedly|hiccup|snag)/.test(text)) return 'error'
  if (/(hit reset|can't switch|first —|scored match|only works on practice|held-out|older format|view-only)/.test(text)) return 'caution'
  if (text.endsWith('…')) return 'busy'
  return 'success'
}

export function actionLabel(action: ArenaAction): string {
  if (action.type === 'move') return `move ${action.edgeId}`
  if (action.type === 'collect') return `collect ${action.resourceId}`
  return action.type
}

export function friendlyActionLabel(action: ArenaAction): string {
  if (action.type === 'move') return `take ${routeLabel(action.edgeId)}`
  if (action.type === 'collect') return 'collect the core'
  if (action.type === 'bank') return 'bank cargo at base'
  if (action.type === 'drain') return 'drain the valley'
  return 'wait'
}

export function describeArenaDecision(
  agent: ArenaAgentState,
  options?: { observation?: ArenaObservation | null; flooded?: boolean },
): string {
  if (agent.recoveries > 0 && agent.lastOutcome?.reason === 'movement-blocked') {
    return 'Blocked route. Recovered to the last safe station.'
  }
  const caption = formatDecisionCaption({
    agent,
    observation: options?.observation,
    flooded: options?.flooded,
  })
  if (caption) return caption.line
  const outcome = agent.lastOutcome
  if (!outcome) return 'Waiting for the first observation.'
  if (!outcome.accepted) return `Action rejected: ${outcome.reason?.replaceAll('-', ' ')}.`
  if (outcome.action?.type === 'bank') return 'Delivered cargo to base.'
  if (outcome.action?.type === 'collect') return 'Collected an energy core.'
  if (outcome.action?.type === 'drain') return 'Spent energy to clear the low routes.'
  return 'Observing the next opportunity.'
}
