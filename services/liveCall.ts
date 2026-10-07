import type { ArenaAction, ArenaObservation } from './arenaEpisode'

/**
 * The mid-race coaching verb: "call the next route".
 *
 * A 60-second round asks the player to watch, and watching teaches nothing.
 * This gives the player one real decision while the race is live — pick the
 * route the champion should take at the next decision tick — so the coaching
 * loop closes during the run instead of only in post-hoc replay.
 *
 * Two rules keep this honest:
 *
 *  1. Choosing a route strongly applies to the current Practice/Rush run: the
 *     champion prefers that edge whenever it is legal for the rest of the race.
 *     The call is also saved as a human-approved training example for Train.
 *     Scored Matches lock the whole surface (the coaching lock already exists
 *     for exactly this reason), so no call can ever influence a result.
 *  2. It only offers routes the controller lists as legal, so a player can
 *     never queue an impossible lesson.
 */

export interface LiveCallContext {
  /** The tick the call will be attributed to — the next decision tick. */
  tick: number
  observation: ArenaObservation
  /** What the champion is about to do on its own, for comparison in the UI. */
  plannedAction: ArenaAction | null
  /** Legal alternative routes, ordered by travel cost (cheapest first). */
  routeOptions: { edgeId: string; label: string; travelTicks: number }[]
}

const CALL_INTERVAL_TICKS = 150
const MIN_TICKS_REMAINING = 200
const MIN_ROUTE_OPTIONS = 2

/**
 * Decide whether to offer a live call at this moment, and with which routes.
 * Returns null when the moment is not right — too early, too late, or when the
 * champion has no genuinely different route to choose between.
 */
export function liveCallContext(options: {
  tick: number
  durationTicks: number
  observation: ArenaObservation | null
  plannedAction: ArenaAction | null
  /** True once the player has already called this run. */
  alreadyCalled: boolean
}): LiveCallContext | null {
  if (options.alreadyCalled) return null
  if (!options.observation || !options.plannedAction) return null
  if (options.tick < CALL_INTERVAL_TICKS) return null
  if (options.durationTicks - options.tick < MIN_TICKS_REMAINING) return null
  // A rover mid-transit has already committed to its edge; the episode rejects
  // every alternative as `in-transit`. A call is only meaningful at a junction,
  // where the champion is choosing. Do not add our own transit check here —
  // `availableActions` is authoritative and carries that rule already.
  const plannedMove = options.plannedAction.type === 'move' ? options.plannedAction.edgeId : null
  const legalMoves = new Set<string>()
  for (const action of options.observation.availableActions) {
    if (action.type === 'move') legalMoves.add((action as { edgeId: string }).edgeId)
  }
  const routeOptions = options.observation.edges
    .filter(edge => legalMoves.has(edge.id))
    .filter(edge => edge.id !== plannedMove)
    .sort((a, b) => a.currentTravelTicks - b.currentTravelTicks)
    .slice(0, 3)
    .map(edge => ({ edgeId: edge.id, label: edge.id, travelTicks: edge.currentTravelTicks }))

  // One alternative is not a decision.
  if (routeOptions.length < MIN_ROUTE_OPTIONS) return null
  return { tick: options.tick, observation: options.observation, plannedAction: options.plannedAction, routeOptions }
}

/**
 * Strong apply for a live call: when the called edge is currently legal, take
 * it; otherwise fall through to the base policy action. Used both to divert
 * the live rover and as the pure predicate under test.
 */
export function applyLiveCallToAction(options: {
  observation: ArenaObservation
  calledEdgeId: string
  baseAction: ArenaAction
}): ArenaAction {
  for (const action of options.observation.availableActions) {
    if (action.type === 'move' && (action as { edgeId: string }).edgeId === options.calledEdgeId) {
      return action
    }
  }
  return options.baseAction
}

/**
 * Wrap a policy so the called edge wins whenever it is legal for the rest of
 * the run. When the edge is not available (in transit, wrong junction), the
 * base policy drives until it is.
 */
export function wrapPolicyWithLiveCall(
  base: (observation: ArenaObservation) => ArenaAction,
  calledEdgeId: string,
): (observation: ArenaObservation) => ArenaAction {
  return (observation) => applyLiveCallToAction({
    observation,
    calledEdgeId,
    baseAction: base(observation),
  })
}
