import type { ArenaMotion } from './arenaPhysics'

export const ARENA_RULES = Object.freeze({
  version: 'season-0.reference.3',
  stepMs: 50,
  decisionEveryTicks: 5,
  maxDurationTicks: 7200,
  capacity: 3,
  initialEnergy: 12,
  // v3 keeps the v2 fee ladder and regen rate — cheaper energy (0.02 fee or
  // 0.15 regen) broke teacher parity / flipped a pinned decision frame even
  // after the v3 committed-return tightening. The shipped v3 economy fix is
  // the un-taxed wait: recharging no longer pays a regen penalty for the
  // accepted wait itself.
  moveCostPerTick: 0.03,
  idleRegenPerTick: 0.1,
  drainCost: 2,
  drainTicks: 50,
  drainCooldownTicks: 150,
  floodTravelMultiplier: 4,
  maxBlockedTicks: 40,
  arrivalTolerance: 0.07,
  groundingTolerance: 0.25,
})

export type ArenaPosition = [number, number, number]
export type ArenaNode = { id: string; position: ArenaPosition }
export type ArenaEdge = { id: string; from: string; to: string; travelTicks: number; floodable: boolean; path?: ArenaPosition[] }
/** `spawnTick`: the core is hidden and uncollectable until that tick (Rush waves). */
export type ArenaResource = { id: string; nodeId: string; value: number; spawnTick?: number }
/**
 * Optional per-entrant overrides (chassis builds). Absent means the pinned
 * ARENA_RULES apply unchanged, so existing scenarios and recordings replay
 * identically.
 */
export type EntrantTraits = {
  /** Multiplier on travel progress per tick (1 = pinned speed). */
  travelSpeed: number
  /** Battery capacity: starting energy and the regen cap. */
  maxEnergy: number
  /** Positive wins bumps: the entrant with the higher (cargo - strength) loses. */
  contactStrength: number
  /** Cargo capacity (Skirmish ruleset); absent = ARENA_RULES.capacity. */
  capacity?: number
  /** Bump winner takes the loser's whole cargo (up to own space), not one unit. */
  stealAll?: boolean
  /** Fog radius in graph hops (1 = pinned rules). */
  visionHops?: number
  /**
   * Skirmish capacity tax: each cargo unit above the pinned base capacity (3)
   * multiplies travel by (1 - tax). The extra Hauler slot is real; a full bed
   * is slower. Absent = 0 (Season 0 unchanged).
   */
  cargoTravelTax?: number
  /**
   * Extra metres added to the scenario contact radius when either rover has it.
   * Raider steal fantasy: wider bump reach without a travel lead that races Scout.
   * Absent = 0.
   */
  contactRadiusBonus?: number
}
export function capacityOf(agent: { traits?: EntrantTraits }): number {
  return agent.traits?.capacity ?? ARENA_RULES.capacity
}
export type ArenaEntrant = { id: string; baseNode: string; policyVersion: string; traits?: EntrantTraits }

export interface ArenaScenario {
  id: string
  worldVersion: string
  split: 'practice' | 'evaluation'
  seed: number
  durationTicks: number
  nodes: ArenaNode[]
  edges: ArenaEdge[]
  entrants: ArenaEntrant[]
  /** Named ruleset (e.g. 'skirmish'); absent = Training Grounds (Season 0). */
  rulesetId?: string
  resources: ArenaResource[]
  floods: { startTick: number; endTick: number }[]
  /** Present only in Rush scenarios: enables authoritative rover-vs-rover contact. */
  rush?: ArenaRushRules
}

/**
 * Public timetable entry for a Rush wave: the core `resourceId` is guaranteed to
 * spawn inside [windowStart, windowEnd]. Disclosed to policies as the additive
 * `rushWaves` observation field; it never changes simulation behavior.
 */
export type ArenaRushWave = { resourceId: string; windowStart: number; windowEnd: number }

export type ArenaRushRules = {
  /** Route-reference distance (m) at which two rovers bump. */
  contactRadiusM: number
  /** Ticks the bump loser may only `wait`. */
  bumpStaggerTicks: number
  /** Minimum ticks between bumps of the same pair. */
  bumpCooldownTicks: number
  /** Optional public wave timetable; absent on scenarios recorded before it existed. */
  waves?: ArenaRushWave[]
}

export const DEFAULT_RUSH_RULES: ArenaRushRules = Object.freeze({
  contactRadiusM: 1.1,
  bumpStaggerTicks: 24,
  bumpCooldownTicks: 60,
})

export type ArenaSimEvent =
  | { type: 'core_spawn'; tick: number; resourceId: string; nodeId: string; value: number }
  | { type: 'bump'; tick: number; winnerId: string; loserId: string; position: ArenaPosition; stolen: number }

export type ArenaAction =
  | { type: 'move'; edgeId: string }
  | { type: 'collect'; resourceId: string }
  | { type: 'bank' | 'drain' | 'wait' }

export type ArenaRequest = { agentId: string; tick: number; action: unknown }
export type ArenaRecordedRequest = Omit<ArenaRequest, 'action'> & { action: ArenaAction | null }
export type ArenaRejection =
  | 'unknown-entrant' | 'stale-tick' | 'not-decision-tick' | 'duplicate-request'
  | 'invalid-action' | 'in-transit' | 'unreachable-edge' | 'unreachable-resource'
  | 'resource-unavailable' | 'cargo-full' | 'not-at-base' | 'nothing-to-bank'
  | 'no-flood' | 'cooldown' | 'staggered' | 'insufficient-energy' | 'movement-blocked' | 'not-grounded'

export interface ArenaOutcome {
  agentId: string
  tick: number
  action: ArenaAction | null
  accepted: boolean
  reason: ArenaRejection | null
}

