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
  EDGE_FEATURE_DIM,
  EDGE_HEURISTIC_SCALE,
  type CheckpointEvaluationRecord,
  type PolicyCheckpoint,
  type PolicyWeights,
  encodeObservation,
  encodeEdgeFeatures,
  scoreEdgeWithHead,
  scoreMoveEdge,
  classifyAction,
  forwardPolicy,
  softmax,
  computeWeightsHash,
  createLearnedPolicy,
  validateCheckpoint,
} from './policyModel'

export type TrainingExampleSource = 'draft' | 'approved' | 'generated'

/**
 * Oracle provenance: which teacher produced the preferred action and why it
 * was trusted there. `oracle` names the routing teacher (safe/weather/patience);
 * `consequence` means the label survived a counterfactual rollout check.
 * Human coach approvals keep their own provenance via rationale + source.
 */
export type TrainingExampleProvenance =
  | { kind: 'human' }
  | { kind: 'oracle'; teacher: 'safe' | 'weather' | 'patience'; reason: string }
  | { kind: 'oracle-consequence'; teacher: 'safe' | 'weather' | 'patience'; reason: string; outcomeDelta: number }
  /** Expert iteration (CI syllabus only): the label is the outcome-argmax over
   *  a bounded candidate set, not the teacher's pick; `teacher` names the
   *  overridden teacher action used as the contrast. */
  | { kind: 'outcome-argmax'; teacher: 'safe' | 'weather' | 'patience'; reason: string; outcomeDelta: number }

export interface ArenaTrainingExample {
  id: string
  sourceEpisodeId: string
  tick: number
  observation: ArenaObservation
  originalAction: ArenaAction
  preferredAction: ArenaAction
  rationale: string
  approved: boolean
  source: TrainingExampleSource
  /** Present on generated/oracle examples; absent on legacy + human examples. */
  provenance?: TrainingExampleProvenance
  /** Counterfactual banked delta (oracle minus learner) when measured. */
  outcomeDelta?: number
}

export interface TrainingOptions {
  epochs?: number
  learningRate?: number
  momentum?: number
  weightDecay?: number
  name?: string
  /**
   * Per-example importance weights, aligned with the approved examples array
   * order after filtering (approved only). Defaults to uniform. Consequence
   * supervision passes normalized outcome deltas here so high-stakes frames
   * (flood timing, drain calls) move the weights more than routine routing.
   */
  sampleWeights?: readonly number[]
  /**
   * Deterministic step decay (browser coach path): the effective learning
   * rate is `learningRate` until `atEpoch`, then `learningRate * factor`.
   * Recorded in the checkpoint's trainingConfig — the artifact manifest
   * must fully describe the optimizer that produced the weights.
   */
  learningRateDecay?: { atEpoch: number; factor: number }
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
    ...(w.edgeHead
      ? {
          edgeHead: {
            weights: w.edgeHead.weights.map(row => [...row]),
            biases: [...w.edgeHead.biases],
          },
        }
      : {}),
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
  if (parent.schemaVersion !== POLICY_SCHEMA_VERSION) {
    throw new Error(
      `checkpoint-execution-mismatch (cannot fine-tune a ${parent.schemaVersion} parent under the v3 edge-head trainer — start from the v3 base and re-train its examples)`,
    )
  }

  const approvedExamples = examples.filter(e => e.approved)
  if (approvedExamples.length === 0) {
    throw new Error('Training requires at least one approved coaching example')
  }

