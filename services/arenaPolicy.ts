import {
  ARENA_RULES,
  ArenaEpisode,
  type ArenaAction,
  type ArenaObservation,
  type ArenaOutcome,
  type ArenaScenario,
} from './arenaEpisode'

import type { ArenaMotion } from './arenaPhysics'
import {
  type PolicyCheckpoint,
  SEASON_0_BASE_CHECKPOINT,
  createLearnedPolicy,
} from './policyModel'

export type CollectorStrategy = 'safe' | 'greedy' | 'weather' | 'learned'

export type EntrantPolicyOption = CollectorStrategy | { strategy: 'learned'; checkpoint: PolicyCheckpoint }

export interface DecisionLifecycleEvent {
  agentId: string
  sequence: number
  tick: number
  action: ArenaAction
  outcome: ArenaOutcome
}

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

export type OracleTeacher = 'safe' | 'weather' | 'patience'

export interface OracleLabel {
  action: ArenaAction
  teacher: OracleTeacher
  reason: string
}

/**
 * Route one observation to the single honest teacher.
 *
 * - `weather` owns drain timing: it fires only while in transit on a
 *   floodable edge with drain legal (the one situation where drain is
 *   provably useful — it clears the water the rover is swimming through).
 * - `patience` owns flood timing: at a station, flooded, carrying cargo,
 *   with no drain available — waiting out the water beats paying 4x.
 * - `safe` owns everything else: flood-aware routing, collect, bank.
 *
 * Returns null when no teacher is honest here (e.g. in-transit ticks where
 * wait is the only legal action — there is nothing worth learning).
 */
export function routeOracle(observation: ArenaObservation): OracleLabel | null {
  const available = observation.availableActions
  const self = observation.self
  // Weather teacher: drain while swimming through flood water.
  // NOTE: weather fires ~never on the oracle's own rollout path because safe
  // never enters flood water in transit (it routes around). Weather labels
  // come from learner-disagreement states (see buildSyntheticExamples): where
  // the base policy HAS wandered into flood water, drain is demonstrated.
  if (
    self.transit &&
    observation.weather.flooded &&
    observation.edges.some(edge => edge.id === self.transit?.edgeId && edge.floodable) &&
    available.some(action => action.type === 'drain')
  ) {
    return {
      action: { type: 'drain' },
      teacher: 'weather',
      reason: 'In transit on a flooded edge; draining clears the water being swum through.',
    }
  }
  // Patience teacher: sit out the flood when stranded with cargo.
  // Fires at stations (transit null) while flooded, carrying cargo, drain
  // unavailable — waiting beats paying 4x. ALSO fires in transit when wait
  // is literally the only legal action during a flood: the base policy's
  // failure mode is predicting drain/move there (untrained fallback), so a
  // wait label teaches the fallback head that patience is legal.
  if (observation.weather.flooded && self.cargo > 0 && !available.some(action => action.type === 'drain')) {
    const moves = available.filter(a => a.type === 'move')
    if (self.transit === null && moves.length >= 1) {
      return {
        action: { type: 'wait' },
        teacher: 'patience',
        reason: 'Flooded at a station with cargo and no drain; waiting beats the 4x valley cost.',
      }
    }
    if (self.transit !== null && available.length === 1 && available[0].type === 'wait') {
      return {
        action: { type: 'wait' },
        teacher: 'patience',
        reason: 'In transit through flood water with no intervention available; riding it out.',
      }
    }
  }
  // Safe teacher: everything else, via the flood-aware router.
  const fallback = collectorPolicy(observation, 'safe')
  if (self.transit && fallback.type === 'wait' && available.length <= 1) return null
  const teacher: OracleTeacher = 'safe'
  const reason =
    fallback.type === 'bank' ? 'At base with cargo; banking is the only scoring action.'
    : fallback.type === 'collect' ? 'Resource available at station; collecting into cargo.'
    : fallback.type === 'move' ? 'Flood-aware route toward the best reachable target.'
    : 'No productive action; holding position.'
  return { action: fallback, teacher, reason }
}

/**
 * Oracle router: ask each teacher only where it is honest.
 *
 * - `weather` owns drain timing: it drains only while in transit on a
 *   floodable edge (the one situation where drain is provably useful). Its
 *   move/collect/bank opinions are ignored — it is not a router.
 * - `patience` owns flood timing: at a station, flooded, carrying cargo that
 *   drain cannot help (no drain available), waiting out the water beats paying
 *   4x. It only ever says wait, and only there.
 * - `safe` owns everything else: flood-aware Dijkstra routing, collect, bank.
 *
 * Returns the routed action plus provenance, or null when no teacher is
 * honest here (e.g. in-transit ticks where wait is the only legal action —
 * there is nothing to learn).
 *
 * Baseline entry point (unchanged semantics): run one named strategy.
 */