export interface ArenaAgentState extends ArenaEntrant {
  nodeId: string
  position: ArenaPosition
  transit: { edgeId: string; from: string; to: string; progressUnits: number; requiredUnits: number } | null
  energy: number
  cargo: number
  banked: number
  cooldownUntilTick: number
  staggeredUntilTick: number
  lastOutcome: ArenaOutcome | null
  visitedNodes: string[]
  /** `announced`: learned via a public spawn flare, not by sight (Rush). */
  knownResources: { id: string; nodeId: string; value: number; available: boolean; announced?: boolean }[]
  grounded: boolean
  rotation: [number, number, number, number]
  blockedTicks: number
  blockedEdges: string[]
  recoveries: number
}

export interface ArenaSnapshot {
  rulesVersion: string
  controllerVersion: string
  tick: number
  status: 'running' | 'finished'
  winner: string | null
  agents: ArenaAgentState[]
  resources: (ArenaResource & { collectedBy: string | null })[]
  weather: { flooded: boolean; drainedUntilTick: number }
  /** Append-only authoritative events (Rush only); carried by checkpoints so replays reproduce them. */
  events?: ArenaSimEvent[]
}

export const OBSERVATION_SCHEMA_VERSION = 'arena-observation-v2' as const
export const OBSERVATION_SCHEMA_V1 = 'arena-observation-v1' as const

export interface ArenaObservation {
  // v1 observations remain valid data; v2 additionally discloses rival banked
  // as a public scoreboard (cargo/position stay fog-masked).
  schemaVersion: typeof OBSERVATION_SCHEMA_VERSION | typeof OBSERVATION_SCHEMA_V1
  rulesVersion: string
  tick: number
  remainingTicks: number
  decisionDue: boolean
  self: ArenaAgentState
  rivals: { id: string; position: ArenaPosition | null; cargo: number | null; banked: number | null; visible: boolean }[]
  nodes: ArenaNode[]
  edges: (ArenaEdge & { currentTravelTicks: number; blocked: boolean })[]
  /** `flare`: stale sighting that came from a public spawn announcement (a trustworthy target, unlike a remembered ghost). */
  resources: (ArenaResource & { available: boolean; visible: boolean; stale: boolean; flare?: boolean })[]
  /**
   * Rush only: the public timetable of waves that have not spawned yet, earliest
   * first. Additive (docs/COMPATIBILITY.md Rule 3); absent in Haul and in
   * scenarios without a timetable.
   */
  rushWaves?: { nodeId: string; value: number; windowStart: number; windowEnd: number }[]
  weather: ArenaSnapshot['weather']
  availableActions: ArenaAction[]
  fog: { visible: string[]; remembered: string[]; hidden: string[] }
}

export interface ArenaRecording {
  schemaVersion: 'arena-recording-v1'
  rulesVersion: string
  controllerVersion: string
  scenario: ArenaScenario
  finalTick: number
  batches: { tick: number; requests: ArenaRecordedRequest[] }[]
  checkpoints: { state: ArenaSnapshot }[]
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value)
}

