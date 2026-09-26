import { ARENA_RULES, type ArenaAction, type ArenaObservation } from './arenaEpisode'

/**
 * Trip-horizon clock constant for the patience rule: only sit on the pad
 * recharging when enough ticks remain to actually finish another trip.
 * Observation-derived predicate — never a progress constant like banked≥N.
 */
export const TRIP_HORIZON_TICKS = 400

interface Route {
  cost: number
  firstEdge: string | null
}

/** Flood-aware shortest route (currentTravelTicks weights), the metric every executor sees. */
function routeFrom(observation: ArenaObservation, from: string, target: string): Route | null {
  if (!observation.nodes.some(node => node.id === target)) return null
  const routes = new Map<string, Route>([[from, { cost: 0, firstEdge: null }]])
  const visited = new Set<string>()
  while (visited.size < observation.nodes.length) {
    const next = [...routes.entries()]
      .filter(([id]) => !visited.has(id))
      .sort(([idA, a], [idB, b]) => a.cost - b.cost || (idA < idB ? -1 : idA > idB ? 1 : 0))[0]
    if (!next) return null
    const [nodeId, route] = next
    if (nodeId === target) return route
    visited.add(nodeId)
    for (const edge of observation.edges) {
      if (edge.blocked || (edge.from !== nodeId && edge.to !== nodeId)) continue
      const neighbor = edge.from === nodeId ? edge.to : edge.from
      if (visited.has(neighbor)) continue
      const cost = route.cost + edge.currentTravelTicks
      const previous = routes.get(neighbor)
      if (!previous || cost < previous.cost) routes.set(neighbor, { cost, firstEdge: route.firstEdge ?? edge.id })
    }
  }
  return null
}

/** Far node of an incident edge. Only meaningful for edges touching self.nodeId. */
function edgeTarget(observation: ArenaObservation, edgeId: string): string | null {
  const edge = observation.edges.find(candidate => candidate.id === edgeId)
  if (!edge) return null
  const self = observation.self
  if (edge.from !== self.nodeId && edge.to !== self.nodeId) return null
  return edge.from === self.nodeId ? edge.to : edge.from
}

function isLegal(observation: ArenaObservation, action: ArenaAction): boolean {
  const key = JSON.stringify(action)
  return observation.availableActions.some(candidate => JSON.stringify(candidate) === key)
}

/**
 * Known reachable pickup targets in routing order: certain (non-stale) first,
 * then cheapest flood-aware route, id tie-break. Shared by the patience rule
 * so teacher and student gate on identical target selection.
 */
function routeTargets(observation: ArenaObservation): Route[] {
  const capacityLeft = ARENA_RULES.capacity - observation.self.cargo
  return observation.resources
    .filter(resource => resource.available && resource.value <= capacityLeft)
    .map(resource => ({ resource, route: routeFrom(observation, observation.self.nodeId, resource.nodeId) }))
    .filter((entry): entry is { resource: typeof entry.resource; route: Route } => entry.route !== null && entry.route.firstEdge !== null)
    .sort((a, b) => {
      if (a.resource.stale !== b.resource.stale) return a.resource.stale ? 1 : -1
      return a.route.cost - b.route.cost || (a.resource.id < b.resource.id ? -1 : a.resource.id > b.resource.id ? 1 : 0)
    })
    .map(entry => entry.route)
}

/**
 * The single execution contract every in-run policy honors — teacher, rival
 * baseline, and learned student alike. Predicates are observation-only;
 * progress constants (banked===N) are banned here because they encode
 * specific scenario shapes instead of gameplay rules.
 *
 *  1. auto-bank: at base with cargo, banking is the only scoring action.
 *  2. on-node collect: a legal pickup into a free slot beats departing.
 *  3. committed return: full bay, no known resources left, or the clock
 *     leaving no slack for a detour — take the home route, stop freelancing.
 *  4. no retreat hop: carrying with nothing visible on the radar is an
 *     energy trap — convert a home-distance-increasing hop into the
 *     homeward one.
 *  5. patience when gated: at base, empty bay, clock with a trip left — when
 *     the routing hop is energy-gated and the affordable hop lands barren,
 *     recharge instead of wasting the trip.
 */
