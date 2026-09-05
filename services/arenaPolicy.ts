import {
  ARENA_RULES,
  ArenaEpisode,
  type ArenaAction,
  type ArenaObservation,
  type ArenaScenario,
} from './arenaEpisode'

import type { ArenaMotion } from './arenaPhysics'

export type CollectorStrategy = 'safe' | 'greedy' | 'weather'

type Route = { cost: number; firstEdge: string | null }

export function findArenaRoute(observation: ArenaObservation, target: string, strategy: CollectorStrategy): Route | null {
  if (!observation.nodes.some(node => node.id === target)) return null
  const routes = new Map<string, Route>([[observation.self.nodeId, { cost: 0, firstEdge: null }]])
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
      const cost = route.cost + (strategy === 'safe' ? edge.currentTravelTicks : edge.travelTicks)
      const previous = routes.get(neighbor)
      if (!previous || cost < previous.cost) routes.set(neighbor, { cost, firstEdge: route.firstEdge ?? edge.id })
    }
  }
  return null
}

export function collectorPolicy(observation: ArenaObservation, strategy: CollectorStrategy): ArenaAction {
  const wait: ArenaAction = { type: 'wait' }
  if (!observation.decisionDue) return wait
  const available = observation.availableActions
  if (strategy === 'weather' && observation.self.transit &&
      observation.edges.some(edge => edge.id === observation.self.transit?.edgeId && edge.floodable) &&
      available.some(action => action.type === 'drain')) return { type: 'drain' }
  if (observation.self.transit) return wait
  if (available.some(action => action.type === 'bank')) return { type: 'bank' }
  const home = findArenaRoute(observation, observation.self.baseNode, strategy)
  const shouldBank = observation.self.cargo > 0 && (
    observation.self.cargo >= ARENA_RULES.capacity || observation.resources.length === 0 ||
    (home !== null && observation.remainingTicks <= home.cost + ARENA_RULES.decisionEveryTicks * 2)
  )
  if (shouldBank) return home?.firstEdge ? { type: 'move', edgeId: home.firstEdge } : wait
  const collect = available.find(action => action.type === 'collect')
  if (collect) return collect
  const targets = observation.resources
    .filter(resource => resource.value + observation.self.cargo <= ARENA_RULES.capacity)
    .map(resource => ({ resource, route: findArenaRoute(observation, resource.nodeId, strategy) }))
    .filter((entry): entry is typeof entry & { route: Route } => entry.route !== null)
    .sort((a, b) => a.route.cost - b.route.cost || (a.resource.id < b.resource.id ? -1 : a.resource.id > b.resource.id ? 1 : 0))
  const route = targets[0]?.route
  if (route?.firstEdge) return { type: 'move', edgeId: route.firstEdge }
  return observation.self.cargo > 0 && home?.firstEdge ? { type: 'move', edgeId: home.firstEdge } : wait
}

export class ArenaRunner {
  #episode: ArenaEpisode
  #strategies: Map<string, CollectorStrategy>
  #durationTicks: number
  #accumulatedUs = 0

  constructor(scenario: ArenaScenario, strategies: Record<string, CollectorStrategy>, motion?: ArenaMotion) {
    this.#strategies = new Map()
    const entrants = scenario.entrants.map(entrant => {
      const strategy = strategies[entrant.id]
      if (strategy !== 'safe' && strategy !== 'greedy' && strategy !== 'weather') throw new Error(`Missing or unsupported baseline for ${entrant.id}`)
      this.#strategies.set(entrant.id, strategy)
      return { ...entrant, policyVersion: `baseline.${strategy}.v2` }
    })
    this.#episode = new ArenaEpisode({ ...scenario, entrants }, motion)
    this.#durationTicks = scenario.durationTicks
  }

  get interpolation() {
    return Math.min(1, this.#accumulatedUs / (ARENA_RULES.stepMs * 1000))
  }

  snapshot() {
    return this.#episode.snapshot()
  }

  observe(agentId: string) {
    return this.#episode.observe(agentId)
  }

  recording() {
    return this.#episode.recording()
  }

  reset() {
    this.#accumulatedUs = 0
    this.#episode.reset()
  }

  advanceMicroseconds(elapsedUs: number, maxTicks: number = ARENA_RULES.maxDurationTicks) {
    if (!Number.isSafeInteger(elapsedUs) || elapsedUs < 0 || !Number.isSafeInteger(this.#accumulatedUs + elapsedUs)) {
      throw new Error('Elapsed microseconds must be a nonnegative safe integer')
    }
    if (!Number.isSafeInteger(maxTicks) || maxTicks < 1 || maxTicks > ARENA_RULES.maxDurationTicks) throw new Error('Invalid pump budget')
    if (this.#episode.finished) return 0
    this.#accumulatedUs += elapsedUs
    const stepUs = ARENA_RULES.stepMs * 1000
    const count = Math.min(Math.floor(this.#accumulatedUs / stepUs), this.#durationTicks - this.#episode.tick, maxTicks)
    const advanced = this.advanceTicks(count)
    this.#accumulatedUs = this.#episode.finished ? 0 : this.#accumulatedUs - advanced * stepUs
    return advanced
  }

  advanceTicks(count: number) {
    if (!Number.isSafeInteger(count) || count < 0 || count > ARENA_RULES.maxDurationTicks) throw new Error('Invalid tick count')
    let advanced = 0
    while (advanced < count && !this.#episode.finished) {
      const tick = this.#episode.tick
      const requests = tick % ARENA_RULES.decisionEveryTicks === 0
        ? [...this.#strategies].map(([agentId, strategy]) => ({
          agentId,
          tick,
          action: collectorPolicy(this.#episode.observe(agentId), strategy),
        }))
        : []
      this.#episode.step(requests)
      advanced += 1
    }
    if (this.#episode.finished) this.#accumulatedUs = 0
    return advanced
  }
}

export function runArenaEpisode(scenario: ArenaScenario, strategies: Record<string, CollectorStrategy>) {
  const runner = new ArenaRunner(scenario, strategies)
  runner.advanceTicks(scenario.durationTicks)
  return { final: runner.snapshot(), replay: runner.recording() }
}
