import {
  ARENA_RULES,
  capacityOf,
  ArenaEpisode,
  type ArenaAction,
  type ArenaObservation,
  type ArenaOutcome,
  type ArenaScenario,
} from './arenaEpisode'

import type { ArenaMotion } from './arenaPhysics'
import { applyControllerRules } from './arenaControllerRules'
import {
  type PolicyCheckpoint,
  SEASON_0_BASE_CHECKPOINT,
  createLearnedPolicy,
} from './policyModel'
import { wrapPolicyWithLiveCall, type LiveCallPreference } from './liveCall'

export type CollectorStrategy = 'safe' | 'greedy' | 'weather' | 'learned' | 'poach'

export type EntrantPolicyOption =
  | CollectorStrategy
  | {
      strategy: 'learned'
      checkpoint: PolicyCheckpoint
    }

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
  // Twin-arm integrity (Sep 23, grounded-leg guard):
  // - SWIM arm (in transit on a flooded edge, drain legal): drain clears the
  //   water being swum through. Demonstrated.
  // - RESTRAINT arm: at a station, flooded, drain AVAILABLE, cargo aboard —
  //   safe says move/collect/bank (drain is never worth 2 energy + 50 ticks
  //   at a station: the rollout verdict is ~0/94 states). The head must see
  //   drain-available-but-don't: without these the base fallback's
  //   drain-bias fires on grounded boards (practice t130: drain with empty
  //   cargo at base, 9→3 regression).
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
  if (
    self.transit === null &&
    observation.weather.flooded &&
    self.cargo > 0 &&
    available.some(action => action.type === 'drain')
  ) {
    // Restraint: the oracle's answer here is whatever safe says (route /
    // collect / bank) — the lesson is NOT-drain, recorded via the contrast
    // original (drain) in buildSyntheticExamples.
    const restrained = collectorPolicy(observation, 'safe')
    if (restrained.type !== 'drain') {
      return {
        action: restrained,
        teacher: 'weather',
        reason: 'At a station with drain available; routing/collecting beats spending 2 energy + 50 ticks.',
      }
    }
  }
  // Patience teacher: sit out the flood when stranded with cargo.
  // Fires at stations (transit null) while flooded, carrying cargo, drain
  // unavailable — waiting beats paying 4x. ALSO fires in transit when wait
  // is literally the only legal action during a flood: the base policy's
  // failure mode is predicting drain/move there (untrained fallback), so a
  // wait label teaches the fallback head that patience is legal.
  //
  // SCOPE (integrity): station waits fire ONLY while flooded. Dry-station
  // waits are never demonstrated — safe routes on dry boards, and a wait
  // label on a dry board teaches the head that standing still is strategy.
  // (Sep 23: 10 dry waits leaked via the transit ride-out arm on boards
  // where flood ended mid-transit; the head generalized wait→dry-station
  // and oscillated cross-n/valley-n1 on heldout-02 scoring 0. Restricted
  // to flooded ticks; dry patience is the human coach's lesson.)
  const noDrain = !available.some(action => action.type === 'drain')
  if (!observation.weather.flooded || !noDrain || self.cargo === 0) {
    // Not a patience situation — fall through to safe routing below.
  } else if (self.transit === null) {
    const moves = available.filter(a => a.type === 'move')
    if (moves.length >= 1) {
      return {
        action: { type: 'wait' },
        teacher: 'patience',
        reason: 'Flooded at a station with cargo and no drain; waiting beats the 4x valley cost.',
      }
    }
  } else if (available.length === 1 && available[0].type === 'wait') {
    return {
      action: { type: 'wait' },
      teacher: 'patience',
      reason: 'In transit through flood water with no intervention available; riding it out.',
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
/**
 * `rivalHint` is a house-director privilege: the live episode may hand the
 * `poach` baseline the opponent's destination node so the show rival can
 * intercept where the champion is *going* (fog hides it until adjacent).
 * Entrant-facing strategies never receive it — the observation contract
 * stands untouched.
 */
export function collectorPolicy(
  observation: ArenaObservation,
  strategy: CollectorStrategy,
  rivalHint?: () => { targetNodeId: string | null },
): ArenaAction {
  if (!observation.decisionDue) return { type: 'wait' }
  return applyControllerRules(observation, proposeCollectorAction(observation, strategy, rivalHint))
}

function proposeCollectorAction(observation: ArenaObservation, strategy: CollectorStrategy, rivalHint?: () => { targetNodeId: string | null }): ArenaAction {
  const wait: ArenaAction = { type: 'wait' }
  const available = observation.availableActions
  if (strategy === 'weather' && observation.self.transit &&
      observation.edges.some(edge => edge.id === observation.self.transit?.edgeId && edge.floodable) &&
      available.some(action => action.type === 'drain')) return { type: 'drain' }
  if (observation.self.transit) return wait
  if (available.some(action => action.type === 'bank')) return { type: 'bank' }
  const home = findArenaRoute(observation, observation.self.baseNode, strategy === 'learned' ? 'safe' : strategy)
  const shouldBank = observation.self.cargo > 0 && (
    observation.self.cargo >= capacityOf(observation.self) || observation.resources.length === 0 ||
    (home !== null && observation.remainingTicks <= home.cost + ARENA_RULES.decisionEveryTicks * 2)
  )
  if (shouldBank) return home?.firstEdge ? { type: 'move', edgeId: home.firstEdge } : wait
  const collect = available.find(action => action.type === 'collect')
  if (collect) return collect
  // Poach: the house agitator. Fog hides the rival until it is adjacent, so
  // the runner passes a director hint with the champion's destination — the
  // poacher intercepts where the champion is *going* rather than where it
  // was, which is what actually produces a meeting. Without the hint it
  // races to the node nearest a visible rival. Controller rules (auto-bank,
  // forced homeward when the radar is bare) still govern it like anyone else.
  if (strategy === 'poach') {
    const hintedTarget = rivalHint?.()?.targetNodeId ?? null
    const seen = !hintedTarget
      ? observation.rivals.find(candidate => candidate.visible && candidate.position)
      : undefined
    const targetId = hintedTarget ?? (seen?.position
      ? observation.nodes
          .map(node => ({ node, d: Math.hypot(node.position[0] - seen.position![0], node.position[2] - seen.position![2]) }))
          .sort((a, b) => a.d - b.d || (a.node.id < b.node.id ? -1 : 1))[0]?.node.id ?? null
      : null)
    if (targetId && targetId !== observation.self.nodeId) {
      const contest = findArenaRoute(observation, targetId, 'greedy')
      if (contest?.firstEdge) return { type: 'move', edgeId: contest.firstEdge }
    }
  }
  const targets = observation.resources
    .filter(resource => resource.value + observation.self.cargo <= capacityOf(observation.self))
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

  constructor(scenario: ArenaScenario, strategies: Record<string, EntrantPolicyOption>, motion?: ArenaMotion, options?: { record?: boolean }) {
    this.#policies = new Map()
    const entrants = scenario.entrants.map(entrant => {
      const option = strategies[entrant.id]
      const strategy: CollectorStrategy = typeof option === 'string' ? option : option?.strategy
      if (strategy !== 'safe' && strategy !== 'greedy' && strategy !== 'weather' && strategy !== 'learned' && strategy !== 'poach') {
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

      // House-director privilege: `poach` is a pacing device, not an entrant,
      // so it may consult the opponent's true destination. The closure reads
      // the episode lazily (assigned just below) at decision time.
      this.#policies.set(entrant.id, (obs: ArenaObservation) => collectorPolicy(
        obs,
        strategy,
        strategy === 'poach'
          ? () => {
              const foe = this.#episode.peek().agents.find(agent => agent.id !== entrant.id)
              return { targetNodeId: foe ? (foe.transit?.to ?? foe.nodeId) : null }
            }
          : undefined,
      ))
      return { ...entrant, policyVersion: `baseline.${strategy}.v2` }
    })
    this.#episode = new ArenaEpisode({ ...scenario, entrants }, motion, options)
    this.#durationTicks = scenario.durationTicks
  }

  /**
   * Divert an entrant for the rest of this run toward the called destination:
   * prefer the exact edge when legal, else any legal move to the preferred
   * node; otherwise keep the prior policy until the next legal junction.
   * Live Call uses this so a mid-race choice actually steers the rover (and
   * still saves as a training example).
   */
  forceRoutePreference(agentId: string, preference: LiveCallPreference) {
    const base = this.#policies.get(agentId)
    if (!base) throw new Error(`Unknown entrant ${agentId}`)
    this.#policies.set(agentId, wrapPolicyWithLiveCall(base, preference))
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

  /** Live episode state for rAF consumers. Do not mutate. */
  peek() {
    return this.#episode.peek()
  }

  get finished() {
    return this.#episode.finished
  }

  observe(agentId: string, options?: { forceDecision?: boolean }) {
    return this.#episode.observe(agentId, options)
  }

  recording() {
    return this.#episode.recording()
  }

  applyEncounterClash(args: {
    winnerId: string
    loserId: string
    transferCargo: boolean
    staggerTicks: number
  }) {
    return this.#episode.applyEncounterClash(args)
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