export function collectorPolicy(observation: ArenaObservation, strategy: CollectorStrategy): ArenaAction {
  const wait: ArenaAction = { type: 'wait' }
  if (!observation.decisionDue) return wait
  const available = observation.availableActions
  if (strategy === 'weather' && observation.self.transit &&
      observation.edges.some(edge => edge.id === observation.self.transit?.edgeId && edge.floodable) &&
      available.some(action => action.type === 'drain')) return { type: 'drain' }
  if (observation.self.transit) return wait
  if (available.some(action => action.type === 'bank')) return { type: 'bank' }
  const home = findArenaRoute(observation, observation.self.baseNode, strategy === 'learned' ? 'safe' : strategy)
  const shouldBank = observation.self.cargo > 0 && (
    observation.self.cargo >= ARENA_RULES.capacity || observation.resources.length === 0 ||
    (home !== null && observation.remainingTicks <= home.cost + ARENA_RULES.decisionEveryTicks * 2)
  )
  if (shouldBank) return home?.firstEdge ? { type: 'move', edgeId: home.firstEdge } : wait
  const collect = available.find(action => action.type === 'collect')
  if (collect) return collect
  const targets = observation.resources
    .filter(resource => resource.value + observation.self.cargo <= ARENA_RULES.capacity)
    .map(resource => ({ resource, route: findArenaRoute(observation, resource.nodeId, strategy === 'learned' ? 'safe' : strategy) }))
    .filter((entry): entry is typeof entry & { route: Route } => entry.route !== null)
    .sort((a, b) => {
      // Prefer visible (certain) resources over stale (uncertain) ones
      const aStale = 'stale' in a.resource ? (a.resource as { stale: boolean }).stale : false
      const bStale = 'stale' in b.resource ? (b.resource as { stale: boolean }).stale : false
      if (aStale !== bStale) return aStale ? 1 : -1
      // Greedy strategy: prefer high value-per-cost ratio (creates resource contention)
      if (strategy === 'greedy') {
        const aScore = a.resource.value / Math.max(1, a.route.cost)
        const bScore = b.resource.value / Math.max(1, b.route.cost)
        if (bScore !== aScore) return bScore - aScore
      }
      return a.route.cost - b.route.cost || (a.resource.id < b.resource.id ? -1 : a.resource.id > b.resource.id ? 1 : 0)
    })
  const route = targets[0]?.route
  if (route?.firstEdge) return { type: 'move', edgeId: route.firstEdge }
  return observation.self.cargo > 0 && home?.firstEdge ? { type: 'move', edgeId: home.firstEdge } : wait
}

export class ArenaRunner {
  #episode: ArenaEpisode
  #policies: Map<string, (obs: ArenaObservation) => ArenaAction>
  #durationTicks: number
  #accumulatedUs = 0
  #sequence = 0
  #onDecision: ((event: DecisionLifecycleEvent) => void) | null = null

  constructor(scenario: ArenaScenario, strategies: Record<string, EntrantPolicyOption>, motion?: ArenaMotion) {
    this.#policies = new Map()
    const entrants = scenario.entrants.map(entrant => {
      const option = strategies[entrant.id]
      const strategy: CollectorStrategy = typeof option === 'string' ? option : option?.strategy
      if (strategy !== 'safe' && strategy !== 'greedy' && strategy !== 'weather' && strategy !== 'learned') {
        throw new Error(`Missing or unsupported baseline for ${entrant.id}`)
      }

      if (strategy === 'learned') {
        const checkpoint = typeof option === 'object' && 'checkpoint' in option ? option.checkpoint : SEASON_0_BASE_CHECKPOINT
        this.#policies.set(entrant.id, createLearnedPolicy(checkpoint))
        // Scenario validation requires policyVersion to match the identifier
        // pattern (no colons), so we expose a sanitized view of the checkpoint
        // id rather than its raw value.
        return { ...entrant, policyVersion: `learned.${checkpoint.weightsHash.slice(0, 12)}` }
      }

      this.#policies.set(entrant.id, (obs: ArenaObservation) => collectorPolicy(obs, strategy))
      return { ...entrant, policyVersion: `baseline.${strategy}.v2` }
    })
    this.#episode = new ArenaEpisode({ ...scenario, entrants }, motion)
    this.#durationTicks = scenario.durationTicks
  }

  setDecisionListener(listener: ((event: DecisionLifecycleEvent) => void) | null) {
    this.#onDecision = listener
  }

  get interpolation() {
    return Math.min(1, this.#accumulatedUs / (ARENA_RULES.stepMs * 1000))
  }

  snapshot() {
    return this.#episode.snapshot()
  }

  observe(agentId: string, options?: { forceDecision?: boolean }) {
    return this.#episode.observe(agentId, options)
  }

  recording() {
    return this.#episode.recording()
  }

  reset() {
    this.#accumulatedUs = 0
    this.#sequence = 0
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
        ? [...this.#policies].map(([agentId, policy]) => {
          const observation = this.#episode.observe(agentId)
          const action = policy(observation)
          const sequence = ++this.#sequence
          return { agentId, tick, action, sequence }
        })
        : []
      const outcomes = this.#episode.step(requests.map(({ agentId, tick, action }) => ({ agentId, tick, action })))
      if (this.#onDecision && requests.length > 0) {
        for (const request of requests) {
          const outcome = outcomes.find(o => o.agentId === request.agentId) ?? null
          if (outcome) {
            this.#onDecision({
              agentId: request.agentId,
              sequence: request.sequence,
              tick,
              action: request.action,
              outcome,
            })
          }
        }
      }
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
