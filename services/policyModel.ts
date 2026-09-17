import {
  ARENA_RULES,
  type ArenaAction,
  type ArenaObservation,
} from './arenaEpisode'

export const POLICY_SCHEMA_VERSION = 'season-0.checkpoint.v1' as const

export interface PolicyLayer {
  weights: number[][]
  biases: number[]
}

export interface PolicyWeights {
  hidden1: { weights: number[][]; biases: number[] } // 32 x 32
  hidden2: { weights: number[][]; biases: number[] } // 32 x 16
  actionHead: { weights: number[][]; biases: number[] } // 16 x 8
}

export interface CheckpointTrainingSummary {
  epochs: number
  loss: number
  sampleCount: number
  datasetHash: string
  accuracy: number
}

export interface CheckpointTrainingConfig {
  epochs: number
  learningRate: number
  momentum: number
  weightDecay: number
}

export interface CheckpointEvaluationRecord {
  scenarioId: string
  split: 'practice' | 'evaluation'
  banked: number
  winner: 'champion' | 'rival' | null
  recoveries: number
  weatherDrains: number
  recordedAt: string
}

export interface PolicyCheckpoint {
  schemaVersion: typeof POLICY_SCHEMA_VERSION
  id: string
  name: string
  parentCheckpointId: string | null
  createdAt: string
  weightsHash: string
  trainingSummary: CheckpointTrainingSummary
  trainingConfig?: CheckpointTrainingConfig
  evaluationRecords?: CheckpointEvaluationRecord[]
  weights: PolicyWeights
}

export const OBSERVATION_FEATURE_DIM = 32
export const ACTION_CLASSES = 8 // 0: wait, 1: bank, 2: collect, 3: drain, 4: move-low, 5: move-high, 6: move-resource, 7: move-home

/**
 * Encodes an ArenaObservation into a normalized 32-dimensional feature vector.
 */