  const epochs = options.epochs ?? 40
  const lr = options.learningRate ?? 0.03
  const momentum = options.momentum ?? 0.85
  const weightDecay = options.weightDecay ?? 0.0001
  const name = options.name ?? `Champion (Trained +${approvedExamples.length} examples)`
  const sampleWeights = options.sampleWeights
  if (sampleWeights !== undefined && sampleWeights.length !== approvedExamples.length) {
    throw new Error(
      `sampleWeights length ${sampleWeights.length} does not match approved examples ${approvedExamples.length}`,
    )
  }
  const lrDecay = options.learningRateDecay
  if (lrDecay !== undefined) {
    if (!Number.isInteger(lrDecay.atEpoch) || lrDecay.atEpoch < 0 || lrDecay.atEpoch >= epochs) {
      throw new Error(`Invalid learningRateDecay.atEpoch: ${lrDecay.atEpoch} (want integer in [0, ${epochs - 1}])`)
    }
    if (!Number.isFinite(lrDecay.factor) || lrDecay.factor <= 0 || lrDecay.factor > 1) {
      throw new Error(`Invalid learningRateDecay.factor: ${lrDecay.factor} (want (0, 1])`)
    }
  }

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

  // v3 edge-pointer head: linear EDGE_FEATURE_DIM->1. validateCheckpoint
  // guarantees the shape on a v3 parent.
  const edgeHead = weights.edgeHead!
  const vWEdge = edgeHead.weights.map(row => new Array(row.length).fill(0))
  const vBEdge = new Array(edgeHead.biases.length).fill(0)
  const EDGE_CE_WEIGHT = 1.0

