import type { ArenaMotion } from './arenaPhysics'

export const ARENA_RULES = Object.freeze({
  version: 'season-0.reference.2',
  stepMs: 50,
  decisionEveryTicks: 5,
  maxDurationTicks: 7200,
  capacity: 3,
  initialEnergy: 3,
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
export type ArenaResource = { id: string; nodeId: string; value: number }
export type ArenaEntrant = { id: string; baseNode: string; policyVersion: string }

export interface ArenaScenario {
  id: string
  worldVersion: string
  split: 'practice' | 'evaluation'
  seed: number
  durationTicks: number
  nodes: ArenaNode[]
  edges: ArenaEdge[]
  entrants: ArenaEntrant[]
  resources: ArenaResource[]
  floods: { startTick: number; endTick: number }[]
}

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
  | 'no-flood' | 'cooldown' | 'insufficient-energy' | 'movement-blocked' | 'not-grounded'

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
  lastOutcome: ArenaOutcome | null
  visitedNodes: string[]
  knownResources: { id: string; nodeId: string; value: number; available: boolean }[]
  grounded: boolean
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
}

export interface ArenaObservation {
  schemaVersion: 'arena-observation-v1'
  rulesVersion: string
  tick: number
  remainingTicks: number
  decisionDue: boolean
  self: ArenaAgentState
  rivals: { id: string; position: ArenaPosition | null; cargo: number | null; banked: number | null; visible: boolean }[]
  nodes: ArenaNode[]
  edges: (ArenaEdge & { currentTravelTicks: number; blocked: boolean })[]
  resources: (ArenaResource & { available: boolean; visible: boolean; stale: boolean })[]
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
  assert(scenario.resources.every(resource => nodes.has(resource.nodeId) &&
    integer(resource.value, 1, ARENA_RULES.capacity)), 'resources')
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

  constructor(scenario: ArenaScenario, motion?: ArenaMotion) {
    validateScenario(scenario)
    this.#motion = motion
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
        energy: ARENA_RULES.initialEnergy,
        cargo: 0,
        banked: 0,
        cooldownUntilTick: 0,
        lastOutcome: null,
        visitedNodes: [entrant.baseNode],
        knownResources: [],
        grounded: true,
        blockedTicks: 0,
        blockedEdges: [],
        recoveries: 0,
      })),
      resources: this.#scenario.resources.map(resource => ({ ...resource, collectedBy: null })),
      weather: { flooded: false, drainedUntilTick: 0 },
    }
    this.#motion?.reset(this.#state.agents.map(agent => ({ id: agent.id, position: [...agent.position] })))
    this.#state.weather.flooded = this.#isFlooded()
    this.#updateKnownResources()
    this.#batches = []
    this.#checkpoints = [{ state: this.snapshot() }]
  }

  get tick() {
    return this.#state.tick
  }

  get finished() {
    return this.#state.status === 'finished'
  }

  snapshot(): ArenaSnapshot {
    return structuredClone(this.#state)
  }

  observe(agentId: string, options?: { forceDecision?: boolean }): ArenaObservation {
    return observeSnapshot(this.#scenario, this.#state, agentId, options)
  }

  #updateKnownResources() {
    for (const agent of this.#state.agents) {
      const visibleNodes = new Set<string>([agent.nodeId])
      for (const edge of this.#scenario.edges) {
        if (edge.from === agent.nodeId) visibleNodes.add(edge.to)
        if (edge.to === agent.nodeId) visibleNodes.add(edge.from)
      }
      for (const resource of this.#state.resources) {
        if (visibleNodes.has(resource.nodeId)) {
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
    if (normalized.length > 0) this.#batches.push({ tick: state.tick, requests: normalized })
    state.weather.flooded = this.#isFlooded()
    this.#moveAgents()
    state.tick += 1
    state.weather.flooded = this.#isFlooded()
    this.#updateKnownResources()
    if (state.tick === this.#scenario.durationTicks) {
      state.status = 'finished'
      const [first, second] = state.agents
      state.winner = first.banked === second.banked ? null : first.banked > second.banked ? first.id : second.id
    }
    if (state.tick % ARENA_RULES.decisionEveryTicks === 0 || state.status === 'finished') {
      this.#checkpoints.push({ state: this.snapshot() })
    }
    return structuredClone(outcomes)
  }

  recording(): ArenaRecording {
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
      const progressUnits = Math.min(transit.requiredUnits, transit.progressUnits + (flooded ? 1 : ARENA_RULES.floodTravelMultiplier))
      const progress = progressUnits / transit.requiredUnits
      return { id: agent.id, position: this.#pathPoint(edge, transit.from === edge.from ? progress : 1 - progress), progressUnits }
    })
    const poses = this.#motion
      ? this.#motion.step(desired.map(({ id, position }) => ({ id, position: [...position] })), ARENA_RULES.stepMs / 1000)
      : desired.map(target => ({ id: target.id, position: target.position, grounded: true }))
    for (const agent of this.#state.agents) {
      const target = desired.find(candidate => candidate.id === agent.id)!
      const pose = poses.find(candidate => candidate.id === agent.id)
      if (!pose || pose.position.length !== 3 || !pose.position.every(Number.isFinite)) throw new Error('Invalid motion-controller result')
      agent.position = [...pose.position]
      agent.grounded = pose.grounded
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
  }
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
    return !edge || (edge.from !== agent.nodeId && edge.to !== agent.nodeId) ? 'unreachable-edge' : null
  }
  if (action.type === 'collect') {
    const resource = state.resources.find(candidate => candidate.id === action.resourceId)
    if (!resource || resource.collectedBy !== null) return 'resource-unavailable'
    if (resource.nodeId !== agent.nodeId) return 'unreachable-resource'
    return agent.cargo + resource.value > ARENA_RULES.capacity ? 'cargo-full' : null
  }
  if (agent.nodeId !== agent.baseNode) return 'not-at-base'
  return agent.cargo === 0 ? 'nothing-to-bank' : null
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
    const visible = new Set<string>([agent.nodeId])
    for (const edge of scenario.edges) {
      if (edge.from === agent.nodeId) visible.add(edge.to)
      if (edge.to === agent.nodeId) visible.add(edge.from)
    }
    const remembered = new Set<string>(agent.visitedNodes.filter(node => !visible.has(node)))
    const hidden = scenario.nodes.filter(node => !visible.has(node.id) && !remembered.has(node.id)).map(node => node.id)
    return { visible, remembered, hidden }
  })()
  const fog = {
    visible: [...fogSets.visible].sort(),
    remembered: [...fogSets.remembered].sort(),
    hidden: fogSets.hidden.sort(),
  }
  return structuredClone({
    schemaVersion: 'arena-observation-v1',
    rulesVersion: ARENA_RULES.version,
    tick: state.tick,
    remainingTicks: scenario.durationTicks - state.tick,
    decisionDue,
    self: agent,
    rivals: state.agents.filter(candidate => candidate.id !== agentId).map(candidate => {
      const isVisible = fogSets.visible.has(candidate.nodeId)
      const isRemembered = fogSets.remembered.has(candidate.nodeId)
      if (isVisible) {
        return { id: candidate.id, position: candidate.position, cargo: candidate.cargo, banked: candidate.banked, visible: true }
      }
      if (isRemembered) {
        return { id: candidate.id, position: candidate.position, cargo: null, banked: null, visible: false }
      }
      return { id: candidate.id, position: null, cargo: null, banked: null, visible: false }
    }),
    nodes: scenario.nodes,
    edges: scenario.edges.map(edge => ({
      ...edge,
      blocked: agent.blockedEdges.includes(edge.id),
      currentTravelTicks: edge.travelTicks * (edge.floodable && state.weather.flooded ? ARENA_RULES.floodTravelMultiplier : 1),
    })),
    resources: (() => {
      const visibleNodes = fogSets.visible
      const result: (ArenaResource & { available: boolean; visible: boolean; stale: boolean })[] = []
      // Currently visible resources: show real-time state
      for (const resource of state.resources) {
        if (resource.collectedBy !== null) continue
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
          result.push({ id: known.id, nodeId: known.nodeId, value: known.value, available: true, visible: false, stale: true })
        }
      }
      return result
    })(),
    weather: state.weather,
    availableActions: decisionDue ? choices.filter(action => checkActionRejection(scenario, state, agent, action) === null) : [],
    fog,
  } satisfies ArenaObservation)
}
