import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARENA_RULES } from '../arenaEpisode'
import { ARENA_WORLD } from '../arenaCourse'
import { HELD_OUT_SCENARIOS, PRACTICE_SCENARIOS } from '../arenaScenarios'
import { replayArenaEpisode } from '../arenaReplay'
import { ArenaRunner } from '../arenaPolicy'
import {
  ACTION_CLASSES,
  CHECKPOINT_SCHEMA_V1,
  ENCODER_VERSION,
  OBSERVATION_FEATURE_DIM,
  POLICY_SCHEMA_VERSION,
  SEASON_0_BASE_CHECKPOINT,
  classifyAction,
  createLearnedPolicy,
  encodeObservation,
  validateCheckpoint,
} from '../policyModel'
import { OBSERVATION_SCHEMA_VERSION } from '../arenaEpisode'
import { trainPolicyCheckpoint, type ArenaTrainingExample } from '../policyTrainer'

/**
 * Compatibility contract pins (docs/COMPATIBILITY.md). Every value here is a
 * deliberate migration when edited — never a drive-by string change.
 */
describe('v1 compatibility inventory', () => {
  it('pins the rules, checkpoint, world, and policy constants', () => {
    expect(ARENA_RULES.version).toBe('season-0.reference.2')
    expect(POLICY_SCHEMA_VERSION).toBe('season-0.checkpoint.v2')
    expect(CHECKPOINT_SCHEMA_V1).toBe('season-0.checkpoint.v1')
    expect(ENCODER_VERSION).toBe('season-0.encoder.v2')
    expect(OBSERVATION_SCHEMA_VERSION).toBe('arena-observation-v2')
    expect(ARENA_WORLD.version).toBe('sandstone-basin-course-2')
    expect(ARENA_WORLD.id).toBe('sandstone-basin')
    expect(ARENA_WORLD.colliderSha256).toBe('7633067b2624fb476f36adfb14e1a13b1325c71143fbd4d5087cfaf209c993af')
    expect(ARENA_WORLD.terrainUrl).toBe(ARENA_WORLD.colliderUrl)
    expect(OBSERVATION_FEATURE_DIM).toBe(36)
    expect(ACTION_CLASSES).toBe(8)
    expect(SEASON_0_BASE_CHECKPOINT.schemaVersion).toBe(POLICY_SCHEMA_VERSION)
    expect(SEASON_0_BASE_CHECKPOINT.weights.hidden1.weights).toHaveLength(36)
  })

  it('pins the frozen simulation numerics', () => {
    expect(ARENA_RULES.stepMs).toBe(50)
    expect(ARENA_RULES.decisionEveryTicks).toBe(5)
    expect(ARENA_RULES.maxDurationTicks).toBe(7200)
    expect(ARENA_RULES.capacity).toBe(3)
    expect(ARENA_RULES.initialEnergy).toBe(12)
    expect(ARENA_RULES.moveCostPerTick).toBe(0.03)
    expect(ARENA_RULES.drainCost).toBe(2)
    expect(ARENA_RULES.drainTicks).toBe(50)
    expect(ARENA_RULES.drainCooldownTicks).toBe(150)
    expect(ARENA_RULES.floodTravelMultiplier).toBe(4)
    expect(ARENA_RULES.maxBlockedTicks).toBe(40)
    expect(ARENA_RULES.arrivalTolerance).toBe(0.07)
    expect(ARENA_RULES.groundingTolerance).toBe(0.25)
  })

  it('keeps builder fixtures in the abstract namespace, separate from grounded courses', () => {
    expect(PRACTICE_SCENARIOS).toHaveLength(3)
    expect(HELD_OUT_SCENARIOS).toHaveLength(4)
    for (const scenario of [...PRACTICE_SCENARIOS, ...HELD_OUT_SCENARIOS]) {
      expect(scenario.worldVersion).toBe('builder-abstract-v1')
    }
    expect(PRACTICE_SCENARIOS.every(s => s.split === 'practice')).toBe(true)
    expect(HELD_OUT_SCENARIOS.every(s => s.split === 'evaluation')).toBe(true)
  })

  it('stamps the live observation and recording schemas from a builder episode', () => {
    const runner = new ArenaRunner(PRACTICE_SCENARIOS[0], { champion: 'safe', rival: 'greedy' })
    const observation = runner.observe('champion')
    expect(observation.schemaVersion).toBe('arena-observation-v2')
    expect(observation.rulesVersion).toBe(ARENA_RULES.version)
    // Public scoreboard: rival banked is disclosed even while hidden.
    expect(observation.rivals[0].visible).toBe(false)
    expect(observation.rivals[0].banked).toBe(0)
    runner.advanceTicks(50)
    const recording = runner.recording()
    expect(recording.schemaVersion).toBe('arena-recording-v1')
    expect(recording.rulesVersion).toBe(ARENA_RULES.version)
    expect(recording.controllerVersion).toBe('route-reference-v2')
  })
})

