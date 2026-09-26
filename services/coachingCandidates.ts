import {
  rolloutOutcomeDelta,
  type ArenaAction,
  type ArenaObservation,
  type ArenaScenario,
  type ArenaSnapshot,
} from './arenaEpisode'
import { collectorPolicy } from './arenaPolicy'
import { classifyAction } from './policyModel'

/**
 * Outcome-verified coaching candidates (WS1.4). The human review moment is
 * the highest-signal frame in the product, so beside the keyword matcher we
 * propose up to `limit` ALTERNATIVE actions measured to out-bank the action
 * the rover actually took — via the same route-only counterfactual rollout
 * the CI syllabus uses (services/arenaEpisode.ts). Every number shown is
 * measured, never promised; the learner still only ever trains on notes a
 * human approved. Route-only deltas are exact on the abstract builder boards
 * and a stated estimate on physical courses (physics snapshots mis-price
 * travel time — COMPATIBILITY.md), so the rationale names the route model.
 */

export interface CoachingCandidate {
  action: ArenaAction
  delta120: number
  delta240: number
  rationale: string
}

export interface CandidateOptions {
  /** Minimum measured gain (progress score: 1 banked ≈ 3 cargo-equivalents)
   *  required at BOTH horizons before a candidate is shown. */
  minDelta?: number
  limit?: number
}

const actionKey = (a: ArenaAction) => JSON.stringify(a)

function describeAction(action: ArenaAction): string {
  switch (action.type) {
    case 'move': return `move along ${action.edgeId}`
    case 'collect': return 'collect now'
    case 'bank': return 'bank cargo'
    case 'drain': return 'drain energy'
    default: return 'hold position'
  }
}

/**
 * Rank same-state alternatives against `takenAction` at decision tick
 * `snapshot.tick`. Candidate set is bounded and deterministic:
 *  - every legal non-move action (wait / collect / bank / drain),
 *  - up to two extra roads in the SAME action class as the taken move
 *    (the junction corrections the v3 edge head can actually learn),
 *  - at most one road from each other move class that has no member yet.
 * A candidate only survives when it beats the taken action by `minDelta`
 * at both the 120- and 240-tick horizons (the CI-mining discipline:
 * single-horizon wins were measured to mislead on flood timing).
 */
export function rankCoachingCandidates(
  scenario: ArenaScenario,
  snapshot: ArenaSnapshot,
  observation: ArenaObservation,
  takenAction: ArenaAction,
  options: CandidateOptions = {},
): CoachingCandidate[] {
  const minDelta = options.minDelta ?? 1.0
  const limit = options.limit ?? 3
  const championContinuation = (obs: ArenaObservation) => collectorPolicy(obs, 'safe')
  const rivalContinuation = (obs: ArenaObservation) => collectorPolicy(obs, 'greedy')

  const travelTicks = (a: ArenaAction) =>
    a.type === 'move'
      ? observation.edges.find(e => e.id === a.edgeId)?.currentTravelTicks ?? Number.MAX_SAFE_INTEGER
      : 0
  const takenClass = classifyAction(takenAction, observation)

  const candidates: ArenaAction[] = []
  const usedKeys = new Set<string>([actionKey(takenAction)])
  const push = (a: ArenaAction) => {
    const key = actionKey(a)
    if (usedKeys.has(key)) return
    usedKeys.add(key)
    candidates.push(a)
  }

  for (const a of observation.availableActions) {
    if (a.type !== 'move') push(a)
  }
  const movesByClass = new Map<number, ArenaAction[]>()
  for (const a of observation.availableActions) {
    if (a.type !== 'move') continue
    const cls = classifyAction(a, observation)
    const list = movesByClass.get(cls) ?? []
    list.push(a)
    movesByClass.set(cls, list)
  }
  for (const [cls, list] of [...movesByClass.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...list].sort((a, b) =>
      travelTicks(a) - travelTicks(b) || actionKey(a).localeCompare(actionKey(b)))
    if (cls === takenClass) {
      for (const a of sorted.filter(x => actionKey(x) !== actionKey(takenAction)).slice(0, 2)) push(a)
    } else if (candidates.filter(c => c.type === 'move').length < 6) {
      push(sorted[0])
    }
  }

  const scored: CoachingCandidate[] = []
  for (const candidate of candidates.slice(0, 6)) {
    const delta120 = rolloutOutcomeDelta(
      scenario, snapshot, candidate, takenAction, championContinuation, rivalContinuation, 120,
    )
    if (delta120 < minDelta) continue
    const delta240 = rolloutOutcomeDelta(
      scenario, snapshot, candidate, takenAction, championContinuation, rivalContinuation, 240,
    )
    if (delta240 < minDelta) continue
    scored.push({
      action: candidate,
      delta120,
      delta240,
      rationale: `${describeAction(candidate)} measures +${delta120.toFixed(2)} over the next 120 ticks (route model; +${delta240.toFixed(2)} over 240) vs the taken action.`,
    })
  }
  scored.sort((a, b) => b.delta120 - a.delta120 || actionKey(a.action).localeCompare(actionKey(b.action)))
  return scored.slice(0, limit)
}
