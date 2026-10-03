import { describe, expect, it } from 'vitest'
import { ArenaEpisode, DEFAULT_RUSH_RULES, type ArenaScenario } from '../arenaEpisode'
import { ArenaRunner, type EntrantPolicyOption } from '../arenaPolicy'
import {
  EDGE_FEATURE_DIM,
  OBSERVATION_FEATURE_DIM,
  TIMETABLE_EDGE_FEATURE_DIM,
  TIMETABLE_FEATURE_DIM,
  createLearnedPolicy,
  encodeEdgeFeatures,
  encodeObservation,
  extendCheckpointForTimetable,
  validateCheckpoint,
  type PolicyCheckpoint,
} from '../policyModel'
import { trainPolicyCheckpoint, type ArenaTrainingExample } from '../policyTrainer'
import { rushVariant, swapSides, WAVE_JITTER_TICKS } from '../rushVariants'
import { SEASON_0_STARTER_CHECKPOINT } from '../starterCheckpoint'

const WAVES = [
  { resourceId: 'mother-1', windowStart: 30, windowEnd: 90 },
  { resourceId: 'mother-2', windowStart: 190, windowEnd: 250 },
]

/** Tiny Rush world: champion-base -- mid -- field -- rival-base, timed cores at the field. */
function tinyRush(overrides: Partial<ArenaScenario> = {}): ArenaScenario {
  return {
    id: 'tiny-rush',
    worldVersion: 'fixture-v1',
    split: 'practice',
    seed: 5,
    durationTicks: 300,
    nodes: [
      { id: 'champion-base', position: [-6, 0, 0] },
      { id: 'mid', position: [-3, 0, 0] },
      { id: 'field', position: [0, 0, 0] },
      { id: 'rival-base', position: [6, 0, 0] },
    ],
    edges: [
      { id: 'cb-mid', from: 'champion-base', to: 'mid', travelTicks: 10, floodable: false },
      { id: 'mid-field', from: 'mid', to: 'field', travelTicks: 10, floodable: false },
      { id: 'field-rb', from: 'field', to: 'rival-base', travelTicks: 20, floodable: false },
      { id: 'cb-rb', from: 'champion-base', to: 'rival-base', travelTicks: 90, floodable: false },
    ],
    entrants: [
      { id: 'champion', baseNode: 'champion-base', policyVersion: 'a' },
      { id: 'rival', baseNode: 'rival-base', policyVersion: 'b' },
    ],
    resources: [
      { id: 'mother-1', nodeId: 'field', value: 3, spawnTick: 60 },
      { id: 'mother-2', nodeId: 'field', value: 3, spawnTick: 220 },
      { id: 'core-1', nodeId: 'mid', value: 1 },
    ],
    floods: [{ startTick: 100, endTick: 180 }],
    rush: { ...DEFAULT_RUSH_RULES, waves: WAVES },
    ...overrides,
  }
}

function observeAt(scenario: ArenaScenario, tick: number) {
  const episode = new ArenaEpisode(scenario)
  while (episode.tick < tick) episode.step()
  return episode.observe('champion', { forceDecision: true })
}

describe('public Rush timetable', () => {
  it('discloses only waves that have not spawned, earliest first', () => {
    expect(observeAt(tinyRush(), 0).rushWaves).toEqual([
      { nodeId: 'field', value: 3, windowStart: 30, windowEnd: 90 },
      { nodeId: 'field', value: 3, windowStart: 190, windowEnd: 250 },
    ])
    expect(observeAt(tinyRush(), 60).rushWaves).toEqual([{ nodeId: 'field', value: 3, windowStart: 190, windowEnd: 250 }])
    expect(observeAt(tinyRush(), 220).rushWaves).toEqual([])
  })

  it('is absent without a timetable, so Haul and older recordings are untouched', () => {
    const noWaves = tinyRush({ rush: { ...DEFAULT_RUSH_RULES } })
    expect(observeAt(noWaves, 0)).not.toHaveProperty('rushWaves')
    const haul = tinyRush({ rush: undefined })
    expect(observeAt(haul, 0)).not.toHaveProperty('rushWaves')
  })

  it('refuses a window that does not contain the real spawn', () => {
    const lying = tinyRush({ rush: { ...DEFAULT_RUSH_RULES, waves: [{ resourceId: 'mother-1', windowStart: 100, windowEnd: 140 }] } })
    expect(() => new ArenaEpisode(lying)).toThrow(/rush waves/)
    const unknown = tinyRush({ rush: { ...DEFAULT_RUSH_RULES, waves: [{ resourceId: 'core-1', windowStart: 0, windowEnd: 100 }] } })
    expect(() => new ArenaEpisode(unknown)).toThrow(/rush waves/)
  })

  it('keeps every seeded variant inside its published window', () => {
    const nominal = [160, 460, 760, 1040]
    const base = tinyRush({
      durationTicks: 1200,
      resources: nominal.map((spawnTick, index) => ({ id: `mother-${index + 1}`, nodeId: 'field', value: 3, spawnTick })),
      rush: {
        ...DEFAULT_RUSH_RULES,
        waves: nominal.map((spawnTick, index) => ({
          resourceId: `mother-${index + 1}`, windowStart: spawnTick - WAVE_JITTER_TICKS, windowEnd: spawnTick + WAVE_JITTER_TICKS,
        })),
      },
    })
    for (const kind of ['train', 'hidden'] as const) {
      for (let seed = 1; seed <= 200; seed++) {
        const variant = rushVariant(base, kind, seed)
        expect(() => new ArenaEpisode(variant)).not.toThrow()
        expect(variant.rush?.waves).toEqual(base.rush?.waves)
      }
    }
  })
})

