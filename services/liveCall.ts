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
 *     champion prefers that destination (and the called edge when still legal)
 *     for the rest of the race. The call is also saved as a human-approved
 *     training example for Train. Scored Matches lock the whole surface (the
 *     coaching lock already exists for exactly this reason), so no call can
 *     ever influence a result.
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

/** Sticky preference resolved at call time and held for the rest of the run. */
export interface LiveCallPreference {
  /** Exact edge the player tapped — preferred whenever it is still legal. */
  calledEdgeId: string
  /**
   * Destination node of that edge from the call-time junction. When the
   * exact edge is gone (rover already left / different junction), any legal
   * move that reaches this node still honors the player's intent.
   */
  preferredNodeId: string
}

export type LiveCallApplyStatus = 'applied' | 'deferred'

export interface LiveCallApplyResult {
  action: ArenaAction
  status: LiveCallApplyStatus
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

/** Other end of an undirected edge from the rover's current node. */
export function edgeDestinationNode(
  edge: { from: string; to: string },
  fromNodeId: string,
): string {
  return edge.from === fromNodeId ? edge.to : edge.from
}

/**
 * Resolve the sticky preference at call time: remember both the tapped edge
 * and the destination node it was aiming for from this junction.
 */
export function resolveLiveCallPreference(
  observation: ArenaObservation,
  calledEdgeId: string,
): LiveCallPreference | null {
  const edge = observation.edges.find(candidate => candidate.id === calledEdgeId)
  if (!edge) return null
  return {
    calledEdgeId,
    preferredNodeId: edgeDestinationNode(edge, observation.self.nodeId),
  }
}

/**
 * Strong apply for a live call: take the called edge when legal; otherwise any
 * legal move that reaches the preferred destination node; otherwise fall
 * through to the base policy. `deferred` means the preference is queued until
 * the next legal junction — not discarded.
 */
export function applyLiveCallToAction(options: {
  observation: ArenaObservation
  preference: LiveCallPreference
  baseAction: ArenaAction
}): LiveCallApplyResult {
  const { observation, preference, baseAction } = options
  const legalMoves: { type: 'move'; edgeId: string }[] = []
  for (const action of observation.availableActions) {
    if (action.type === 'move') legalMoves.push(action as { type: 'move'; edgeId: string })
  }

  const exact = legalMoves.find(action => action.edgeId === preference.calledEdgeId)
  if (exact) return { action: exact, status: 'applied' }

  const toward = legalMoves.find(action => {
    const edge = observation.edges.find(candidate => candidate.id === action.edgeId)
    if (!edge) return false
    return edgeDestinationNode(edge, observation.self.nodeId) === preference.preferredNodeId
  })
  if (toward) return { action: toward, status: 'applied' }

  return { action: baseAction, status: 'deferred' }
}

/**
 * Wrap a policy so the called destination wins whenever a legal move can
 * honor it for the rest of the run. When neither the edge nor a path to the
 * destination is available (in transit, wrong junction), the base policy
 * drives until the next legal junction.
 */
export function wrapPolicyWithLiveCall(
  base: (observation: ArenaObservation) => ArenaAction,
  preference: LiveCallPreference,
): (observation: ArenaObservation) => ArenaAction {
  return (observation) => applyLiveCallToAction({
    observation,
    preference,
    baseAction: base(observation),
  }).action
}