describe('encoder v2 additive features', () => {
  function fixtureObservation() {
    const runner = new ArenaRunner(PRACTICE_SCENARIOS[0], { champion: 'safe', rival: 'greedy' })
    return runner.observe('champion')
  }

  it('keeps the frozen v1 region byte-identical in shape and bias', () => {
    const vec = encodeObservation(fixtureObservation())
    expect(vec).toHaveLength(36)
    expect(vec[31]).toBe(1.0)
    for (let i = 0; i < 36; i++) expect(Number.isFinite(vec[i])).toBe(true)
  })

  it('encodes the public scoreboard, stale memory, and fog fractions', () => {
    const base = fixtureObservation()
    const nodeCount = base.nodes.length
    const obs = {
      ...base,
      rivals: [{ id: 'rival', position: null, cargo: null, banked: 5, visible: false }],
      resources: [
        ...base.resources.map(r => ({ ...r, visible: true })),
        { id: 'core-x', nodeId: base.fog.hidden[0], value: 2, available: true, visible: false, stale: true },
      ],
    }
    const vec = encodeObservation(obs)
    expect(vec[32]).toBeCloseTo(0.5, 5) // public rival banked, unmasked
    expect(vec[33]).toBeCloseTo(2 / 3, 5) // stale remembered value / capacity 3
    expect(vec[34]).toBeCloseTo(base.fog.hidden.length / nodeCount, 5)
    expect(vec[35]).toBeCloseTo(base.fog.remembered.length / nodeCount, 5)
  })

  it('reads v1 checkpoints but refuses to execute or fine-tune them', () => {
    const v1Weights = {
      hidden1: {
        weights: SEASON_0_BASE_CHECKPOINT.weights.hidden1.weights.slice(0, 32),
        biases: SEASON_0_BASE_CHECKPOINT.weights.hidden1.biases,
      },
      hidden2: SEASON_0_BASE_CHECKPOINT.weights.hidden2,
      actionHead: SEASON_0_BASE_CHECKPOINT.weights.actionHead,
    }
    const v1 = { ...SEASON_0_BASE_CHECKPOINT, schemaVersion: CHECKPOINT_SCHEMA_V1, weights: v1Weights }
    expect(() => validateCheckpoint(v1)).not.toThrow()
    expect(() => createLearnedPolicy(v1)).toThrow('checkpoint-execution-mismatch')
    const obs = fixtureObservation()
    const examples: ArenaTrainingExample[] = [{
      id: 'v1-parent-ex',
      sourceEpisodeId: PRACTICE_SCENARIOS[0].id,
      tick: 0,
      observation: obs,
      originalAction: { type: 'wait' },
      preferredAction: { type: 'wait' },
      rationale: 'v1 parent refusal pin',
      approved: true,
      source: 'approved',
    }]
    expect(() => trainPolicyCheckpoint(v1, examples)).toThrow('checkpoint-execution-mismatch')
  })
})

describe('version-axis error specificity', () => {
  function recordedFixture() {
    const runner = new ArenaRunner(PRACTICE_SCENARIOS[0], { champion: 'safe', rival: 'greedy' })
    runner.advanceTicks(50)
    return runner.recording()
  }

  it('names the schema axis on layout mismatch', () => {
    const recording = {
      ...recordedFixture(),
      // Deliberate literal-type lie to exercise the runtime reader gate.
      schemaVersion: 'arena-recording-v9' as 'arena-recording-v1',
    }
    expect(() => replayArenaEpisode(recording)).toThrow('recording-schema-mismatch (got arena-recording-v9, want arena-recording-v1)')
  })

  it('names the rules axis on pinned-rules mismatch', () => {
    const recording = { ...recordedFixture(), rulesVersion: 'season-0.reference.1' }
    expect(() => replayArenaEpisode(recording)).toThrow(
      `rules-mismatch (recording pinned season-0.reference.1, runtime ${ARENA_RULES.version})`,
    )
  })

  it('names the controller axis on motion mismatch', () => {
    const recording = { ...recordedFixture(), controllerVersion: 'future-controller-v9' }
    expect(() => replayArenaEpisode(recording)).toThrow(
      'controller-mismatch (got future-controller-v9, want route-reference-v2)',
    )
  })

  it('still replays the matching triple without divergence', () => {
    expect(replayArenaEpisode(recordedFixture()).divergedAt).toBeNull()
  })
})

describe('additive observation tolerance (Rule 3)', () => {
  it('ignores unknown future fields without changing the encoding', () => {
    const runner = new ArenaRunner(PRACTICE_SCENARIOS[0], { champion: 'safe', rival: 'greedy' })
    const observation = runner.observe('champion')
    const baseline = encodeObservation(observation)
    const extended = encodeObservation({ ...observation, fogDensity: 0.5, rivalIntent: 'rush' } as typeof observation)
    expect(extended).toHaveLength(OBSERVATION_FEATURE_DIM)
    expect(Array.from(extended)).toEqual(Array.from(baseline))
  })
})

