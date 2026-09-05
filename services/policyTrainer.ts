import {
  ARENA_RULES,
  ArenaEpisode,
  type ArenaAction,
  type ArenaObservation,
  type ArenaScenario,
} from './arenaEpisode'
import {
  POLICY_SCHEMA_VERSION,
  OBSERVATION_FEATURE_DIM,
  type PolicyCheckpoint,
  type PolicyWeights,
  encodeObservation,
  classifyAction,
  forwardPolicy,
  softmax,
  computeWeightsHash,
  createLearnedPolicy,
  validateCheckpoint,
} from './policyModel'

export interface ArenaTrainingExample {
  id: string
  sourceEpisodeId: string
  tick: number
  observation: ArenaObservation
  originalAction: ArenaAction
  preferredAction: ArenaAction
  rationale: string
  approved: boolean
}

export interface TrainingOptions {
  epochs?: number
  learningRate?: number
  momentum?: number
  weightDecay?: number
  name?: string
}

export interface EvaluationResult {
  checkpointId: string
  scenariosCount: number
  totalBanked: number
  averageBanked: number
  wins: number
  losses: number
  draws: number
  recoveries: number
  weatherDrains: number
  floodPenaltyTicksAvoided: number
}

function computeDatasetHash(examples: readonly ArenaTrainingExample[]): string {
  const summary = examples
    .filter(e => e.approved)
    .map(e => `${e.sourceEpisodeId}:${e.tick}:${e.preferredAction.type}:${(e.preferredAction as { edgeId?: string }).edgeId ?? ''}`)
    .join('|')

  let hash = 0x811c9dc5
  for (let i = 0; i < summary.length; i++) {
    hash ^= summary.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `ds:${(hash >>> 0).toString(16)}:${examples.length}`
}

function cloneWeights(w: PolicyWeights): PolicyWeights {
  return {
    hidden1: {
      weights: w.hidden1.weights.map(row => [...row]),
      biases: [...w.hidden1.biases],
    },
    hidden2: {
      weights: w.hidden2.weights.map(row => [...row]),
      biases: [...w.hidden2.biases],
    },
    actionHead: {
      weights: w.actionHead.weights.map(row => [...row]),
      biases: [...w.actionHead.biases],
    },
  }
}

/**
 * Trains a new PolicyCheckpoint from approved training examples using backpropagation.
 */
export function trainPolicyCheckpoint(
  parent: PolicyCheckpoint,
  examples: readonly ArenaTrainingExample[],
  options: TrainingOptions = {}
): PolicyCheckpoint {
  validateCheckpoint(parent)

  const approvedExamples = examples.filter(e => e.approved)
  if (approvedExamples.length === 0) {
    throw new Error('Training requires at least one approved coaching example')
  }

  const epochs = options.epochs ?? 40
  const lr = options.learningRate ?? 0.03
  const momentum = options.momentum ?? 0.85
  const weightDecay = options.weightDecay ?? 0.0001
  const name = options.name ?? `Champion (Trained +${approvedExamples.length} examples)`

  const weights = cloneWeights(parent.weights)
  const h1Dim = weights.hidden1.biases.length
  const h2Dim = weights.hidden2.biases.length
  const outDim = weights.actionHead.biases.length

  // Momentum velocity accumulators
  const vW1 = weights.hidden1.weights.map(row => new Array(row.length).fill(0))
  const vB1 = new Array(h1Dim).fill(0)
  const vW2 = weights.hidden2.weights.map(row => new Array(row.length).fill(0))
  const vB2 = new Array(h2Dim).fill(0)
  const vWOut = weights.actionHead.weights.map(row => new Array(row.length).fill(0))
  const vBOut = new Array(outDim).fill(0)

  // Pre-encode datasets
  const dataset = approvedExamples.map(example => {
    const input = encodeObservation(example.observation)
    const targetClass = classifyAction(example.preferredAction, example.observation)
    return { input, targetClass }
  })

  let finalLoss = 0
  let correctCount = 0

  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochLoss = 0
    correctCount = 0

    for (const { input, targetClass } of dataset) {
      // Forward pass
      const { logits, hidden1, hidden2 } = forwardPolicy(input, weights)
      const probs = softmax(logits)

      // Loss: Cross entropy
      const prob = Math.max(1e-7, probs[targetClass])
      epochLoss += -Math.log(prob)

      // Prediction accuracy check
      let predClass = 0
      let maxP = -1
      for (let i = 0; i < probs.length; i++) {
        if (probs[i] > maxP) {
          maxP = probs[i]
          predClass = i
        }
      }
      if (predClass === targetClass) correctCount++

      // Output gradient: dL / dLogits = p - y
      const dLogits = new Float32Array(outDim)
      for (let i = 0; i < outDim; i++) {
        dLogits[i] = probs[i] - (i === targetClass ? 1.0 : 0.0)
      }

      // Action head gradients & backprop to hidden2
      const dH2 = new Float32Array(h2Dim)
      for (let l = 0; l < outDim; l++) {
        const gradL = dLogits[l]
        vBOut[l] = momentum * vBOut[l] - lr * (gradL + weightDecay * weights.actionHead.biases[l])
        weights.actionHead.biases[l] += vBOut[l]

        for (let k = 0; k < h2Dim; k++) {
          const gradW = gradL * hidden2[k]
          vWOut[k][l] = momentum * vWOut[k][l] - lr * (gradW + weightDecay * weights.actionHead.weights[k][l])
          weights.actionHead.weights[k][l] += vWOut[k][l]
          dH2[k] += gradL * weights.actionHead.weights[k][l]
        }
      }

      // Hidden2 activation gradient: tanh'(x) = 1 - tanh(x)^2
      const dH2Act = new Float32Array(h2Dim)
      for (let k = 0; k < h2Dim; k++) {
        dH2Act[k] = dH2[k] * (1 - hidden2[k] * hidden2[k])
      }

      // Hidden2 gradients & backprop to hidden1
      const dH1 = new Float32Array(h1Dim)
      for (let k = 0; k < h2Dim; k++) {
        const gradK = dH2Act[k]
        vB2[k] = momentum * vB2[k] - lr * (gradK + weightDecay * weights.hidden2.biases[k])
        weights.hidden2.biases[k] += vB2[k]

        for (let j = 0; j < h1Dim; j++) {
          const gradW = gradK * hidden1[j]
          vW2[j][k] = momentum * vW2[j][k] - lr * (gradW + weightDecay * weights.hidden2.weights[j][k])
          weights.hidden2.weights[j][k] += vW2[j][k]
          dH1[j] += gradK * weights.hidden2.weights[j][k]
        }
      }

      // Hidden1 activation gradient
      const dH1Act = new Float32Array(h1Dim)
      for (let j = 0; j < h1Dim; j++) {
        dH1Act[j] = dH1[j] * (1 - hidden1[j] * hidden1[j])
      }

      // Hidden1 gradients
      for (let j = 0; j < h1Dim; j++) {
        const gradJ = dH1Act[j]
        vB1[j] = momentum * vB1[j] - lr * (gradJ + weightDecay * weights.hidden1.biases[j])
        weights.hidden1.biases[j] += vB1[j]

        for (let i = 0; i < OBSERVATION_FEATURE_DIM; i++) {
          const gradW = gradJ * input[i]
          vW1[i][j] = momentum * vW1[i][j] - lr * (gradW + weightDecay * weights.hidden1.weights[i][j])
          weights.hidden1.weights[i][j] += vW1[i][j]
        }
      }
    }

    finalLoss = epochLoss / dataset.length
  }

  const accuracy = correctCount / dataset.length
  const weightsHash = computeWeightsHash(weights)
  const checkpointId = `checkpoint-${Date.now().toString(36)}-${weightsHash.slice(-6)}`

  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id: checkpointId,
    name,
    parentCheckpointId: parent.id,
    createdAt: new Date().toISOString(),
    weightsHash,
    trainingSummary: {
      epochs,
      loss: Math.round(finalLoss * 10000) / 10000,
      sampleCount: approvedExamples.length,
      datasetHash: computeDatasetHash(approvedExamples),
      accuracy: Math.round(accuracy * 1000) / 1000,
    },
    weights,
  }
}

