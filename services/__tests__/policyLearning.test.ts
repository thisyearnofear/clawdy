import { describe, expect, it } from 'vitest'
import {
  SEASON_0_BASE_CHECKPOINT,
  encodeObservation,
  forwardPolicy,
  createLearnedPolicy,
  validateCheckpoint,
  createBaseCheckpoint,
} from '../policyModel'
import {
  trainPolicyCheckpoint,
  evaluatePolicyCheckpoint,
  type ArenaTrainingExample,
} from '../policyTrainer'
import { proposeCorrection, COACHING_RULES } from '../coachingEngine'
import { ARENA_RULES, type ArenaObservation, type ArenaScenario } from '../arenaEpisode'

function mockObservation(overrides: Partial<ArenaObservation> = {}): ArenaObservation {
  return {
    schemaVersion: 'arena-observation-v1',
    rulesVersion: ARENA_RULES.version,
    tick: 100,
    remainingTicks: 1100,
    decisionDue: true,
    self: {
      id: 'champion',
      baseNode: 'station-west',
      policyVersion: 'test',
      nodeId: 'station-west',
      position: [-2, 0, 0],
      transit: null,
      energy: 3,
      cargo: 1,
      banked: 0,
      cooldownUntilTick: 0,
      lastOutcome: null,
      visitedNodes: ['station-west'],
      knownResources: [],
      grounded: true,
      rotation: [0, 0, 0, 1],
      blockedTicks: 0,
      blockedEdges: [],
      recoveries: 0,
    },
    rivals: [{ id: 'rival', position: [2, 0, 0], cargo: 0, banked: 0, visible: true }],
    nodes: [
      { id: 'station-west', position: [-2, 0, 0] },
      { id: 'station-east', position: [2, 0, 0] },
      { id: 'station-ridge', position: [0, 1.5, 2] },
    ],
    edges: [
      { id: 'valley-road', from: 'station-west', to: 'station-east', travelTicks: 30, currentTravelTicks: 30, floodable: true, blocked: false },
      { id: 'ridge-road', from: 'station-west', to: 'station-ridge', travelTicks: 45, currentTravelTicks: 45, floodable: false, blocked: false },
    ],
    resources: [{ id: 'core-1', nodeId: 'station-east', value: 1, available: true, visible: true, stale: false }],
    weather: { flooded: false, drainedUntilTick: 0 },
    availableActions: [
      { type: 'move', edgeId: 'valley-road' },
      { type: 'move', edgeId: 'ridge-road' },
      { type: 'wait' },
    ],
    fog: { visible: ['station-west', 'station-east', 'station-ridge'], remembered: [], hidden: [] },
    ...overrides,
  }
}

function testScenario(): ArenaScenario {
  return {
    id: 'learning-eval-1',
    worldVersion: 'eval-v1',
    split: 'evaluation',
    seed: 99,
    durationTicks: 300,
    nodes: [
      { id: 'west', position: [-2, 0, 0] },
      { id: 'east', position: [2, 0, 0] },
      { id: 'ridge', position: [0, 1, 2] },
    ],
    edges: [
      { id: 'low-road', from: 'west', to: 'east', travelTicks: 25, floodable: true },
      { id: 'high-road', from: 'west', to: 'ridge', travelTicks: 40, floodable: false },
      { id: 'ridge-east', from: 'ridge', to: 'east', travelTicks: 40, floodable: false },
    ],
    entrants: [
      { id: 'champion', baseNode: 'west', policyVersion: 'test' },
      { id: 'rival', baseNode: 'east', policyVersion: 'test' },
    ],
    resources: [{ id: 'core-a', nodeId: 'east', value: 1 }],
    floods: [{ startTick: 20, endTick: 180 }],
  }
}

describe('Policy Model and Feature Encoding', () => {
  it('encodes an observation into a normalized 32-element float vector', () => {
    const obs = mockObservation()
    const features = encodeObservation(obs)
    expect(features).toHaveLength(36)
    for (let i = 0; i < features.length; i++) {
      expect(Number.isFinite(features[i])).toBe(true)
    }
  })

  it('runs forward inference and yields finite action logits', () => {
    const obs = mockObservation()
    const input = encodeObservation(obs)
    const { logits, hidden1, hidden2 } = forwardPolicy(input, SEASON_0_BASE_CHECKPOINT.weights)

    expect(logits).toHaveLength(8)
    expect(hidden1).toHaveLength(32)
    expect(hidden2).toHaveLength(16)
    for (let i = 0; i < logits.length; i++) {
      expect(Number.isFinite(logits[i])).toBe(true)
    }
  })

  it('creates an executable learned policy that respects legal actions', () => {
    const policy = createLearnedPolicy(SEASON_0_BASE_CHECKPOINT)
    const obs = mockObservation()
    const action = policy(obs)

    expect(action).toBeDefined()
    expect(obs.availableActions).toContainEqual(action)
  })

  it('validates checkpoints and rejects invalid shapes or non-finite weights', () => {
    expect(() => validateCheckpoint(SEASON_0_BASE_CHECKPOINT)).not.toThrow()

    const badCheckpoint = JSON.parse(JSON.stringify(SEASON_0_BASE_CHECKPOINT))
    badCheckpoint.weights.hidden1.biases[0] = NaN
    expect(() => validateCheckpoint(badCheckpoint)).toThrow('non-finite')
  })
})