export function encodeObservation(observation: ArenaObservation): Float32Array {
  const vec = new Float32Array(OBSERVATION_FEATURE_DIM)
  const self = observation.self
  const rules = ARENA_RULES

  // Agent physical and state properties
  vec[0] = Math.max(0, Math.min(1, self.cargo / rules.capacity))
  vec[1] = Math.max(0, Math.min(1, self.energy / rules.initialEnergy))
  vec[2] = observation.weather.flooded ? 1.0 : 0.0
  vec[3] = observation.weather.drainedUntilTick > observation.tick ? 1.0 : 0.0
  vec[4] = Math.max(0, Math.min(1, observation.remainingTicks / 1200))
  vec[5] = self.transit !== null ? 1.0 : 0.0
  vec[6] = self.transit ? Math.min(1, self.transit.progressUnits / Math.max(0.1, self.transit.requiredUnits)) : 0
  vec[7] = self.nodeId === self.baseNode ? 1.0 : 0.0
  vec[8] = Math.min(1, observation.resources.length / 12)
  vec[9] = self.recoveries > 0 ? Math.min(1, self.recoveries / 3) : 0
  vec[10] = self.blockedEdges.length > 0 ? 1.0 : 0.0
  vec[11] = self.grounded ? 1.0 : 0.0

  // Immediate environment & available actions
  vec[12] = observation.availableActions.some(a => a.type === 'collect') ? 1.0 : 0.0
  vec[13] = observation.availableActions.some(a => a.type === 'bank') ? 1.0 : 0.0
  vec[14] = observation.availableActions.some(a => a.type === 'drain') ? 1.0 : 0.0

  // Route awareness around current station
  const currentNode = self.nodeId
  const outgoing = observation.edges.filter(e => !e.blocked && (e.from === currentNode || e.to === currentNode))
  const floodable = outgoing.filter(e => e.floodable)
  const nonFloodable = outgoing.filter(e => !e.floodable)

  vec[15] = Math.min(1, floodable.length / 4)
  vec[16] = Math.min(1, nonFloodable.length / 4)
  vec[17] = floodable.some(e => e.currentTravelTicks > e.travelTicks) ? 1.0 : 0.0 // Is floodable route currently slowed?
  vec[18] = Math.min(1, outgoing.length / 6) // Degree of current node (how many choices)

  // Resource availability at neighboring nodes
  const neighborIds = outgoing.map(e => e.from === currentNode ? e.to : e.from)
  const nearbyResources = observation.resources.filter(r => r.available && neighborIds.includes(r.nodeId))
  vec[19] = nearbyResources.length > 0 ? 1.0 : 0.0
  vec[20] = Math.min(1, nearbyResources.reduce((sum, r) => sum + r.value, 0) / rules.capacity)

  // Nearest available resource: distance and value
  const availableResources = observation.resources.filter(r => r.available)
  if (availableResources.length > 0 && !self.transit) {
    const routes = availableResources.map(r => {
      const route = findShortestRoute(observation, r.nodeId)
      return { resource: r, cost: route?.cost ?? Infinity, firstEdge: route?.firstEdge ?? null }
    }).sort((a, b) => a.cost - b.cost)
    const nearest = routes[0]
    vec[21] = Math.max(0, Math.min(1, 1 - nearest.cost / 200)) // Closer = higher value
    vec[22] = Math.min(1, nearest.resource.value / rules.capacity)
    vec[23] = nearest.cost <= self.energy * 20 ? 1.0 : 0.0 // Energy sufficiency for nearest resource
  } else {
    vec[21] = 0; vec[22] = 0; vec[23] = self.transit ? 1.0 : 0.0
  }

  // Rival relative advantage (masked under fog: hidden rivals contribute 0)
  const rival = observation.rivals[0]
  if (rival && rival.visible) {
    vec[24] = Math.min(1, (rival.cargo ?? 0) / rules.capacity)
    vec[25] = Math.min(1, (rival.banked ?? 0) / 10)
    vec[26] = (rival.banked ?? 0) > self.banked ? 1.0 : (rival.banked ?? 0) === self.banked ? 0.5 : 0.0
  } else {
    vec[24] = 0; vec[25] = 0; vec[26] = 0.5
  }

  // Energy budget awareness
  vec[27] = self.energy < rules.drainCost ? 1.0 : 0.0 // Too low to drain
  vec[28] = Math.min(1, outgoing.reduce((sum, e) => sum + Math.ceil(e.travelTicks * rules.moveCostPerTick), 0) / rules.initialEnergy)
  vec[29] = self.energy < rules.initialEnergy * 0.3 ? 1.0 : 0.0 // Low energy warning

  // Total reachable resource value (within 2 hops)
  const twoHopNodes = new Set<string>([currentNode])
  for (const edge of outgoing) {
    const neighbor = edge.from === currentNode ? edge.to : edge.from
    twoHopNodes.add(neighbor)
    for (const edge2 of observation.edges) {
      if (edge2.blocked) continue
      const neighbor2 = edge2.from === neighbor ? edge2.to : edge2.from
      if (neighbor2 !== currentNode) twoHopNodes.add(neighbor2)
    }
  }
  const reachableResources = observation.resources.filter(r => r.available && twoHopNodes.has(r.nodeId))
  vec[30] = Math.min(1, reachableResources.length / 6)
  vec[31] = 1.0 // Bias constant

  return vec
}

/**
 * Finds the shortest route from the agent's current node to a target node.
 */