  // Pre-encode datasets
  const dataset = approvedExamples.map((example, index) => {
    const input = encodeObservation(example.observation)
    const targetClass = classifyAction(example.preferredAction, example.observation)
    const weight = sampleWeights?.[index] ?? 1
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(`Invalid sample weight at index ${index}: ${String(sampleWeights?.[index])}`)
    }
    // Edge-pointer supervision: the chosen road among the same legal
    // same-class candidates the executor will rank at inference. Candidate
    // sets and feature encoding are precomputed so the epoch loop never runs
    // the Dijkstra-heavy edge features again.
    // Residual edge supervision (v3): softmax over executor-score/scale +
    // head tilt, matching edgeResidualScore at inference. Candidates the
    // executor distrusts (-Infinity traps) are not rankable by the head and
    // are dropped; examples whose own label is trapped get no edge term.
    let edge: { bases: number[]; features: Float32Array[]; target: number } | null = null
    const preferred = example.preferredAction
    if (preferred.type === 'move' && preferred.edgeId && targetClass >= 4 && targetClass <= 7) {
      const cls = targetClass as 4 | 5 | 6 | 7
      const ids = [...new Set(
        example.observation.availableActions.flatMap(a =>
          a.type === 'move' && classifyAction(a, example.observation) === targetClass ? [a.edgeId] : [],
        ),
      )]
      const candidates = ids.filter(id => Number.isFinite(scoreMoveEdge(example.observation, id, cls)))
      const target = candidates.indexOf(preferred.edgeId)
      if (target >= 0 && candidates.length > 1) {
        edge = {
          bases: candidates.map(id => scoreMoveEdge(example.observation, id, cls) / EDGE_HEURISTIC_SCALE),
          features: candidates.map(id => encodeEdgeFeatures(example.observation, id)),
          target,
        }
      }
    }
    return { input, targetClass, weight, edge }
  })
  const meanWeight = dataset.reduce((sum, entry) => sum + entry.weight, 0) / Math.max(1, dataset.length)

  let finalLoss = 0
  let correctCount = 0

  for (let epoch = 0; epoch < epochs; epoch++) {
    const lrEpoch = lrDecay && epoch >= lrDecay.atEpoch ? lr * lrDecay.factor : lr
    let epochLoss = 0
    correctCount = 0

    for (const { input, targetClass, weight, edge } of dataset) {
      // Forward pass
      const { logits, hidden1, hidden2 } = forwardPolicy(input, weights)
      const probs = softmax(logits)

      // Loss: weighted cross entropy (normalized so lr stays comparable).
      const importance = meanWeight > 0 ? weight / meanWeight : 1
      const prob = Math.max(1e-7, probs[targetClass])
      epochLoss += -Math.log(prob) * importance

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

      // Output gradient: dL / dLogits = importance * (p - y)
      const dLogits = new Float32Array(outDim)
      for (let i = 0; i < outDim; i++) {
        dLogits[i] = (probs[i] - (i === targetClass ? 1.0 : 0.0)) * importance
      }

      // Action head gradients & backprop to hidden2
      const dH2 = new Float32Array(h2Dim)
      for (let l = 0; l < outDim; l++) {
        const gradL = dLogits[l]
        vBOut[l] = momentum * vBOut[l] - lrEpoch * (gradL + weightDecay * weights.actionHead.biases[l])
        weights.actionHead.biases[l] += vBOut[l]

        for (let k = 0; k < h2Dim; k++) {
          const gradW = gradL * hidden2[k]
          vWOut[k][l] = momentum * vWOut[k][l] - lrEpoch * (gradW + weightDecay * weights.actionHead.weights[k][l])
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
        vB2[k] = momentum * vB2[k] - lrEpoch * (gradK + weightDecay * weights.hidden2.biases[k])
        weights.hidden2.biases[k] += vB2[k]

        for (let j = 0; j < h1Dim; j++) {
          const gradW = gradK * hidden1[j]
          vW2[j][k] = momentum * vW2[j][k] - lrEpoch * (gradW + weightDecay * weights.hidden2.weights[j][k])
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
        vB1[j] = momentum * vB1[j] - lrEpoch * (gradJ + weightDecay * weights.hidden1.biases[j])
        weights.hidden1.biases[j] += vB1[j]

        for (let i = 0; i < OBSERVATION_FEATURE_DIM; i++) {
          const gradW = gradJ * input[i]
          vW1[i][j] = momentum * vW1[i][j] - lrEpoch * (gradW + weightDecay * weights.hidden1.weights[i][j])
          weights.hidden1.weights[i][j] += vW1[i][j]
        }
      }

      // v3 edge-pointer head: softmax cross-entropy over the same-class
      // candidate roads. Scores are read from the pre-update head, mirroring
      // the class pass (one SGD step per example per epoch).
      if (edge) {
        const scores = edge.features.map((f, c) => edge.bases[c] + scoreEdgeWithHead(edgeHead, f))
        const maxScore = Math.max(...scores)
        const exps = scores.map(s => Math.exp(s - maxScore))
        const expSum = exps.reduce((a, v) => a + v, 0) || 1
        const probsE = exps.map(v => v / expSum)
        const pTarget = Math.max(1e-7, probsE[edge.target])
        epochLoss += -EDGE_CE_WEIGHT * Math.log(pTarget) * importance
        const biasGrad = edge.features.reduce((acc, _f, c) =>
          acc + (probsE[c] - (c === edge.target ? 1 : 0)), 0) * EDGE_CE_WEIGHT * importance
        for (let i = 0; i < EDGE_FEATURE_DIM; i++) {
          let gradW = 0
          for (let c = 0; c < probsE.length; c++) {
            gradW += EDGE_CE_WEIGHT * (probsE[c] - (c === edge.target ? 1 : 0)) * importance * edge.features[c][i]
          }
          vWEdge[i][0] = momentum * vWEdge[i][0] - lrEpoch * (gradW + weightDecay * edgeHead.weights[i][0])
          edgeHead.weights[i][0] += vWEdge[i][0]
        }
        vBEdge[0] = momentum * vBEdge[0] - lrEpoch * (biasGrad + weightDecay * edgeHead.biases[0])
        edgeHead.biases[0] += vBEdge[0]
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
    trainingConfig: {
      epochs,
      learningRate: lr,
      momentum,
      weightDecay,
      ...(lrDecay ? { learningRateDecay: { atEpoch: lrDecay.atEpoch, factor: lrDecay.factor } } : {}),
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

export interface ScenarioEvaluationBreakdown {
  scenarioId: string
  split: 'practice' | 'evaluation'
  banked: number
  winner: 'champion' | 'rival' | null
  recoveries: number
  weatherDrains: number
}

export interface CheckpointComparison {
  baseline: EvaluationResult
  candidate: EvaluationResult
  perScenario: { scenarioId: string; baseline: ScenarioEvaluationBreakdown; candidate: ScenarioEvaluationBreakdown; delta: number }[]
  totalDelta: number
  regressions: string[]
  improvements: string[]
}

/**
 * Evaluates a single checkpoint on a single scenario and returns a per-scenario breakdown.
 */
export function evaluateCheckpointScenario(
  checkpoint: PolicyCheckpoint,
  scenario: ArenaScenario
): ScenarioEvaluationBreakdown {
  const policy = createLearnedPolicy(checkpoint)
  const episode = new ArenaEpisode(scenario)
  let weatherDrains = 0

  while (!episode.finished) {
    const tick = episode.tick
    if (tick % ARENA_RULES.decisionEveryTicks === 0) {
      const champObs = episode.observe('champion')
      const rivalObs = episode.observe('rival')
      const champAction = policy(champObs)
      const rivalAction = defaultRivalPolicy(rivalObs)
      if (champAction.type === 'drain') weatherDrains++
      episode.step([
        { agentId: 'champion', tick, action: champAction },
        { agentId: 'rival', tick, action: rivalAction },
      ])
    } else {
      episode.step()
    }
  }

  const snap = episode.snapshot()
  const champ = snap.agents.find(a => a.id === 'champion')!
  return {
    scenarioId: scenario.id,
    split: scenario.split,
    banked: champ.banked,
    winner: snap.winner as 'champion' | 'rival' | null,
    recoveries: champ.recoveries,
    weatherDrains,
  }
}

/**
 * Compares a candidate checkpoint against a baseline on matched scenarios.
 * Reports per-scenario deltas, total improvement, and explicit regression/improvement lists
 * so the caller can report failures as well as scores.
 */
export function compareCheckpoints(
  baseline: PolicyCheckpoint,
  candidate: PolicyCheckpoint,
  scenarios: readonly ArenaScenario[]
): CheckpointComparison {
  const baselineEval = evaluatePolicyCheckpoint(baseline, scenarios)
  const candidateEval = evaluatePolicyCheckpoint(candidate, scenarios)
  const perScenario = scenarios.map(scenario => {
    const base = evaluateCheckpointScenario(baseline, scenario)
    const cand = evaluateCheckpointScenario(candidate, scenario)
    return {
      scenarioId: scenario.id,
      baseline: base,
      candidate: cand,
      delta: cand.banked - base.banked,
    }
  })
  const totalDelta = candidateEval.totalBanked - baselineEval.totalBanked
  const regressions = perScenario.filter(s => s.delta < 0).map(s => s.scenarioId)
  const improvements = perScenario.filter(s => s.delta > 0).map(s => s.scenarioId)
  return { baseline: baselineEval, candidate: candidateEval, perScenario, totalDelta, regressions, improvements }
}

/**
 * Attaches evaluation records to a checkpoint, returning a new checkpoint with the records appended.
 * This makes evaluation evidence part of the artifact manifest, as required by the target contract.
 */
export function attachEvaluationRecords(
  checkpoint: PolicyCheckpoint,
  scenarios: readonly ArenaScenario[]
): PolicyCheckpoint {
  const records: CheckpointEvaluationRecord[] = scenarios.map(scenario => {
    const breakdown = evaluateCheckpointScenario(checkpoint, scenario)
    return {
      scenarioId: breakdown.scenarioId,
      split: breakdown.split,
      banked: breakdown.banked,
      winner: breakdown.winner,
      recoveries: breakdown.recoveries,
      weatherDrains: breakdown.weatherDrains,
      recordedAt: new Date().toISOString(),
    }
  })
  return { ...checkpoint, evaluationRecords: records }
}