/**
 * Runs evaluation of a checkpoint against reference house policies across multiple scenarios.
 */
export function evaluatePolicyCheckpoint(
  checkpoint: PolicyCheckpoint,
  scenarios: readonly ArenaScenario[]
): EvaluationResult {
  const policy = createLearnedPolicy(checkpoint)
  let totalBanked = 0
  let wins = 0
  let losses = 0
  let draws = 0
  let recoveries = 0
  let weatherDrains = 0
  let floodPenaltyTicksAvoided = 0

  for (const scenario of scenarios) {
    const episode = new ArenaEpisode(scenario)

    while (!episode.finished) {
      const tick = episode.tick
      if (tick % ARENA_RULES.decisionEveryTicks === 0) {
        const champObs = episode.observe('champion')
        const rivalObs = episode.observe('rival')

        const champAction = policy(champObs)
        // Rival uses reference greedy routing
        const rivalAction = defaultRivalPolicy(rivalObs)

        if (champAction.type === 'drain') weatherDrains++
        if (champAction.type === 'move') {
          const edge = champObs.edges.find(e => e.id === champAction.edgeId)
          if (edge && !edge.floodable && champObs.weather.flooded) {
            floodPenaltyTicksAvoided += edge.travelTicks * (ARENA_RULES.floodTravelMultiplier - 1)
          }
        }

        episode.step([
          { agentId: 'champion', tick, action: champAction },
          { agentId: 'rival', tick, action: rivalAction },
        ])
      } else {
        episode.step()
      }
    }

    const snap = episode.snapshot()
    const champ = snap.agents.find(a => a.id === 'champion')

    if (champ) {
      totalBanked += champ.banked
      recoveries += champ.recoveries
    }

    if (snap.winner === 'champion') wins++
    else if (snap.winner === 'rival') losses++
    else draws++
  }

  return {
    checkpointId: checkpoint.id,
    scenariosCount: scenarios.length,
    totalBanked,
    averageBanked: scenarios.length > 0 ? totalBanked / scenarios.length : 0,
    wins,
    losses,
    draws,
    recoveries,
    weatherDrains,
    floodPenaltyTicksAvoided,
  }
}

function defaultRivalPolicy(obs: ArenaObservation): ArenaAction {
  if (!obs.decisionDue) return { type: 'wait' }
  const available = obs.availableActions
  const bank = available.find(a => a.type === 'bank')
  if (bank && obs.self.cargo >= ARENA_RULES.capacity) return bank
  const collect = available.find(a => a.type === 'collect')
  if (collect) return collect
  const move = available.find(a => a.type === 'move')
  if (move) return move
  return { type: 'wait' }
}
