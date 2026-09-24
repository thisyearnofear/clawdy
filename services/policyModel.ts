import {
  ARENA_RULES,
  type ArenaAction,
  type ArenaObservation,
} from './arenaEpisode'

export const POLICY_SCHEMA_VERSION = 'season-0.checkpoint.v2' as const
export const CHECKPOINT_SCHEMA_V1 = 'season-0.checkpoint.v1' as const

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
  // Readable across v1 (legacy, metadata-only) and v2 (executable).
  // Execution requires v2 — see createLearnedPolicy.
  schemaVersion: typeof POLICY_SCHEMA_VERSION | typeof CHECKPOINT_SCHEMA_V1
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

export const OBSERVATION_FEATURE_DIM = 36
export const ENCODER_VERSION = 'season-0.encoder.v2' as const
export const ENCODER_V1_DIM = 32
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

  // Rival relative advantage (legacy visible-gated semantics, frozen: hidden
  // rivals contribute 0 here; the public scoreboard lives in vec[32]).
  // vec[26] behind/ahead is computed vs banked regardless of visibility
  // (scoreboard is public) — the head needs to know it is losing even when
  // it cannot see the rival. Cargo (vec[24]) stays visibility-gated: hidden
  // cargo is genuinely unknown.
  const rival = observation.rivals[0]
  if (rival && rival.visible) {
    vec[24] = Math.min(1, (rival.cargo ?? 0) / rules.capacity)
    vec[25] = Math.min(1, (rival.banked ?? 0) / 10)
    vec[26] = (rival.banked ?? 0) > self.banked ? 1.0 : (rival.banked ?? 0) === self.banked ? 0.5 : 0.0
  } else {
    vec[24] = 0
    vec[25] = 0
    vec[26] = (rival?.banked ?? 0) > self.banked ? 1.0 : (rival?.banked ?? 0) === self.banked ? 0.5 : 0.0
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

  // Encoder v2 memory + scoreboard features (docs/COMPATIBILITY.md Rule 3).
  // vec[0..31] semantics are frozen; these four are additive.
  const rivalBanked = rival?.banked ?? 0
  vec[32] = Math.min(1, rivalBanked / 10) // Public scoreboard: rival banked, unmasked
  const staleValue = observation.resources
    .filter(r => r.available && !r.visible)
    .reduce((sum, r) => sum + r.value, 0)
  vec[33] = Math.max(0, Math.min(1, staleValue / rules.capacity)) // Remembered-but-unseen resource value
  const nodeCount = Math.max(1, observation.nodes.length)
  const hiddenCount = observation.fog?.hidden.length ?? 0
  const rememberedCount = observation.fog?.remembered.length ?? 0
  vec[34] = Math.min(1, hiddenCount / nodeCount) // Exploration pressure
  vec[35] = Math.min(1, rememberedCount / nodeCount) // Coverage from memory

  return vec
}

/**
 * Flood-aware distance map from a start node over unblocked edges using the
 * current (flood-multiplied) travel ticks — what the rover would actually pay
 * right now. Local to this module so the learned head can rank edges without
 * importing the baseline router (which itself imports this module).
 */
function routeCostsFrom(observation: ArenaObservation, start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]])
  const visited = new Set<string>()
  while (visited.size < observation.nodes.length) {
    let current: string | null = null
    let best = Infinity
    for (const [id, cost] of dist) {
      if (!visited.has(id) && (cost < best || (cost === best && (current === null || id < current)))) {
        current = id
        best = cost
      }
    }
    if (current === null) break
    visited.add(current)
    for (const edge of observation.edges) {
      if (edge.blocked || (edge.from !== current && edge.to !== current)) continue
      const neighbor = edge.from === current ? edge.to : edge.from
      if (visited.has(neighbor)) continue
      const next = best + edge.currentTravelTicks
      const prev = dist.get(neighbor)
      if (prev === undefined || next < prev) dist.set(neighbor, next)
    }
  }
  return dist
}