function integer(value: number, min: number, max: number) {
  return Number.isSafeInteger(value) && value >= min && value <= max
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid arena scenario: ${message}`)
}

/**
 * Deep copy for the plain JSON-shaped data this module owns (numbers, strings,
 * booleans, null, arrays, plain objects). Several times faster than
 * structuredClone on small objects, which matters because every decision tick
 * clones an observation per entrant.
 */
function clonePlain<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    const copy = new Array(value.length)
    for (let index = 0; index < value.length; index++) copy[index] = clonePlain(value[index])
    return copy as T
  }
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(value)) copy[key] = clonePlain((value as Record<string, unknown>)[key])
  return copy as T
}

function validateScenario(scenario: ArenaScenario) {
  assert(identifier(scenario.id) && identifier(scenario.worldVersion), 'identity')
  assert(scenario.split === 'practice' || scenario.split === 'evaluation', 'split')
  assert(integer(scenario.seed, 0, 0xffffffff), 'seed')
  assert(integer(scenario.durationTicks, 1, ARENA_RULES.maxDurationTicks), 'duration')
  for (const [name, items, limit] of [
    ['nodes', scenario.nodes, 64], ['edges', scenario.edges, 256],
    ['entrants', scenario.entrants, 2], ['resources', scenario.resources, 64],
  ] as const) {
    assert(Array.isArray(items) && items.length > 0 && items.length <= limit, name)
    assert(items.every(item => identifier(item.id)), `${name} identifiers`)
    assert(new Set(items.map(item => item.id)).size === items.length, `${name} duplicates`)
  }
  assert(scenario.entrants.length === 2, 'exactly two entrants required')
  const nodes = new Set(scenario.nodes.map(node => node.id))
  assert(scenario.nodes.every(node => Array.isArray(node.position) && node.position.length === 3 &&
    node.position.every(value => Number.isFinite(value) && Math.abs(value) <= 10000)), 'positions')
  assert(scenario.edges.every(edge => nodes.has(edge.from) && nodes.has(edge.to) && edge.from !== edge.to &&
    integer(edge.travelTicks, 1, ARENA_RULES.maxDurationTicks) && typeof edge.floodable === 'boolean'), 'edges')
  for (const edge of scenario.edges) {
    if (!edge.path) continue
    assert(Array.isArray(edge.path) && edge.path.length >= 2 && edge.path.length <= 512 && edge.path.every(point =>
      Array.isArray(point) && point.length === 3 && point.every(value => Number.isFinite(value) && Math.abs(value) <= 10000)), 'edge path')
    const start = scenario.nodes.find(node => node.id === edge.from)!.position
    const end = scenario.nodes.find(node => node.id === edge.to)!.position
    assert(edge.path[0].every((value, axis) => Math.abs(value - start[axis]) < 1e-5) &&
      edge.path[edge.path.length - 1].every((value, axis) => Math.abs(value - end[axis]) < 1e-5), 'path endpoints')
  }
  assert(scenario.entrants.every(entrant => nodes.has(entrant.baseNode) && identifier(entrant.policyVersion)), 'entrants')
  assert(scenario.entrants.every(({ traits }) => traits === undefined || (
    Number.isFinite(traits.travelSpeed) && traits.travelSpeed >= 0.5 && traits.travelSpeed <= 2 &&
    Number.isFinite(traits.maxEnergy) && traits.maxEnergy >= 4 && traits.maxEnergy <= 24 &&
    Number.isFinite(traits.contactStrength) && Math.abs(traits.contactStrength) <= 5 &&
    (traits.capacity === undefined || (Number.isInteger(traits.capacity) && traits.capacity >= 1 && traits.capacity <= 8)) &&
    (traits.visionHops === undefined || (Number.isInteger(traits.visionHops) && traits.visionHops >= 1 && traits.visionHops <= 3)) &&
    (traits.cargoTravelTax === undefined || (Number.isFinite(traits.cargoTravelTax) && traits.cargoTravelTax >= 0 && traits.cargoTravelTax <= 0.5)) &&
    (traits.contactRadiusBonus === undefined || (Number.isFinite(traits.contactRadiusBonus) && traits.contactRadiusBonus >= 0 && traits.contactRadiusBonus <= 1.5)))), 'entrant traits')
  assert(scenario.resources.every(resource => nodes.has(resource.nodeId) &&
    integer(resource.value, 1, 8) &&
    (resource.spawnTick === undefined || integer(resource.spawnTick, 0, scenario.durationTicks - 1))), 'resources')
  if (scenario.rush !== undefined) {
    const { contactRadiusM, bumpStaggerTicks, bumpCooldownTicks } = scenario.rush
    assert(Number.isFinite(contactRadiusM) && contactRadiusM > 0 && contactRadiusM <= 5 &&
      integer(bumpStaggerTicks, 0, 200) && integer(bumpCooldownTicks, 1, 600), 'rush rules')
    const { waves } = scenario.rush
    if (waves !== undefined) {
      // A disclosed window must never lie: the spawn has to fall inside it.
      assert(Array.isArray(waves) && waves.length <= 16 && waves.every(wave => {
        const resource = scenario.resources.find(candidate => candidate.id === wave.resourceId)
        return resource?.spawnTick !== undefined &&
          integer(wave.windowStart, 0, scenario.durationTicks) && integer(wave.windowEnd, wave.windowStart, scenario.durationTicks) &&
          resource.spawnTick >= wave.windowStart && resource.spawnTick <= wave.windowEnd
      }), 'rush waves')
    }
  }
  assert(Array.isArray(scenario.floods) && scenario.floods.length <= 32, 'flood schedule')
  assert(scenario.floods.every(flood => integer(flood.startTick, 0, scenario.durationTicks - 1) &&
    integer(flood.endTick, flood.startTick + 1, scenario.durationTicks)), 'flood intervals')
  const adjacency = new Map<string, string[]>()
  const dryAdjacency = new Map<string, string[]>()
  for (const node of scenario.nodes) {
    adjacency.set(node.id, [])
    dryAdjacency.set(node.id, [])
  }
  for (const edge of scenario.edges) {
    adjacency.get(edge.from)!.push(edge.to)
    adjacency.get(edge.to)!.push(edge.from)
    if (!edge.floodable) {
      dryAdjacency.get(edge.from)!.push(edge.to)
      dryAdjacency.get(edge.to)!.push(edge.from)
    }
  }
  function reachable(start: string, graph: Map<string, string[]>) {
    const seen = new Set<string>([start])
    const stack = [start]
    while (stack.length > 0) {
      const current = stack.pop()!
      for (const next of graph.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    return seen
  }
  const resourceNodes = new Set(scenario.resources.map(resource => resource.nodeId))
  const allConnected = new Set<string>([scenario.nodes[0].id])
  for (let pass = 0; pass < nodes.size; pass++) {
    for (const edge of scenario.edges) {
      if (allConnected.has(edge.from)) allConnected.add(edge.to)
      if (allConnected.has(edge.to)) allConnected.add(edge.from)
    }
  }
  assert(allConnected.size === nodes.size, 'disconnected graph')
  for (const entrant of scenario.entrants) {
    const base = entrant.baseNode
    assert(adjacency.get(base)!.length > 0, `entrant ${entrant.id} base has no incident edges`)
    const canReach = reachable(base, adjacency)
    assert([...canReach].some(node => resourceNodes.has(node)), `entrant ${entrant.id} cannot reach any resource`)
    const canReachDry = reachable(base, dryAdjacency)
    assert([...canReachDry].some(node => resourceNodes.has(node)), `entrant ${entrant.id} cannot reach a resource without crossing a floodable edge`)
  }
  const champion = scenario.entrants.find(entrant => entrant.id === 'champion')
  if (champion) {
    const incident = scenario.edges.filter(edge => edge.from === champion.baseNode || edge.to === champion.baseNode).length
    assert(incident >= 2, 'champion base must have at least two incident edges')
  }
}

export function parseArenaAction(value: unknown): ArenaAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const action = value as Record<string, unknown>
  const keys = Object.keys(action)
  if (action.type === 'move' && keys.length === 2 && identifier(action.edgeId)) {
    return { type: 'move', edgeId: action.edgeId }
  }
  if (action.type === 'collect' && keys.length === 2 && identifier(action.resourceId)) {
    return { type: 'collect', resourceId: action.resourceId }
  }
  if (keys.length === 1 && (action.type === 'bank' || action.type === 'drain' || action.type === 'wait')) {
    return { type: action.type }
  }
  return null
}

export class ArenaEpisode {
  #scenario: ArenaScenario
  #state!: ArenaSnapshot
  #batches: ArenaRecording['batches'] = []
  #checkpoints: ArenaRecording['checkpoints'] = []
  #nodes: Map<string, ArenaNode>
  #edges: Map<string, ArenaEdge>
  #paths = new Map<string, { points: ArenaPosition[]; lengths: number[]; total: number }>()
  #motion?: ArenaMotion
  #record: boolean

  /** `record: false` skips the per-decision checkpoint clones (training/ladder scoring never replays). */
  constructor(scenario: ArenaScenario, motion?: ArenaMotion, options: { record?: boolean } = {}) {
    validateScenario(scenario)
    this.#motion = motion
    this.#record = options.record ?? true
    this.#scenario = structuredClone(scenario)
    this.#scenario.entrants.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    this.#nodes = new Map(this.#scenario.nodes.map(node => [node.id, node]))
    this.#edges = new Map(this.#scenario.edges.map(edge => [edge.id, edge]))
    for (const edge of this.#scenario.edges) {
      const points = edge.path ?? [this.#nodes.get(edge.from)!.position, this.#nodes.get(edge.to)!.position]
      const lengths = [0]
      for (let index = 1; index < points.length; index++) {
        const previous = points[index - 1]
        lengths.push(lengths[index - 1] + Math.hypot(...points[index].map((value, axis) => value - previous[axis])))
      }
      const total = lengths[lengths.length - 1]
      assert(total > 0, 'zero-length path')
      this.#paths.set(edge.id, { points, lengths, total })
    }
    this.reset()
  }

  reset() {
    this.#state = {
      rulesVersion: ARENA_RULES.version,
      controllerVersion: this.#motion?.version ?? 'route-reference-v2',
      tick: 0,
      status: 'running',
      winner: null,
      agents: this.#scenario.entrants.map(entrant => ({
        ...entrant,
        nodeId: entrant.baseNode,
        position: [...this.#nodes.get(entrant.baseNode)!.position],
        transit: null,
        energy: entrant.traits?.maxEnergy ?? ARENA_RULES.initialEnergy,
        cargo: 0,
        banked: 0,
        cooldownUntilTick: 0,
        staggeredUntilTick: 0,
        lastOutcome: null,
        visitedNodes: [entrant.baseNode],
        knownResources: [],
        grounded: true,
        rotation: [0, 0, 0, 1],
        blockedTicks: 0,
        blockedEdges: [],
        recoveries: 0,
      })),
      resources: this.#scenario.resources.map(resource => ({ ...resource, collectedBy: null })),
      weather: { flooded: false, drainedUntilTick: 0 },
      ...(this.#scenario.rush ? { events: [] } : {}),
    }
    this.#motion?.reset(this.#state.agents.map(agent => ({ id: agent.id, position: [...agent.position] })))
    this.#state.weather.flooded = this.#isFlooded()
    this.#updateKnownResources()
    this.#batches = []
    this.#checkpoints = this.#record ? [{ state: this.snapshot() }] : []
  }

  get tick() {
    return this.#state.tick
  }

  get finished() {
    return this.#state.status === 'finished'
  }

  snapshot(): ArenaSnapshot {
    return clonePlain(this.#state)
  }

  /**
   * Live authority state without cloning. For render loops only — callers must
   * not mutate. Prefer `snapshot()` when handing state to React or recordings.
   */
  peek(): ArenaSnapshot {
    return this.#state
  }

  /**
   * Restore a previously recorded snapshot (same scenario). Recording
   * checkpoints are full state clones, so restoring one rehydrates agents,
   * resources, weather, and tick exactly. Used by consequence rollouts to
   * branch from a live state; never used by match play.
   */
  restoreSnapshot(state: ArenaSnapshot) {
    this.#state = structuredClone(state)
    // Re-seed the motion adapter from the restored positions; without this a
    // physics-backed branch would chase targets from stale (construction-time)
    // body poses. May throw when a restored position fails the spawn overlap
    // check (wall-clamped mid-edge poses) — callers branching from physics
    // snapshots should handle that and fall back to a route-only branch.
    this.#motion?.reset(this.#state.agents.map(agent => ({ id: agent.id, position: [...agent.position] })))
  }

  observe(agentId: string, options?: { forceDecision?: boolean }): ArenaObservation {
    return observeSnapshot(this.#scenario, this.#state, agentId, options)
  }

  #updateKnownResources() {
    for (const agent of this.#state.agents) {
      const visibleNodes = visibleNodeSet(this.#scenario, agent)
      for (const resource of this.#state.resources) {
        if (visibleNodes.has(resource.nodeId) && isResourceSpawned(resource, this.#state.tick)) {
          const existing = agent.knownResources.find(r => r.id === resource.id)
          if (existing) {
            existing.available = resource.collectedBy === null
          } else {
            agent.knownResources.push({ id: resource.id, nodeId: resource.nodeId, value: resource.value, available: resource.collectedBy === null })
          }
        }
      }
    }
  }

  step(requests: readonly ArenaRequest[] = []): ArenaOutcome[] {
    const state = this.#state
    if (state.status === 'finished') throw new Error('Arena episode is finished')
    if (!Array.isArray(requests) || requests.length > state.agents.length) throw new Error('At most one request per entrant per tick')
    const normalized = requests.map(request => {
      if (!request || !identifier(request.agentId) || !Number.isSafeInteger(request.tick)) {
        throw new Error('Invalid arena request envelope')
      }
      return { agentId: request.agentId, tick: request.tick, action: parseArenaAction(request.action) }
    })
    const outcomes: ArenaOutcome[] = normalized.map(request => {
      const agent = state.agents.find(candidate => candidate.id === request.agentId)
      const reason: ArenaRejection | null = !agent ? 'unknown-entrant'
        : normalized.filter(other => other.agentId === request.agentId).length > 1 ? 'duplicate-request'
        : request.tick !== state.tick ? 'stale-tick'
        : state.tick % ARENA_RULES.decisionEveryTicks !== 0 ? 'not-decision-tick'
        : !request.action ? 'invalid-action' : null
      return { ...request, tick: state.tick, accepted: false, reason }
    })
    const priority = (this.#scenario.seed + Math.floor(state.tick / ARENA_RULES.decisionEveryTicks)) % state.agents.length
    for (let offset = 0; offset < state.agents.length; offset++) {
      const agent = state.agents[(priority + offset) % state.agents.length]
      for (const outcome of outcomes.filter(item => item.agentId === agent.id)) {
        outcome.reason ??= outcome.action ? this.#rejection(agent, outcome.action) : 'invalid-action'
        if (outcome.reason === null && outcome.action) {
          this.#apply(agent, outcome.action)
          outcome.accepted = true
        }
        agent.lastOutcome = structuredClone(outcome)
      }
    }
    if (this.#record && normalized.length > 0) this.#batches.push({ tick: state.tick, requests: normalized })
    state.weather.flooded = this.#isFlooded()
    this.#moveAgents()
    // Energy regen: agents not in transit and not taking an accepted action
    // recover energy (capped). An accepted `wait` is the recharge verb — it
    // must not tax the very recovery it exists to perform.
    for (const agent of state.agents) {
      const maxEnergy = agent.traits?.maxEnergy ?? ARENA_RULES.initialEnergy
      if (!agent.transit && agent.energy < maxEnergy) {
        const actedThisTick = agent.lastOutcome?.tick === state.tick && agent.lastOutcome?.accepted &&
          agent.lastOutcome?.action?.type !== 'wait'
        if (!actedThisTick) {
          agent.energy = Math.min(maxEnergy, agent.energy + ARENA_RULES.idleRegenPerTick)
        }
      }
    }
    state.tick += 1
    if (state.events) {
      for (const resource of this.#scenario.resources) {
        if (resource.spawnTick === state.tick) {
          state.events.push({ type: 'core_spawn', tick: state.tick, resourceId: resource.id, nodeId: resource.nodeId, value: resource.value })
          // A spawn is a public flare: every entrant learns where it is, even
          // through fog. Who gets there first is the race.
          for (const agent of state.agents) {
            if (!agent.knownResources.some(known => known.id === resource.id)) {
              agent.knownResources.push({ id: resource.id, nodeId: resource.nodeId, value: resource.value, available: true, announced: true })
            }
          }
        }
      }
    }
    state.weather.flooded = this.#isFlooded()
    this.#updateKnownResources()
    if (state.tick === this.#scenario.durationTicks) {
      state.status = 'finished'
      const [first, second] = state.agents
      state.winner = first.banked === second.banked ? null : first.banked > second.banked ? first.id : second.id
    }
    if (this.#record && (state.tick % ARENA_RULES.decisionEveryTicks === 0 || state.status === 'finished')) {
      this.#checkpoints.push({ state: this.snapshot() })
    }
    return clonePlain(outcomes)
  }

  recording(): ArenaRecording {
    if (!this.#record) throw new Error('Episode was created with record: false')
    const checkpoints = structuredClone(this.#checkpoints)
    if (checkpoints[checkpoints.length - 1].state.tick !== this.#state.tick) checkpoints.push({ state: this.snapshot() })
    return structuredClone({
      schemaVersion: 'arena-recording-v1',
      rulesVersion: ARENA_RULES.version,
      controllerVersion: this.#state.controllerVersion,
      scenario: this.#scenario,
      finalTick: this.#state.tick,
      batches: this.#batches,
      checkpoints,
    } satisfies ArenaRecording)
  }

  /**
   * Apply a proximity clash prize. Resolution happens outside the episode;
   * this only mutates cargo / cooldown while the episode is running.
   */
  applyEncounterClash(args: {
    winnerId: string
    loserId: string
    transferCargo: boolean
    staggerTicks: number
  }): { transferred: number } {
    if (this.#state.status !== 'running') {
      throw new Error('Encounter prizes only apply during a running episode')
    }
    const winner = this.#state.agents.find(agent => agent.id === args.winnerId)
    const loser = this.#state.agents.find(agent => agent.id === args.loserId)
    if (!winner || !loser) throw new Error('Encounter agents missing')
    let transferred = 0
    if (args.transferCargo && loser.cargo > 0) {
      const space = Math.max(0, capacityOf(winner) - winner.cargo)
      transferred = Math.min(1, loser.cargo, space)
      loser.cargo -= transferred
      winner.cargo += transferred
    }
    loser.staggeredUntilTick = Math.max(
      loser.staggeredUntilTick,
      this.#state.tick + Math.max(0, args.staggerTicks),
    )
    return { transferred }
  }

  #isFlooded() {
    return isScenarioFlooded(this.#scenario, this.#state)
  }

  #rejection(agent: ArenaAgentState, action: ArenaAction): ArenaRejection | null {
    return checkActionRejection(this.#scenario, this.#state, agent, action)
  }

  #apply(agent: ArenaAgentState, action: ArenaAction) {
    if (action.type === 'move') {
      const edge = this.#edges.get(action.edgeId)!
      agent.transit = {
        edgeId: edge.id,
        from: agent.nodeId,
        to: edge.from === agent.nodeId ? edge.to : edge.from,
        progressUnits: 0,
        requiredUnits: edge.travelTicks * ARENA_RULES.floodTravelMultiplier,
      }
      const moveCost = Math.ceil(edge.travelTicks * ARENA_RULES.moveCostPerTick)
      agent.energy -= moveCost
    } else if (action.type === 'collect') {
      const resource = this.#state.resources.find(candidate => candidate.id === action.resourceId)!
      resource.collectedBy = agent.id
      agent.cargo += resource.value
    } else if (action.type === 'bank') {
      agent.banked += agent.cargo
      agent.cargo = 0
    } else if (action.type === 'drain') {
      agent.energy -= ARENA_RULES.drainCost
      agent.cooldownUntilTick = this.#state.tick + ARENA_RULES.drainCooldownTicks
      this.#state.weather.drainedUntilTick = this.#state.tick + ARENA_RULES.drainTicks
    }
  }

  #pathPoint(edge: ArenaEdge, progress: number): ArenaPosition {
    const path = this.#paths.get(edge.id)!
    if (progress <= 0) return [...path.points[0]]
    if (progress >= 1) return [...path.points[path.points.length - 1]]
    const distance = progress * path.total
    let end = 1
    while (end < path.lengths.length - 1 && path.lengths[end] < distance) end++
    const start = path.points[end - 1]
    const fraction = (distance - path.lengths[end - 1]) / (path.lengths[end] - path.lengths[end - 1])
    return start.map((value, axis) => value + (path.points[end][axis] - value) * fraction) as ArenaPosition
  }

  #moveAgents() {
    const desired = this.#state.agents.map(agent => {
      const transit = agent.transit
      if (!transit) return { id: agent.id, position: [...this.#nodes.get(agent.nodeId)!.position] as ArenaPosition, progressUnits: 0 }
      const edge = this.#edges.get(transit.edgeId)!
      const flooded = edge.floodable && this.#state.weather.flooded
      const tax = agent.traits?.cargoTravelTax ?? 0
      const overloaded = Math.max(0, agent.cargo - ARENA_RULES.capacity)
      const loadFactor = Math.max(0.5, 1 - tax * overloaded)
      const step = (flooded ? 1 : ARENA_RULES.floodTravelMultiplier) * (agent.traits?.travelSpeed ?? 1) * loadFactor
      const progressUnits = Math.min(transit.requiredUnits, transit.progressUnits + step)
      const progress = progressUnits / transit.requiredUnits
      return { id: agent.id, position: this.#pathPoint(edge, transit.from === edge.from ? progress : 1 - progress), progressUnits }
    })
    const poses = this.#motion
      ? this.#motion.step(desired.map(({ id, position }) => ({ id, position: [...position] })), ARENA_RULES.stepMs / 1000)
      : desired.map(target => ({ id: target.id, position: target.position, grounded: true, rotation: [0, 0, 0, 1] as [number, number, number, number] }))
    for (const agent of this.#state.agents) {
      const target = desired.find(candidate => candidate.id === agent.id)!
      const pose = poses.find(candidate => candidate.id === agent.id)
      if (!pose || pose.position.length !== 3 || !pose.position.every(Number.isFinite)) throw new Error('Invalid motion-controller result')
      agent.position = [...pose.position]
      agent.grounded = pose.grounded
      if (pose.rotation) agent.rotation = [...pose.rotation]
      const transit = agent.transit
      if (!transit) continue
      const reached = pose.grounded && Math.hypot(pose.position[0] - target.position[0], pose.position[2] - target.position[2]) <= ARENA_RULES.arrivalTolerance &&
        Math.abs(pose.position[1] - target.position[1]) <= ARENA_RULES.groundingTolerance
      if (reached) {
        transit.progressUnits = target.progressUnits
        agent.blockedTicks = 0
        if (transit.progressUnits === transit.requiredUnits) {
          agent.nodeId = transit.to
          if (!agent.visitedNodes.includes(transit.to)) agent.visitedNodes.push(transit.to)
          agent.transit = null
        }
      } else {
        agent.blockedTicks++
        if (agent.blockedTicks >= ARENA_RULES.maxBlockedTicks) {
          const position = this.#nodes.get(transit.from)!.position
          this.#motion?.recover(agent.id, [...position])
          agent.position = [...position]
          agent.nodeId = transit.from
          if (!agent.visitedNodes.includes(transit.from)) agent.visitedNodes.push(transit.from)
          agent.blockedEdges.push(transit.edgeId)
          agent.lastOutcome = { agentId: agent.id, tick: this.#state.tick, action: { type: 'move', edgeId: transit.edgeId }, accepted: false, reason: 'movement-blocked' }
          agent.transit = null
          agent.grounded = true
          agent.blockedTicks = 0
          agent.recoveries++
        }
      }
    }
    if (this.#scenario.rush) this.#resolveContacts(desired)
  }

  /**
   * Rush contact: two rovers whose route-reference positions are within the
   * contact radius bump. Route positions (not physics poses) are used so a
   * physics-backed live match and a route-only server match agree exactly.
   * The heavier rover (more cargo) loses; ties fall to energy, then to the
   * seeded priority. The loser is staggered and the winner steals one unit.
   */
  #resolveContacts(desired: { id: string; position: ArenaPosition }[]) {
    const rules = this.#scenario.rush!
    const state = this.#state
    if (state.agents.length !== 2 || !state.events) return
    const [a, b] = state.agents
    const pa = desired.find(item => item.id === a.id)!.position
    const pb = desired.find(item => item.id === b.id)!.position
    const radius = rules.contactRadiusM + Math.max(a.traits?.contactRadiusBonus ?? 0, b.traits?.contactRadiusBonus ?? 0)
    if (Math.hypot(pa[0] - pb[0], pa[2] - pb[2]) > radius) return
    // Cooldown is derived from the event log, so restored snapshots and
    // replays behave exactly like the live run.
    // Event ticks are the tick at which the resulting state is published
    // (step() increments after moving), matching core_spawn.
    const eventTick = state.tick + 1
    const lastBump = state.events.findLast(event => event.type === 'bump')
    if (lastBump && eventTick - lastBump.tick < rules.bumpCooldownTicks) return
    if (a.staggeredUntilTick > state.tick || b.staggeredUntilTick > state.tick) return
    const bias = (this.#scenario.seed + Math.floor(state.tick / ARENA_RULES.decisionEveryTicks)) % 2
    // Strength lowers an entrant's effective load; without traits it is 0 and
    // this reduces to the original cargo comparison.
    const loadA = a.cargo - (a.traits?.contactStrength ?? 0)
    const loadB = b.cargo - (b.traits?.contactStrength ?? 0)
    const loser = loadA !== loadB ? (loadA > loadB ? a : b)
      : a.energy !== b.energy ? (a.energy < b.energy ? a : b)
      : (bias === 0 ? a : b)
    const winner = loser === a ? b : a
    const stolen = Math.min(winner.traits?.stealAll ? loser.cargo : 1, loser.cargo, Math.max(0, capacityOf(winner) - winner.cargo))
    loser.cargo -= stolen
    winner.cargo += stolen
    loser.staggeredUntilTick = Math.max(loser.staggeredUntilTick, state.tick + rules.bumpStaggerTicks)
    state.events.push({
      type: 'bump',
      tick: eventTick,
      winnerId: winner.id,
      loserId: loser.id,
      position: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2],
      stolen,
    })
  }
}

/**
 * Branch an episode from a recorded snapshot state: restore the snapshot into
 * a fresh episode over the same scenario, apply one champion action, then run
 * both branches with fixed policies to `horizonTicks`. Returns banked delta
 * (oracle branch minus learner branch). Deterministic: same snapshot + same
 * actions (+ same collider, when motion is given) → same delta.
 * Used to weight consequence supervision.
 *
 * Route-only by default. Pass a shared `motion` adapter (caller owns its
 * lifecycle) to price both branches with real traversal physics — required
 * for snapshots recorded on grounded courses, where route-only branches
 * cannot produce the stalls/recoveries that dominate physical travel time.
 * The adapter is re-seeded from the snapshot via restoreSnapshot, so one
 * instance can serve both branches (they run sequentially).
 */
export function rolloutOutcomeDelta(
  scenario: ArenaScenario,
  state: ArenaSnapshot,
  oracleAction: ArenaAction,
  learnerAction: ArenaAction,
  championPolicy: (obs: ArenaObservation) => ArenaAction,
  rivalPolicy: (obs: ArenaObservation) => ArenaAction,
  horizonTicks = 120,
  motion?: ArenaMotion,
): number {
  const runBranch = (firstAction: ArenaAction): { banked: number; cargo: number; collected: number; recoveries: number } => {
    const branch = new ArenaEpisode({ ...scenario, entrants: scenario.entrants.map(e => ({ ...e })) }, motion)
    branch.restoreSnapshot(structuredClone(state))
    const startTick = branch.tick
    const start = branch.snapshot().agents.find(a => a.id === 'champion')
    const startBanked = start?.banked ?? 0
    const startRecoveries = start?.recoveries ?? 0
    const endTick = Math.min(startTick + horizonTicks, scenario.durationTicks)
    let first = true
    let collected = 0
    while (!branch.finished && branch.tick < endTick) {
      const tick = branch.tick
      if (tick % ARENA_RULES.decisionEveryTicks !== 0) { branch.step(); continue }
      const championAction = first ? firstAction : championPolicy(branch.observe('champion'))
      if (!first && championAction.type === 'collect') collected++
      if (first && firstAction.type === 'collect') collected++
      first = false
      branch.step([
        { agentId: 'champion', tick, action: championAction },
        { agentId: 'rival', tick, action: rivalPolicy(branch.observe('rival')) },
      ])
    }
    const end = branch.snapshot().agents.find(a => a.id === 'champion')
    return {
      banked: (end?.banked ?? 0) - startBanked,
      cargo: end?.cargo ?? 0,
      collected,
      recoveries: (end?.recoveries ?? 0) - startRecoveries,
    }
  }
  const oracle = runBranch(oracleAction)
  const learner = runBranch(learnerAction)
  // Progress score: banked is sparse (horizon rarely reaches a bank trip),
  // so credit cargo aboard + collects too. Scale: 1 banked ≈ 3 cargo-equivalents.
  // Recoveries (only possible under physics motion) cost 2: a stalling road
  // must never out-score a slower-but-moving alternative.
  const score = (r: { banked: number; cargo: number; collected: number; recoveries: number }) =>
    r.banked * 3 + r.cargo * 0.5 + r.collected * 0.25 - r.recoveries * 2
  return score(oracle) - score(learner)
}

/** A core is in play once its spawn wave has arrived (always, when it has no spawnTick). */
export function isResourceSpawned(resource: { spawnTick?: number }, tick: number): boolean {
  return resource.spawnTick === undefined || resource.spawnTick <= tick
}

export function isScenarioFlooded(scenario: ArenaScenario, state: ArenaSnapshot): boolean {
  const { tick, weather } = state
  return weather.drainedUntilTick <= tick && scenario.floods.some(flood => flood.startTick <= tick && tick < flood.endTick)
}

export function checkActionRejection(
  scenario: ArenaScenario,
  state: ArenaSnapshot,
  agent: ArenaAgentState,
  action: ArenaAction
): ArenaRejection | null {
  if (action.type === 'wait') return null
  // Clash stagger: a timed-out entrant may only wait. Distinct from the drain
  // cooldown (which gates re-draining only) — kept on its own field so a
  // 150-tick drain cooldown never stalls ordinary actions.
  if (agent.staggeredUntilTick > state.tick) return 'staggered'
  if (action.type === 'drain') {
    if (!isScenarioFlooded(scenario, state)) return 'no-flood'
    if (agent.cooldownUntilTick > state.tick) return 'cooldown'
    return agent.energy < ARENA_RULES.drainCost ? 'insufficient-energy' : null
  }
  if (agent.transit) return 'in-transit'
  if (!agent.grounded) return 'not-grounded'
  if (action.type === 'move') {
    const edge = scenario.edges.find(candidate => candidate.id === action.edgeId)
    if (agent.blockedEdges.includes(action.edgeId)) return 'movement-blocked'
    if (!edge || (edge.from !== agent.nodeId && edge.to !== agent.nodeId)) return 'unreachable-edge'
    const moveCost = Math.ceil(edge.travelTicks * ARENA_RULES.moveCostPerTick)
    return agent.energy < moveCost ? 'insufficient-energy' : null
  }
  if (action.type === 'collect') {
    const resource = state.resources.find(candidate => candidate.id === action.resourceId)
    if (!resource || resource.collectedBy !== null || !isResourceSpawned(resource, state.tick)) return 'resource-unavailable'
    if (resource.nodeId !== agent.nodeId) return 'unreachable-resource'
    return agent.cargo + resource.value > capacityOf(agent) ? 'cargo-full' : null
  }
  if (agent.nodeId !== agent.baseNode) return 'not-at-base'
  return agent.cargo === 0 ? 'nothing-to-bank' : null
}

function upcomingRushWaves(scenario: ArenaScenario, state: ArenaSnapshot): NonNullable<ArenaObservation['rushWaves']> {
  const upcoming: NonNullable<ArenaObservation['rushWaves']> = []
  for (const wave of scenario.rush?.waves ?? []) {
    const resource = state.resources.find(candidate => candidate.id === wave.resourceId)
    if (!resource || isResourceSpawned(resource, state.tick)) continue
    upcoming.push({ nodeId: resource.nodeId, value: resource.value, windowStart: wave.windowStart, windowEnd: wave.windowEnd })
  }
  return upcoming.sort((a, b) => a.windowStart - b.windowStart)
}

export function visibleNodeSet(scenario: ArenaScenario, agent: { nodeId: string; traits?: EntrantTraits }): Set<string> {
  const visible = new Set<string>([agent.nodeId])
  for (let hop = 0; hop < (agent.traits?.visionHops ?? 1); hop++) {
    const frontier = [...visible]
    for (const edge of scenario.edges) {
      if (frontier.includes(edge.from)) visible.add(edge.to)
      if (frontier.includes(edge.to)) visible.add(edge.from)
    }
  }
  return visible
}

export function observeSnapshot(
  scenario: ArenaScenario,
  state: ArenaSnapshot,
  agentId: string,
  options?: { forceDecision?: boolean }
): ArenaObservation {
  const agent = state.agents.find(candidate => candidate.id === agentId)
  if (!agent) throw new Error(`Unknown entrant: ${agentId}`)
  const decisionDue = options?.forceDecision ?? (state.status === 'running' && state.tick % ARENA_RULES.decisionEveryTicks === 0)
  const choices: ArenaAction[] = [
    { type: 'wait' }, { type: 'bank' }, { type: 'drain' },
    ...scenario.edges.map(edge => ({ type: 'move' as const, edgeId: edge.id })),
    ...scenario.resources.map(resource => ({ type: 'collect' as const, resourceId: resource.id })),
  ]
  const fogSets = (() => {
    const visible = visibleNodeSet(scenario, agent)
    const remembered = new Set<string>(agent.visitedNodes.filter(node => !visible.has(node)))
    const hidden = scenario.nodes.filter(node => !visible.has(node.id) && !remembered.has(node.id)).map(node => node.id)
    return { visible, remembered, hidden }
  })()
  const fog = {
    visible: [...fogSets.visible].sort(),
    remembered: [...fogSets.remembered].sort(),
    hidden: fogSets.hidden.sort(),
  }
  return {
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    rulesVersion: ARENA_RULES.version,
    tick: state.tick,
    remainingTicks: scenario.durationTicks - state.tick,
    decisionDue,
    self: clonePlain(agent),
    rivals: clonePlain(state.agents.filter(candidate => candidate.id !== agentId).map(candidate => {
      const isVisible = fogSets.visible.has(candidate.nodeId)
      const isRemembered = fogSets.remembered.has(candidate.nodeId)
      // Banked totals are a public scoreboard (generals-style): disclosed at
      // every visibility level. Cargo and position stay fog-masked.
      if (isVisible) {
        return { id: candidate.id, position: candidate.position, cargo: candidate.cargo, banked: candidate.banked, visible: true }
      }
      if (isRemembered) {
        return { id: candidate.id, position: candidate.position, cargo: null, banked: candidate.banked, visible: false }
      }
      return { id: candidate.id, position: null, cargo: null, banked: candidate.banked, visible: false }
    })),
    nodes: scenario.nodes.map(node => ({ id: node.id, position: [...node.position] as ArenaPosition })),
    // Dense ground paths are rendering/sim geometry, not policy input. Leaving
    // them out keeps observations cheap to copy (they dominated match cost).
    edges: scenario.edges.map(edge => ({
      id: edge.id, from: edge.from, to: edge.to, travelTicks: edge.travelTicks, floodable: edge.floodable,
      blocked: agent.blockedEdges.includes(edge.id),
      currentTravelTicks: edge.travelTicks * (edge.floodable && state.weather.flooded ? ARENA_RULES.floodTravelMultiplier : 1),
    })),
    resources: clonePlain((() => {
      const visibleNodes = fogSets.visible
      const result: (ArenaResource & { available: boolean; visible: boolean; stale: boolean; flare?: boolean })[] = []
      // Currently visible resources: show real-time state
      for (const resource of state.resources) {
        if (resource.collectedBy !== null || !isResourceSpawned(resource, state.tick)) continue
        if (visibleNodes.has(resource.nodeId)) {
          result.push({ id: resource.id, nodeId: resource.nodeId, value: resource.value, available: true, visible: true, stale: false })
        }
      }
      // Remembered resources: show last-known state, marked stale
      for (const known of agent.knownResources) {
        if (visibleNodes.has(known.nodeId)) continue // already handled above
        if (!known.available) continue // was already collected when last seen
        // Check if it was collected since we last saw it — we can't know, so show as stale
        const stillExists = state.resources.find(r => r.id === known.id && r.collectedBy === null)
        if (stillExists) {
          result.push({ id: known.id, nodeId: known.nodeId, value: known.value, available: true, visible: false, stale: true, ...(known.announced ? { flare: true } : {}) })
        }
      }
      return result
    })()),
    ...(scenario.rush?.waves ? { rushWaves: upcomingRushWaves(scenario, state) } : {}),
    weather: clonePlain(state.weather),
    availableActions: clonePlain(decisionDue ? choices.filter(action => checkActionRejection(scenario, state, agent, action) === null) : []),
    fog,
  } satisfies ArenaObservation
}