describe('Supervised Policy Trainer', () => {
  it('trains a checkpoint from approved coaching examples and updates weights', () => {
    const obsFlooded = mockObservation({
      weather: { flooded: true, drainedUntilTick: 0 },
      edges: [
        { id: 'valley-road', from: 'station-west', to: 'station-east', travelTicks: 30, currentTravelTicks: 120, floodable: true, blocked: false },
        { id: 'ridge-road', from: 'station-west', to: 'station-ridge', travelTicks: 45, currentTravelTicks: 45, floodable: false, blocked: false },
      ],
    })

    const examples: ArenaTrainingExample[] = [
      {
        id: 'ex-1',
        sourceEpisodeId: 'practice-1',
        tick: 100,
        observation: obsFlooded,
        originalAction: { type: 'move', edgeId: 'valley-road' },
        preferredAction: { type: 'move', edgeId: 'ridge-road' },
        rationale: 'Avoid the flooded valley road',
        approved: true,
        source: 'approved',
      },
    ]

    const base = createBaseCheckpoint(42)
    const trained = trainPolicyCheckpoint(base, examples, { epochs: 30, learningRate: 0.05 })

    expect(trained.id).not.toEqual(base.id)
    expect(trained.parentCheckpointId).toBe(base.id)
    expect(trained.weightsHash).not.toEqual(base.weightsHash)
    expect(trained.trainingSummary.sampleCount).toBe(1)
    expect(trained.trainingSummary.loss).toBeLessThan(1.0)

    // Verify learned behavior on the coached observation
    const trainedPolicy = createLearnedPolicy(trained)
    const chosen = trainedPolicy(obsFlooded)
    expect(chosen).toEqual({ type: 'move', edgeId: 'ridge-road' })
  })

  it('evaluates checkpoints against test scenarios', () => {
    const scenario = testScenario()
    const result = evaluatePolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, [scenario])

    expect(result.scenariosCount).toBe(1)
    expect(Number.isFinite(result.totalBanked)).toBe(true)
    expect(result.wins + result.losses + result.draws).toBe(1)
  })
})

describe('Coaching Engine', () => {
  it('translates natural language coaching into structured training examples', () => {
    const obsFlooded = mockObservation({
      weather: { flooded: true, drainedUntilTick: 0 },
    })

    const correction = proposeCorrection(
      'Take the ridge route when the flood starts',
      obsFlooded,
      { type: 'move', edgeId: 'valley-road' }
    )

    expect(correction).not.toBeNull()
    expect(correction?.preferredAction).toEqual({ type: 'move', edgeId: 'ridge-road' })
    expect(correction?.approved).toBe(false)
    expect(correction?.rationale).toContain('Flooding is active')
  })

  it('provides predefined coaching rules for user selection', () => {
    expect(COACHING_RULES.length).toBeGreaterThanOrEqual(4)
    expect(COACHING_RULES.some(r => r.category === 'weather')).toBe(true)
  })
})

describe('Browser coach-train stability (few-shot)', () => {
  // The sold human path: a handful of approved notes fine-tuned with the
  // pinned browser config (60 epochs, lr 0.008, 0.5x step at 30). A 12-note
  // lesson must land finite, sane weights — the old 100/0.02 hot config was
  // documented to diverge on lessons this small (COMPATIBILITY.md).
  const BROWSER_TRAINING_CONFIG = {
    epochs: 60,
    learningRate: 0.008,
    learningRateDecay: { atEpoch: 30, factor: 0.5 },
  }

  it('fine-tunes 12 mixed examples to a finite checkpoint with loss < 1.0', () => {
    const obsFlooded = mockObservation({ weather: { flooded: true, drainedUntilTick: 0 } })
    const obsLoaded = mockObservation({ self: { ...mockObservation().self, cargo: ARENA_RULES.capacity } })
    const examples: ArenaTrainingExample[] = []
    for (let i = 0; i < 12; i++) {
      const kind = i % 4
      const base = kind === 0 ? obsFlooded : kind === 1 ? obsLoaded : mockObservation({ tick: 100 + i })
      const preferred =
        kind === 0
          ? { type: 'move', edgeId: 'ridge-road' }
          : kind === 1
            ? { type: 'bank' }
            : kind === 2
              ? { type: 'move', edgeId: 'valley-road' }
              : { type: 'wait' }
      examples.push({
        id: `few-shot-${i}`,
        sourceEpisodeId: 'practice-board',
        tick: (base.tick ?? 0) + 5,
        observation: base,
        originalAction: { type: 'move', edgeId: 'valley-road' },
        preferredAction: preferred as ArenaTrainingExample['preferredAction'],
        rationale: 'few-shot stability pin',
        approved: true,
        source: 'approved',
      })
    }
    const trained = trainPolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, examples, BROWSER_TRAINING_CONFIG)
    expect(trained.trainingConfig).toEqual({
      ...BROWSER_TRAINING_CONFIG,
      momentum: 0.85,
      weightDecay: 0.0001,
    })
    expect(trained.trainingSummary.loss).toBeLessThan(1.0)
    expect(Number.isFinite(trained.trainingSummary.loss)).toBe(true)
    expect(validateCheckpoint(trained)).toBeUndefined()
    const all = [
      ...trained.weights.hidden1.weights.flat(),
      ...trained.weights.hidden2.weights.flat(),
      ...trained.weights.actionHead.weights.flat(),
      ...(trained.weights.edgeHead?.weights.flat() ?? []),
    ]
    expect(all.every(Number.isFinite)).toBe(true)
    // Deterministic: same inputs -> same artifact.
    const again = trainPolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, examples, BROWSER_TRAINING_CONFIG)
    expect(again.weightsHash).toBe(trained.weightsHash)
  })
})