describe('timetable encoder and edge features', () => {
  it('leaves the standard encoding untouched and adds two inputs', () => {
    const observation = observeAt(tinyRush(), 0)
    const standard = encodeObservation(observation)
    const extended = encodeObservation(observation, TIMETABLE_FEATURE_DIM)
    expect(standard).toHaveLength(OBSERVATION_FEATURE_DIM)
    expect(extended).toHaveLength(TIMETABLE_FEATURE_DIM)
    expect([...extended.slice(0, OBSERVATION_FEATURE_DIM)]).toEqual([...standard])
    // 20 ticks from the field with the window opening at 30: nearly full pressure.
    expect(extended[36]).toBeGreaterThan(0.9)
    expect(extended[37]).toBeGreaterThan(0)
    expect(() => encodeObservation(observation, 40)).toThrow('Unsupported encoder dimension')
  })

  it('reads zero timetable inputs when no wave is upcoming', () => {
    const none = encodeObservation(observeAt(tinyRush({ rush: { ...DEFAULT_RUSH_RULES } }), 0), TIMETABLE_FEATURE_DIM)
    expect([none[36], none[37]]).toEqual([0, 0])
    const afterAll = encodeObservation(observeAt(tinyRush(), 220), TIMETABLE_FEATURE_DIM)
    expect([afterAll[36], afterAll[37]]).toEqual([0, 0])
  })

  it('scores hub progress only for roads that close the distance to the next wave', () => {
    const observation = observeAt(tinyRush(), 0)
    const toward = encodeEdgeFeatures(observation, 'cb-mid', TIMETABLE_EDGE_FEATURE_DIM)
    const away = encodeEdgeFeatures(observation, 'cb-rb', TIMETABLE_EDGE_FEATURE_DIM)
    expect(toward).toHaveLength(TIMETABLE_EDGE_FEATURE_DIM)
    expect(toward[8]).toBeGreaterThan(0.4)
    expect(away[8]).toBe(0)
    expect([...toward.slice(0, EDGE_FEATURE_DIM)]).toEqual([...encodeEdgeFeatures(observation, 'cb-mid')])
  })
})

describe('extendCheckpointForTimetable', () => {
  const extended = extendCheckpointForTimetable(SEASON_0_STARTER_CHECKPOINT)

  it('adds zero rows, records lineage and validates', () => {
    expect(() => validateCheckpoint(extended)).not.toThrow()
    expect(extended.weights.hidden1.weights).toHaveLength(TIMETABLE_FEATURE_DIM)
    expect(extended.weights.edgeHead!.weights).toHaveLength(TIMETABLE_EDGE_FEATURE_DIM)
    for (const row of extended.weights.hidden1.weights.slice(OBSERVATION_FEATURE_DIM)) expect(row.every(value => value === 0)).toBe(true)
    expect(extended.weights.edgeHead!.weights.at(-1)).toEqual([0])
    expect(extended.parentCheckpointId).toBe(SEASON_0_STARTER_CHECKPOINT.id)
    expect(extended.weightsHash).not.toBe(SEASON_0_STARTER_CHECKPOINT.weightsHash)
    expect(extendCheckpointForTimetable(extended)).toBe(extended)
  })

  it('rejects a half-extended checkpoint', () => {
    const half: PolicyCheckpoint = JSON.parse(JSON.stringify(extended))
    half.weights.edgeHead!.weights.pop()
    expect(() => validateCheckpoint(half)).toThrow('both be extended or both standard')
  })

  it('plays exactly like its parent until training moves the new weights', () => {
    for (const scenario of [tinyRush(), swapSides(tinyRush()), tinyRush({ seed: 11 })]) {
      const run = (checkpoint: PolicyCheckpoint) => {
        const options: Record<string, EntrantPolicyOption> = { champion: { strategy: 'learned', checkpoint }, rival: 'safe' }
        const runner = new ArenaRunner(scenario, options)
        runner.advanceTicks(scenario.durationTicks)
        return runner.recording().batches.map(batch => batch.requests.map(request => [request.agentId, request.action]))
      }
      expect(run(extended)).toEqual(run(SEASON_0_STARTER_CHECKPOINT))
    }
  })

  it('trains from an extended parent without changing its shape', () => {
    const observation = observeAt(tinyRush(), 0)
    const example: ArenaTrainingExample = {
      id: 'tt-1',
      sourceEpisodeId: 'tiny',
      tick: 0,
      observation,
      originalAction: { type: 'wait' },
      preferredAction: { type: 'move', edgeId: 'cb-mid' },
      rationale: 'head for the wave',
      approved: true,
      source: 'approved',
    }
    const trained = trainPolicyCheckpoint(extended, [example], { epochs: 20, learningRate: 0.05 })
    expect(() => validateCheckpoint(trained)).not.toThrow()
    expect(trained.weights.hidden1.weights).toHaveLength(TIMETABLE_FEATURE_DIM)
    expect(trained.weights.edgeHead!.weights).toHaveLength(TIMETABLE_EDGE_FEATURE_DIM)
    expect(trained.parentCheckpointId).toBe(extended.id)
    expect(observation.availableActions).toContainEqual(createLearnedPolicy(trained)(observation))
  })
})