export function applyControllerRules(observation: ArenaObservation, proposed: ArenaAction): ArenaAction {
  if (!observation.decisionDue || observation.availableActions.length === 0) return { type: 'wait' }
  const self = observation.self

  // Episode semantics: an illegal proposal is rejected and behaves as wait.
  const action = isLegal(observation, proposed) ? proposed : ({ type: 'wait' } as ArenaAction)

  const legalMove = (edgeId: string | null): ArenaAction | null =>
    edgeId !== null &&
    observation.availableActions.some(a => a.type === 'move' && (a as { edgeId?: string }).edgeId === edgeId)
      ? { type: 'move', edgeId }
      : null

  // 1. auto-bank
  if (self.cargo > 0) {
    const bank = observation.availableActions.find(a => a.type === 'bank')
    if (bank) return bank
  }

  const homeRoute = routeFrom(observation, self.nodeId, self.baseNode)
  const committed = self.cargo > 0 && (
    self.cargo >= ARENA_RULES.capacity ||
    observation.resources.length === 0 ||
    (homeRoute !== null && observation.remainingTicks <= homeRoute.cost + ARENA_RULES.decisionEveryTicks * 2)
  )

  // 2. on-node collect (unless the return is already committed)
  if (!committed) {
    const collect = observation.availableActions.find(a => a.type === 'collect')
    if (collect) return collect
  }

  // 3. committed return
  if (committed) {
    const hop = legalMove(homeRoute?.firstEdge ?? null)
    if (!hop) return { type: 'wait' }
    if (action.type === 'move') {
      const target = edgeTarget(observation, action.edgeId)
      const fromTarget = target === null ? null : routeFrom(observation, target, self.baseNode)
      if (fromTarget !== null && fromTarget.cost < homeRoute!.cost - 1e-6) return action
    }
    return hop
  }

  // 4. no retreat hop
  if (
    self.cargo > 0 &&
    action.type === 'move' &&
    !observation.resources.some(r => r.available && r.visible)
  ) {
    const hereCost = homeRoute?.cost ?? Infinity
    const target = edgeTarget(observation, action.edgeId)
    const fromTarget = target === null ? null : routeFrom(observation, target, self.baseNode)?.cost ?? null
    if (fromTarget !== null && fromTarget > hereCost + 1e-6) {
      const hop = legalMove(homeRoute?.firstEdge ?? null)
      if (hop) return hop
    }
  }

  // 5. patience when gated
  if (
    self.cargo === 0 &&
    self.transit === null &&
    self.nodeId === self.baseNode &&
    action.type === 'move' &&
    observation.remainingTicks > TRIP_HORIZON_TICKS &&
    isLegal(observation, { type: 'wait' })
  ) {
    const desired = routeTargets(observation)[0]
    const desiredEdgeId = desired?.firstEdge ?? null
    if (desiredEdgeId && desiredEdgeId !== action.edgeId && legalMove(desiredEdgeId) === null) {
      const desiredEdge = observation.edges.find(e => e.id === desiredEdgeId)
      const gatedNotGhosts = desiredEdge && !desiredEdge.blocked &&
        (desiredEdge.from === self.nodeId || desiredEdge.to === self.nodeId)
      if (gatedNotGhosts) {
        const cheapTarget = edgeTarget(observation, action.edgeId)
        const capacityLeft = ARENA_RULES.capacity - self.cargo
        const cheapHasCore = observation.resources.some(
          r => r.available && r.nodeId === cheapTarget && r.value <= capacityLeft,
        )
        if (!cheapHasCore) return { type: 'wait' }
      }
    }
  }

  return action
}