function findShortestRoute(observation: ArenaObservation, target: string): { cost: number; firstEdge: string | null } | null {
  if (!observation.nodes.some(node => node.id === target)) return null
  const routes = new Map<string, { cost: number; firstEdge: string | null }>([[observation.self.nodeId, { cost: 0, firstEdge: null }]])
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

/**
 * Classifies an action in context of observation into one of 8 action classes.
 */
export function classifyAction(action: ArenaAction, observation: ArenaObservation): number {
  if (action.type === 'wait') return 0
  if (action.type === 'bank') return 1
  if (action.type === 'collect') return 2
  if (action.type === 'drain') return 3
  if (action.type === 'move') {
    const edge = observation.edges.find(e => e.id === action.edgeId)
    if (!edge) return 0
    const targetNode = edge.from === observation.self.nodeId ? edge.to : edge.from
    if (targetNode === observation.self.baseNode) return 7 // move-home
    if (observation.resources.some(r => r.nodeId === targetNode)) return 6 // move-resource
    if (edge.floodable) return 4 // move-low
    return 5 // move-high
  }
  return 0
}

/**
 * Maps an action class back to the best corresponding legal action from availableActions.
 */
export function selectActionForClass(actionClass: number, observation: ArenaObservation): ArenaAction {
  const available = observation.availableActions
  if (available.length === 0) return { type: 'wait' }

  switch (actionClass) {
    case 1: { // bank
      const bank = available.find(a => a.type === 'bank')
      if (bank) return bank
      break
    }
    case 2: { // collect
      const collect = available.find(a => a.type === 'collect')
      if (collect) return collect
      break
    }
    case 3: { // drain
      const drain = available.find(a => a.type === 'drain')
      if (drain) return drain
      break
    }
    case 4: { // move-low (floodable)
      const moveLow = available.find(a => {
        if (a.type !== 'move') return false
        const edge = observation.edges.find(e => e.id === a.edgeId)
        return edge?.floodable === true
      })
      if (moveLow) return moveLow
      break
    }
    case 5: { // move-high (non-floodable ridge)
      const moveHigh = available.find(a => {
        if (a.type !== 'move') return false
        const edge = observation.edges.find(e => e.id === a.edgeId)
        return edge && !edge.floodable
      })
      if (moveHigh) return moveHigh
      break
    }
    case 6: { // move-resource
      const moveRes = available.find(a => {
        if (a.type !== 'move') return false
        const edge = observation.edges.find(e => e.id === a.edgeId)
        if (!edge) return false
        const target = edge.from === observation.self.nodeId ? edge.to : edge.from
        return observation.resources.some(r => r.nodeId === target)
      })
      if (moveRes) return moveRes
      break
    }
    case 7: { // move-home
      const moveHome = available.find(a => {
        if (a.type !== 'move') return false
        const edge = observation.edges.find(e => e.id === a.edgeId)
        if (!edge) return false
        const target = edge.from === observation.self.nodeId ? edge.to : edge.from
        return target === observation.self.baseNode
      })
      if (moveHome) return moveHome
      break
    }
  }

  // Fallback: prefer collect > bank > move > wait
  const defaultCollect = available.find(a => a.type === 'collect')
  if (defaultCollect) return defaultCollect
  const defaultBank = available.find(a => a.type === 'bank')
  if (defaultBank) return defaultBank
  const firstMove = available.find(a => a.type === 'move')
  if (firstMove) return firstMove
  return available[0] ?? { type: 'wait' }
}

/**
 * Forward inference through the policy network.
 */
export function forwardPolicy(
  input: Float32Array,
  weights: PolicyWeights
): { logits: Float32Array; hidden1: Float32Array; hidden2: Float32Array } {
  const h1Dim = weights.hidden1.biases.length
  const h2Dim = weights.hidden2.biases.length
  const outDim = weights.actionHead.biases.length

  const h1 = new Float32Array(h1Dim)
  for (let j = 0; j < h1Dim; j++) {
    let sum = weights.hidden1.biases[j]
    for (let i = 0; i < input.length; i++) {
      sum += input[i] * weights.hidden1.weights[i][j]
    }
    h1[j] = Math.tanh(sum)
  }

  const h2 = new Float32Array(h2Dim)
  for (let k = 0; k < h2Dim; k++) {
    let sum = weights.hidden2.biases[k]
    for (let j = 0; j < h1Dim; j++) {
      sum += h1[j] * weights.hidden2.weights[j][k]
    }
    h2[k] = Math.tanh(sum)
  }

  const logits = new Float32Array(outDim)
  for (let l = 0; l < outDim; l++) {
    let sum = weights.actionHead.biases[l]
    for (let k = 0; k < h2Dim; k++) {
      sum += h2[k] * weights.actionHead.weights[k][l]
    }
    logits[l] = sum
  }

  return { logits, hidden1: h1, hidden2: h2 }
}

/**
 * Softmax probability distribution.
 */
export function softmax(logits: Float32Array): Float32Array {
  const max = Math.max(...logits)
  const exp = logits.map(v => Math.exp(v - max))
  const sum = exp.reduce((acc, v) => acc + v, 0)
  return new Float32Array(exp.map(v => v / (sum || 1)))
}

/**
 * Computes a deterministic weight digest string for policy weights.
 * This is a stable fingerprint used for checkpoint identity, not a cryptographic SHA-256.
 */
export function computeWeightsHash(weights: PolicyWeights): string {
  const serialized = JSON.stringify([
    weights.hidden1.weights.map(row => row.map(v => Math.round(v * 100000) / 100000)),
    weights.hidden1.biases.map(v => Math.round(v * 100000) / 100000),
    weights.hidden2.weights.map(row => row.map(v => Math.round(v * 100000) / 100000)),
    weights.hidden2.biases.map(v => Math.round(v * 100000) / 100000),
    weights.actionHead.weights.map(row => row.map(v => Math.round(v * 100000) / 100000)),
    weights.actionHead.biases.map(v => Math.round(v * 100000) / 100000),
  ])

  let hash = 0x811c9dc5
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  const sizeHex = Math.min(0xffff, serialized.length).toString(16).padStart(4, '0')
  // No colons: weightsHash flows into scenario entrant.policyVersion, which is
  // validated against the identifier pattern [a-zA-Z0-9._-] in
  // services/arenaEpisode.ts.
  return `${hex}${sizeHex}`
}

/**
 * Creates an ArenaPolicy function backed by a frozen PolicyCheckpoint.
 */
export function createLearnedPolicy(checkpoint: PolicyCheckpoint): (observation: ArenaObservation) => ArenaAction {
  validateCheckpoint(checkpoint)
  return (observation: ArenaObservation): ArenaAction => {
    if (!observation.decisionDue) return { type: 'wait' }
    if (observation.availableActions.length === 0) return { type: 'wait' }

    const input = encodeObservation(observation)
    const { logits } = forwardPolicy(input, checkpoint.weights)

    // Score all available actions and pick the one corresponding to the highest logit
    let bestAction: ArenaAction = observation.availableActions[0]
    let bestScore = -Infinity

    for (const action of observation.availableActions) {
      const cls = classifyAction(action, observation)
      const score = logits[cls]
      if (score > bestScore) {
        bestScore = score
        bestAction = action
      }
    }

    return bestAction
  }
}

/**
 * Validates a PolicyCheckpoint data structure.
 */
export function validateCheckpoint(checkpoint: PolicyCheckpoint): void {
  if (!checkpoint || typeof checkpoint !== 'object') throw new Error('Invalid checkpoint object')
  if (checkpoint.schemaVersion !== POLICY_SCHEMA_VERSION) throw new Error(`Unsupported checkpoint schema: ${checkpoint.schemaVersion}`)
  if (!checkpoint.id || typeof checkpoint.id !== 'string') throw new Error('Checkpoint requires an id')
  if (!checkpoint.weights) throw new Error('Checkpoint missing weights')

  const { hidden1, hidden2, actionHead } = checkpoint.weights
  if (hidden1.weights.length !== OBSERVATION_FEATURE_DIM || hidden1.weights[0]?.length !== 32) {
    throw new Error(`Invalid hidden1 layer shape: expected ${OBSERVATION_FEATURE_DIM}x32`)
  }
  if (hidden2.weights.length !== 32 || hidden2.weights[0]?.length !== 16) {
    throw new Error('Invalid hidden2 layer shape: expected 32x16')
  }
  if (actionHead.weights.length !== 16 || actionHead.weights[0]?.length !== ACTION_CLASSES) {
    throw new Error(`Invalid actionHead layer shape: expected 16x${ACTION_CLASSES}`)
  }

  const allNumbers = [
    ...hidden1.weights.flat(),
    ...hidden1.biases,
    ...hidden2.weights.flat(),
    ...hidden2.biases,
    ...actionHead.weights.flat(),
    ...actionHead.biases,
  ]
  if (!allNumbers.every(Number.isFinite)) {
    throw new Error('Checkpoint weights contain non-finite numbers')
  }

  if (checkpoint.trainingConfig !== undefined) {
    const tc = checkpoint.trainingConfig
    if (typeof tc !== 'object' || tc === null) throw new Error('Invalid trainingConfig')
    if (!Number.isFinite(tc.epochs) || tc.epochs < 0) throw new Error('Invalid trainingConfig.epochs')
    if (!Number.isFinite(tc.learningRate) || tc.learningRate <= 0) throw new Error('Invalid trainingConfig.learningRate')
    if (!Number.isFinite(tc.momentum) || tc.momentum < 0) throw new Error('Invalid trainingConfig.momentum')
    if (!Number.isFinite(tc.weightDecay) || tc.weightDecay < 0) throw new Error('Invalid trainingConfig.weightDecay')
  }

  if (checkpoint.evaluationRecords !== undefined) {
    if (!Array.isArray(checkpoint.evaluationRecords)) throw new Error('Invalid evaluationRecords')
    for (const rec of checkpoint.evaluationRecords) {
      if (typeof rec !== 'object' || rec === null) throw new Error('Invalid evaluation record')
      if (typeof rec.scenarioId !== 'string' || (rec.split !== 'practice' && rec.split !== 'evaluation')) {
        throw new Error('Invalid evaluation record scenarioId/split')
      }
      if (!Number.isFinite(rec.banked) || (rec.winner !== 'champion' && rec.winner !== 'rival' && rec.winner !== null)) {
        throw new Error('Invalid evaluation record banked/winner')
      }
      if (!Number.isFinite(rec.recoveries) || !Number.isFinite(rec.weatherDrains)) {
        throw new Error('Invalid evaluation record recoveries/weatherDrains')
      }
      if (typeof rec.recordedAt !== 'string') throw new Error('Invalid evaluation record recordedAt')
    }
  }
}

/**
 * Generates an initial baseline policy checkpoint.
 */
export function createBaseCheckpoint(seed = 42): PolicyCheckpoint {
  function seededRandom(s: number) {
    let t = s % 2147483647
    return () => {
      t = (t * 16807) % 2147483647
      return (t - 1) / 2147483646
    }
  }

  const rand = seededRandom(seed)
  const initLayer = (inDim: number, outDim: number) => {
    const scale = Math.sqrt(2 / (inDim + outDim))
    const weights: number[][] = []
    for (let i = 0; i < inDim; i++) {
      const row: number[] = []
      for (let j = 0; j < outDim; j++) {
        row.push((rand() * 2 - 1) * scale)
      }
      weights.push(row)
    }
    const biases = new Array(outDim).fill(0)
    return { weights, biases }
  }

  const hidden1 = initLayer(OBSERVATION_FEATURE_DIM, 32)
  const hidden2 = initLayer(32, 16)
  const actionHead = initLayer(16, ACTION_CLASSES)

  // Bias base initialization: slightly favor collect (cls 2) and bank (cls 1) when legal
  actionHead.biases[1] = 0.5 // bank
  actionHead.biases[2] = 0.8 // collect
  actionHead.biases[4] = 0.2 // move-low (default aggressive)
  actionHead.biases[5] = 0.1 // move-high

  const weights: PolicyWeights = { hidden1, hidden2, actionHead }
  const weightsHash = computeWeightsHash(weights)

  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id: 'champion-baseline-s0',
    name: 'Champion Base (Season 0)',
    parentCheckpointId: null,
    createdAt: new Date().toISOString(),
    weightsHash,
    trainingSummary: {
      epochs: 0,
      loss: 0,
      sampleCount: 0,
      datasetHash: 'none',
      accuracy: 0.5,
    },
    weights,
  }
}

export const SEASON_0_BASE_CHECKPOINT: PolicyCheckpoint = Object.freeze(createBaseCheckpoint(1337))