describe('frozen action-class mapping', () => {
  function fixtureObservation() {
    const runner = new ArenaRunner(PRACTICE_SCENARIOS[0], { champion: 'safe', rival: 'greedy' })
    return runner.observe('champion')
  }

  it('pins wait/bank/collect/drain to classes 0-3', () => {
    const observation = fixtureObservation()
    expect(classifyAction({ type: 'wait' }, observation)).toBe(0)
    expect(classifyAction({ type: 'bank' }, observation)).toBe(1)
    expect(classifyAction({ type: 'collect', resourceId: 'core-1' }, observation)).toBe(2)
    expect(classifyAction({ type: 'drain' }, observation)).toBe(3)
  })

  it('pins move-low/move-high/move-resource/move-home to classes 4-7', () => {
    const observation = fixtureObservation()
    const atBase = { ...observation, self: { ...observation.self, nodeId: 'champion-base', baseNode: 'champion-base' } }
    // Floodable valley edge to a resourceless node.
    expect(classifyAction({ type: 'move', edgeId: 'valley-cb-n1' }, atBase)).toBe(4)
    // Dry ridge edge to a resourceless node.
    expect(classifyAction({ type: 'move', edgeId: 'base-cb-rn' }, atBase)).toBe(5)
    // Floodable valley edge into the resourced valley-center.
    expect(classifyAction({ type: 'move', edgeId: 'valley-n1-vc' }, {
      ...observation,
      self: { ...observation.self, nodeId: 'valley-n1', baseNode: 'champion-base' },
    })).toBe(6)
    // Any edge back into the base node.
    expect(classifyAction({ type: 'move', edgeId: 'valley-cb-n1' }, {
      ...observation,
      self: { ...observation.self, nodeId: 'valley-n1', baseNode: 'champion-base' },
    })).toBe(7)
  })
})

describe('frozen trainer defaults', () => {  it('records the canonical default config when no overrides are given', () => {
    const runner = new ArenaRunner(PRACTICE_SCENARIOS[0], { champion: 'safe', rival: 'greedy' })
    const observation = runner.observe('champion')
    const examples: ArenaTrainingExample[] = [0, 1].map(index => ({
      id: `freeze-ex-${index}`,
      sourceEpisodeId: PRACTICE_SCENARIOS[0].id,
      tick: index * 5,
      observation,
      originalAction: { type: 'wait' },
      preferredAction: { type: 'move', edgeId: 'valley-cb-n1' },
      rationale: 'freeze pin',
      approved: true,
      source: 'approved',
    }))
    const checkpoint = trainPolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, examples)
    expect(checkpoint.trainingConfig).toEqual({
      epochs: 40,
      learningRate: 0.03,
      momentum: 0.85,
      weightDecay: 0.0001,
    })
  })
})

describe('eval-gate pin structure', () => {
  it('tracks the live contract versions and covers the full matched matrix', () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const pin = JSON.parse(readFileSync(join(repoRoot, 'docs', 'eval-gate.json'), 'utf8'))
    expect(pin.version).toBe(1)
    expect(pin.rulesVersion).toBe(ARENA_RULES.version)
    expect(pin.worldNamespace).toBe('builder-abstract-v1')
    expect(pin.checkpointSchema).toBe(POLICY_SCHEMA_VERSION)
    // 4 held-out scenarios × {safe, trained} × {normal, swapped}.
    expect(pin.matches).toHaveLength(16)
    const keys = pin.matches.map((m: { scenarioId: string; policy: string; side: string }) =>
      `${m.scenarioId}/${m.policy}/${m.side}`)
    expect(new Set(keys).size).toBe(16)
    for (const match of pin.matches) {
      expect(match.finished).toBe(true)
      expect(match.recoveries).toBe(0)
    }
    // Grounded course: {practice, compete} × {safe, trained} × {normal, swapped}.
    expect(pin.grounded.matches).toHaveLength(8)
    const groundedKeys = pin.grounded.matches.map((m: { scenarioId: string; policy: string; side: string }) =>
      `${m.scenarioId}/${m.policy}/${m.side}`)
    expect(new Set(groundedKeys).size).toBe(8)
    for (const match of pin.grounded.matches) {
      expect(match.finished).toBe(true)
      expect(match.recoveries).toBe(0)
    }
    // Family layouts: 4 layouts × {safe, trained} × {normal, swapped}.
    expect(pin.family.layouts).toHaveLength(4)
    expect(pin.family.matches).toHaveLength(16)
    const familyKeys = pin.family.matches.map((m: { scenarioId: string; policy: string; side: string }) =>
      `${m.scenarioId}/${m.policy}/${m.side}`)
    expect(new Set(familyKeys).size).toBe(16)
    for (const match of pin.family.matches) {
      expect(match.finished).toBe(true)
      expect(match.recoveries).toBe(0)
    }
    expect(pin.frames.total).toBeGreaterThan(0)
    expect(pin.frames.passed).toBe(pin.frames.total)
    expect(pin.frames.failedIds).toEqual([])
  })
})