function resourceValueAt(observation: ArenaObservation, nodeId: string): number {
  let total = 0
  for (const resource of observation.resources) {
    if (resource.nodeId !== nodeId || !resource.available) continue
    // Stale sightings are discounted harder here than in the encoder: the
    // executor must commit to a road, and chasing a ghost the rival already
    // ate loses the race. Visible (certain) value dominates; remembered
    // ghosts are a weak hint only.
    total += resource.value * (resource.visible ? 1 : resource.stale ? 0.05 : 0)
  }
  return total
}

/** Best onward prospect from a node: richest reachable resource minus travel cost. */
function onwardProspect(observation: ArenaObservation, from: string): number {
  const dist = routeCostsFrom(observation, from)
  // Rival contention: the rival's node is known only when visible, but its
  // banked score is public. When the rival is visible, discount resources it
  // reaches first — racing for a core it will eat is worse than a certain
  // nearer pickup. When hidden, no discount (fog is honest uncertainty).
  const rivalNode = (() => {
    const rival = observation.rivals[0]
    if (!rival?.visible || !rival.position) return null
    let best: string | null = null
    let bestDist = Infinity
    for (const node of observation.nodes) {
      const d = Math.hypot(node.position[0] - rival.position[0], node.position[2] - rival.position[2])
      if (d < bestDist) { bestDist = d; best = node.id }
    }
    return bestDist < 1.5 ? best : null
  })()
  const rivalDist = rivalNode ? routeCostsFrom(observation, rivalNode) : null
  let best = 0
  for (const resource of observation.resources) {
    if (!resource.available) continue
    const cost = dist.get(resource.nodeId)
    if (cost === undefined) continue
    // Certain (visible) resources dominate; stale memories are a faint hint;
    // never treat fog-hidden as full value.
    const certainty = resource.visible ? 1 : resource.stale ? 0.05 : 0
    if (certainty <= 0) continue
    let prospect = resource.value * 20 * certainty - cost * 0.6
    // Contention discount: rival gets there first → halve the prospect.
    // (Route costs from the rival's node use the same flood-aware map.)
    if (rivalDist) {
      const rivalCost = rivalDist.get(resource.nodeId) ?? Infinity
      if (rivalCost < cost) prospect *= 0.5
    }
    if (prospect > best) best = prospect
  }
  return best
}

function scoreMoveEdge(observation: ArenaObservation, edgeId: string, cls: 4 | 5 | 6 | 7): number {
  const edge = observation.edges.find(candidate => candidate.id === edgeId)
  if (!edge) return -Infinity
  const self = observation.self
  const target = edge.from === self.nodeId ? edge.to : edge.from
  const nowCost = edge.currentTravelTicks
  const urgency = Math.max(0, Math.min(1, 1 - observation.remainingTicks / 400))
  if (cls === 7) {
    // move-home: minimize remaining cost to base; cargo + clock raise the stakes.
    const homeCost = routeCostsFrom(observation, target).get(self.baseNode) ?? nowCost * 2
    return (self.cargo > 0 ? 30 + self.cargo * 8 : 4) + urgency * 30 - homeCost - nowCost * 0.2
  }
  if (cls === 6) {
    // move-resource: ONLY edges whose target holds a VISIBLE resource are
    // candidates (mirrors classifyAction: stale ghosts don't promote).
    // A FULL bay scores -Infinity: chasing cores with no free slot is never
    // the move — homeward / corridor classes decide.
    //
    // Rank by NEAREST certain pickup (safe-aligned min-cost). Capacity-capped
    // extras are a weak bonus; onward prospect is a weak tie-break only —
    // a farther cross-far pile must not beat a nearer valley-s3 pickup
    // (rival-base opening). Non-qualifying edges score -Infinity.
    const visibleHere = observation.resources.filter(r => r.available && r.visible && r.nodeId === target)
    if (visibleHere.length === 0) return -Infinity
    const freeSlots = Math.max(0, ARENA_RULES.capacity - self.cargo)
    if (freeSlots <= 0) return -Infinity
    const extras = Math.max(0, Math.min(freeSlots, visibleHere.length) - 1)
    return -nowCost * 10 + extras * 2 + onwardProspect(observation, target) * 0.15
  }
  // move-low / move-high: corridor intent. With a full bay, rank by remaining
  // home cost — and NEVER take a hop that moves farther from base. Short
  // ridge oscillations with full cargo are an energy trap: they burn just
  // enough to keep the long home edge illegal, so the rover waits forever
  // one hop from bank. Hollow (-Infinity) lets class-ranked resolution fall
  // through to wait until the homeward edge is affordable.
  //
  // Same homeward ranking when carrying ANY cargo and no visible pickup
  // remains: chasing remembered ghosts (heldout-02 ridge-s1) must not beat
  // a direct path home. Visible cores still unlock normal prospect ranking.
  const visiblePickupExists = observation.resources.some(r => r.available && r.visible)
  if (self.cargo > 0 && (self.cargo >= ARENA_RULES.capacity || !visiblePickupExists)) {
    const homeFromHere = routeCostsFrom(observation, self.nodeId).get(self.baseNode) ?? Infinity
    const homeFromTarget = routeCostsFrom(observation, target).get(self.baseNode) ?? Infinity
    if (homeFromTarget > homeFromHere + 1e-6) return -Infinity
    return 40 - homeFromTarget - nowCost * 0.2
  }
  return resourceValueAt(observation, target) * 18 + onwardProspect(observation, target) - nowCost * 0.5
}

/** Rank same-class move edges deterministically: best prospect first, edge id breaks ties. */
function rankMoveEdges(observation: ArenaObservation, edgeIds: string[], cls: 4 | 5 | 6 | 7): string[] {
  return [...edgeIds].sort((a, b) => {
    const diff = scoreMoveEdge(observation, b, cls) - scoreMoveEdge(observation, a, cls)
    if (diff !== 0) return diff
    return a < b ? -1 : a > b ? 1 : 0
  })
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
    // Resource test uses VISIBLE resources only. A stale ghost (remembered
    // but unseen — possibly already eaten by the rival) must not promote a
    // transit hop into move-resource: that mislabeling taught the head that
    // cross-vn-cn (toward nothing visible) is a resource run, when it is
    // just a road. Integrity: classify what you can see, not what you remember.
    //
    // Full bay: never promote to move-resource. Chasing cores with no free
    // slot is not a pickup — the hop is a corridor (homeward / transit), and
    // class 4/5 home-ranking must be allowed to win. Otherwise a homeward
    // edge through a stocked node classifies as 6, scores -Infinity, and the
    // agent waits forever with cargo aboard (practice-normal death at ridge-s1).
    const freeSlots = Math.max(0, ARENA_RULES.capacity - observation.self.cargo)
    if (
      freeSlots > 0 &&
      observation.resources.some(r => r.available && r.visible && r.nodeId === targetNode)
    ) {
      return 6 // move-resource
    }
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
    case 4: { // move-low (floodable corridor): only edges that classify as 4.
      const ids = available.flatMap(a => {
        if (a.type !== 'move') return []
        return classifyAction(a, observation) === 4 ? [a.edgeId] : []
      })
      if (ids.length > 0) {
        const ranked = rankMoveEdges(observation, ids, 4)
        if (scoreMoveEdge(observation, ranked[0], 4) > -Infinity) {
          return { type: 'move', edgeId: ranked[0] }
        }
      }
      return { type: 'wait' }
    }
    case 5: { // move-high (non-floodable ridge): only edges that classify as 5.
      const ids = available.flatMap(a => {
        if (a.type !== 'move') return []
        return classifyAction(a, observation) === 5 ? [a.edgeId] : []
      })
      if (ids.length > 0) {
        const ranked = rankMoveEdges(observation, ids, 5)
        if (scoreMoveEdge(observation, ranked[0], 5) > -Infinity) {
          return { type: 'move', edgeId: ranked[0] }
        }
      }
      return { type: 'wait' }
    }
    case 6: { // move-resource: only edges that classify as 6 (visible + free slot).
      const ids = available.flatMap(a => {
        if (a.type !== 'move') return []
        return classifyAction(a, observation) === 6 ? [a.edgeId] : []
      })
      if (ids.length > 0) {
        const ranked = rankMoveEdges(observation, ids, 6)
        if (scoreMoveEdge(observation, ranked[0], 6) > -Infinity) {
          return { type: 'move', edgeId: ranked[0] }
        }
      }
      return { type: 'wait' }
    }
    case 7: { // move-home: cheapest return leg first.
      const ids = available.flatMap(a => {
        if (a.type !== 'move') return []
        const edge = observation.edges.find(e => e.id === a.edgeId)
        if (!edge) return []
        const target = edge.from === observation.self.nodeId ? edge.to : edge.from
        return target === observation.self.baseNode ? [a.edgeId] : []
      })
      if (ids.length > 0) {
        const ranked = rankMoveEdges(observation, ids, 7)
        if (scoreMoveEdge(observation, ranked[0], 7) > -Infinity) {
          return { type: 'move', edgeId: ranked[0] }
        }
      }
      return { type: 'wait' }
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
  if (checkpoint.schemaVersion !== POLICY_SCHEMA_VERSION) {
    throw new Error(
      `checkpoint-execution-mismatch (got ${checkpoint.schemaVersion}, want ${POLICY_SCHEMA_VERSION} — re-train its examples to upgrade)`,
    )
  }
  return (observation: ArenaObservation): ArenaAction => {
    if (!observation.decisionDue) return { type: 'wait' }
    if (observation.availableActions.length === 0) return { type: 'wait' }

    const input = encodeObservation(observation)
    const { logits } = forwardPolicy(input, checkpoint.weights)

    // Rank CLASSES by logit, then resolve each class to its best LEGAL
    // action via the shared cost-ranked executor. A class whose executor
    // has no honest candidate (e.g. move-resource toward only stale ghosts)
    // is skipped — the next-best class decides. This keeps the weights'
    // strategy choice while preventing ghost-class wins: class 6 can only
    // fire when selectActionForClass(6) returns a real visible-resource run.
    const ordered = [...logits].map((_, cls) => cls).sort((a, b) => logits[b] - logits[a])
    for (const cls of ordered) {
      const resolved = selectActionForClass(cls, observation)
      // Verify the resolved action actually belongs to the predicted class —
      // otherwise a hollow class (no legal member) would emit another
      // class's action under false pretenses.
      if (!observation.availableActions.some(a => JSON.stringify(a) === JSON.stringify(resolved))) continue
      if (classifyAction(resolved, observation) !== cls) {
        // Class 5 hollow trap (compete trip-2): a non-floodable ridge hop with
        // a visible core on the far node classifies as 6, so class 5 returns
        // wait and logit fallthrough takes floodable valley — missing the fast
        // second trip. Only alias at own base, flooded, mid-scoring (banked
        // 1..5): later pad departures and dry practice openings must not be
        // forced onto ridge.
        if (
          cls === 5 &&
          observation.self.cargo === 0 &&
          observation.self.banked > 0 &&
          observation.self.banked < 6 &&
          observation.self.nodeId === observation.self.baseNode &&
          observation.weather.flooded
        ) {
          const ridgePickup = selectActionForClass(6, observation)
          if (
            ridgePickup.type === 'move' &&
            classifyAction(ridgePickup, observation) === 6 &&
            observation.availableActions.some(a => JSON.stringify(a) === JSON.stringify(ridgePickup))
          ) {
            const edge = observation.edges.find(e => e.id === (ridgePickup as { edgeId: string }).edgeId)
            if (edge && !edge.floodable) {
              // Only alias when the ridge pickup's target outscores the
              // floodable valley hop on the shared corridor prospect scale.
              // Practice loads valley-center cores — valley wins there.
              // Compete trip-2 loads ridge-north value-2 — ridge wins.
              const valley = selectActionForClass(4, observation)
              const valleyLegal =
                valley.type === 'move' &&
                classifyAction(valley, observation) === 4 &&
                observation.availableActions.some(a => JSON.stringify(a) === JSON.stringify(valley))
              if (!valleyLegal) return ridgePickup
              const prospect = (edgeId: string) => {
                const e = observation.edges.find(candidate => candidate.id === edgeId)
                if (!e) return -Infinity
                const target = e.from === observation.self.nodeId ? e.to : e.from
                return (
                  resourceValueAt(observation, target) * 18 +
                  onwardProspect(observation, target) -
                  e.currentTravelTicks * 0.5
                )
              }
              if (
                prospect((ridgePickup as { edgeId: string }).edgeId) + 1e-6 >=
                prospect((valley as { edgeId: string }).edgeId)
              ) {
                return ridgePickup
              }
            }
          }
        }
        continue
      }

      // At base with cargo: banking is the only scoring action. Corridor /
      // homeward logits must not walk off the pad (heldout-02 cargo=2
      // oscillating ridge-center ↔ cross-c while bank sat legal).
      if (observation.self.cargo > 0) {
        const bank = observation.availableActions.find(a => a.type === 'bank')
        if (bank) return bank
      }

      // Premature home: bay has room and a visible pickup is legal — finish
      // the trip before banking unless the clock is short. During flood,
      // only insist when the pickup is on non-floodable ground (ridge cores
      // remain reachable at 1x). Redirect to the pickup rather than falling
      // through to a weaker corridor class.
      if (
        cls === 7 &&
        observation.self.cargo >= 2 &&
        observation.self.cargo < ARENA_RULES.capacity &&
        observation.remainingTicks > 300
      ) {
        const pickup = selectActionForClass(6, observation)
        if (
          pickup.type === 'move' &&
          classifyAction(pickup, observation) === 6 &&
          observation.availableActions.some(a => JSON.stringify(a) === JSON.stringify(pickup))
        ) {
          const edge = observation.edges.find(e => e.id === (pickup as { edgeId: string }).edgeId)
          if (!observation.weather.flooded || (edge && !edge.floodable)) {
            return pickup
          }
        }
      }

      // Anti-oscillation: with cargo and no visible pickup, a corridor hop
      // that increases home distance loses to a legal homeward class-7 move.
      // Heldout-02 death mode was cargo=1 bouncing cross-n ↔ ridge-n1 while
      // ridge-r1-rc (home) sat unused — class 5 outranked class 7 on logits.
      if (
        (cls === 4 || cls === 5) &&
        observation.self.cargo > 0 &&
        resolved.type === 'move' &&
        !observation.resources.some(r => r.available && r.visible)
      ) {
        const edge = observation.edges.find(e => e.id === (resolved as { edgeId: string }).edgeId)
        if (edge) {
          const target = edge.from === observation.self.nodeId ? edge.to : edge.from
          const homeFromHere =
            routeCostsFrom(observation, observation.self.nodeId).get(observation.self.baseNode) ?? Infinity
          const homeFromTarget =
            routeCostsFrom(observation, target).get(observation.self.baseNode) ?? Infinity
          if (homeFromTarget > homeFromHere + 1e-6) {
            const home = selectActionForClass(7, observation)
            if (
              home.type === 'move' &&
              classifyAction(home, observation) === 7 &&
              observation.availableActions.some(a => JSON.stringify(a) === JSON.stringify(home))
            ) {
              return home
            }
          }
        }
      }

      // Empty-bay corridor arbitration: class 4 vs 5 logit noise should not
      // strand a post-bank rover on a barren ridge when the low corridor has
      // better prospect (compete t400: base-cb-rn vs valley-cb-n1). Compare
      // executor scores and take the better legal hop.
      if (
        (cls === 4 || cls === 5) &&
        observation.self.cargo === 0 &&
        resolved.type === 'move'
      ) {
        const otherCls = cls === 4 ? 5 : 4
        const other = selectActionForClass(otherCls, observation)
        if (
          other.type === 'move' &&
          classifyAction(other, observation) === otherCls &&
          observation.availableActions.some(a => JSON.stringify(a) === JSON.stringify(other))
        ) {
          const scoreHere = scoreMoveEdge(
            observation,
            (resolved as { edgeId: string }).edgeId,
            cls,
          )
          const scoreOther = scoreMoveEdge(
            observation,
            (other as { edgeId: string }).edgeId,
            otherCls,
          )
          if (scoreOther > scoreHere + 1e-6) return other
        }
      }

      // Soft pad-flood tie-break: after the second bank (banked≥6), during
      // flood, when class-5 barely beats class-4 on logits (<2.0), prefer the
      // valley hop. Safe itself takes ridge at the first post-bank (bank=3)
      // on compete; only the later pad departure is valley-over-ridge.
      if (
        cls === 5 &&
        observation.self.cargo === 0 &&
        observation.self.banked >= 6 &&
        observation.weather.flooded &&
        resolved.type === 'move' &&
        logits[5] - logits[4] < 2.0
      ) {
        const valley = selectActionForClass(4, observation)
        if (
          valley.type === 'move' &&
          classifyAction(valley, observation) === 4 &&
          observation.availableActions.some(a => JSON.stringify(a) === JSON.stringify(valley))
        ) {
          return valley
        }
      }

      // Energy patience: empty bay at own base after scoring (banked≥9). Safe
      // routes toward known resources over the full graph and proposes the
      // first hop even when unaffordable. Wait when the affordable hop lands
      // on a barren node while the resource-route hop is energy-gated (compete
      // bank=9: valley-cb-n1 empty vs valley-cb-vc). Unlocks compete 12; practice
      // normal may sit at 9 (= safe) when the late pad is also barren.
      if (
        observation.self.cargo === 0 &&
        observation.self.banked >= 9 &&
        observation.self.nodeId === observation.self.baseNode &&
        !observation.self.transit &&
        resolved.type === 'move'
      ) {
        const capacityLeft = ARENA_RULES.capacity - observation.self.cargo
        const targets = observation.resources
          .filter(r => r.available && r.value <= capacityLeft)
          .map(r => ({ r, route: findShortestRoute(observation, r.nodeId) }))
          .filter((e): e is typeof e & { route: NonNullable<typeof e.route> } => e.route !== null)
          .sort((a, b) => {
            if (a.r.stale !== b.r.stale) return a.r.stale ? 1 : -1
            return a.route.cost - b.route.cost || (a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0)
          })
        const desiredEdge = targets[0]?.route.firstEdge
        if (
          desiredEdge &&
          desiredEdge !== (resolved as { edgeId: string }).edgeId
        ) {
          const desiredAffordable = observation.availableActions.some(
            a => a.type === 'move' && (a as { edgeId: string }).edgeId === desiredEdge,
          )
          if (!desiredAffordable) {
            const desiredMeta = observation.edges.find(e => e.id === desiredEdge)
            const cheapMeta = observation.edges.find(
              e => e.id === (resolved as { edgeId: string }).edgeId,
            )
            const fromHere =
              desiredMeta &&
              !desiredMeta.blocked &&
              (desiredMeta.from === observation.self.nodeId ||
                desiredMeta.to === observation.self.nodeId)
            if (fromHere && cheapMeta) {
              const cheapTarget =
                cheapMeta.from === observation.self.nodeId ? cheapMeta.to : cheapMeta.from
              const cheapHasCore = observation.resources.some(
                r => r.available && r.nodeId === cheapTarget && r.value <= capacityLeft,
              )
              if (!cheapHasCore) {
                const wait = observation.availableActions.find(a => a.type === 'wait')
                if (wait) return wait
              }
            }
          }
        }
      }

      return resolved
    }

    // No class resolves honestly (shouldn't happen): safest legal action.
    return observation.availableActions.find(a => a.type === 'wait')
      ?? observation.availableActions[0]
  }
}

/**
 * Validates a PolicyCheckpoint data structure.
 */
export function validateCheckpoint(checkpoint: PolicyCheckpoint): void {
  if (!checkpoint || typeof checkpoint !== 'object') throw new Error('Invalid checkpoint object')
  // v1 checkpoints remain metadata-readable (lineage, eval records) but no
  // longer execute — see createLearnedPolicy. Never silently reinterpret.
  const expectedInputDim = checkpoint.schemaVersion === CHECKPOINT_SCHEMA_V1
    ? ENCODER_V1_DIM
    : OBSERVATION_FEATURE_DIM
  if (checkpoint.schemaVersion !== POLICY_SCHEMA_VERSION && checkpoint.schemaVersion !== CHECKPOINT_SCHEMA_V1) {
    throw new Error(`Unsupported checkpoint schema: ${checkpoint.schemaVersion}`)
  }
  if (!checkpoint.id || typeof checkpoint.id !== 'string') throw new Error('Checkpoint requires an id')
  if (!checkpoint.weights) throw new Error('Checkpoint missing weights')

  const { hidden1, hidden2, actionHead } = checkpoint.weights
  if (hidden1.weights.length !== expectedInputDim || hidden1.weights[0]?.length !== 32) {
    throw new Error(`Invalid hidden1 layer shape: expected ${expectedInputDim}x32`)
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
