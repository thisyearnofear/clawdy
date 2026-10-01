import { describe, expect, it } from 'vitest'
import { ArenaEpisode, DEFAULT_RUSH_RULES, type ArenaScenario } from '../arenaEpisode'
import { classifyAction, scoreMoveEdge, validateCheckpoint } from '../policyModel'
import {
  checkpointFromVector,
  flattenWeights,
  scoreCheckpoint,
  trainES,
  weightsFromVector,
  type EsContext,
} from '../policyES'
import { rushVariant, swapSides } from '../rushVariants'
import { isEvaluationScenario } from '../arenaScenarios'
import { SEASON_0_STARTER_CHECKPOINT } from '../starterCheckpoint'

/** Tiny Rush world: west -- mid -- field -- east, with timed cores at the field. */
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
    rush: { ...DEFAULT_RUSH_RULES },
    ...overrides,
  }
}

describe('flare routing for learned policies', () => {
  function observeAfterSpawn(spawnTick: number) {
    const scenario = tinyRush({ resources: [{ id: 'mother-1', nodeId: 'field', value: 3, spawnTick }] })
    const episode = new ArenaEpisode(scenario)
    while (episode.tick < spawnTick) episode.step()
    return episode.observe('champion', { forceDecision: true })
  }

  it('shows a spawned core as a flare the rover has not seen', () => {
    const observation = observeAfterSpawn(60)
    const flare = observation.resources.find(resource => resource.id === 'mother-1')
    expect(flare).toMatchObject({ visible: false, stale: true, flare: true, available: true })
  })

  it('treats the first hop toward a flare as a pickup run (class 6) with a finite score', () => {
    const observation = observeAfterSpawn(60)
    expect(classifyAction({ type: 'move', edgeId: 'cb-mid' }, observation)).toBe(6)
    expect(Number.isFinite(scoreMoveEdge(observation, 'cb-mid', 6))).toBe(true)
    // The long detour to the far base is not toward the flare: an ordinary corridor move.
    expect(classifyAction({ type: 'move', edgeId: 'cb-rb' }, observation)).not.toBe(6)
  })

  it('ignores a flare the rover has no room to carry', () => {
    const observation = observeAfterSpawn(60)
    const loaded = { ...observation, self: { ...observation.self, cargo: 1 } } // 2 free slots < value 3
    expect(classifyAction({ type: 'move', edgeId: 'cb-mid' }, loaded)).not.toBe(6)
  })
})

describe('ES weight plumbing', () => {
  it('round-trips the 1,857 trainable weights and yields a valid checkpoint', () => {
    const parent = SEASON_0_STARTER_CHECKPOINT
    const vector = flattenWeights(parent.weights)
    expect(vector).toHaveLength(1857)
    expect(weightsFromVector(parent.weights, vector)).toEqual(parent.weights)
    const bumped = vector.map(value => value + 0.01)
    const child = checkpointFromVector(parent, bumped, { name: 'child', generation: 3, fitness: 1.5, matches: 8, seed: 1 })
    expect(() => validateCheckpoint(child)).not.toThrow()
    expect(child.parentCheckpointId).toBe(parent.id)
    expect(child.weightsHash).not.toBe(parent.weightsHash)
  })

  it('rejects a vector of the wrong length', () => {
    expect(() => weightsFromVector(SEASON_0_STARTER_CHECKPOINT.weights, new Float64Array(10))).toThrow()
  })
})

describe('Rush variants', () => {
  const base = tinyRush()

  it('are deterministic, ordered, and inside the match', () => {
    const a = rushVariant(base, 'train', 7)
    const b = rushVariant(base, 'train', 7)
    expect(a).toEqual(b)
    const waves = a.resources.filter(resource => resource.spawnTick !== undefined).map(resource => resource.spawnTick!)
    expect(waves).toEqual([...waves].sort((x, y) => x - y))
    for (const tick of waves) expect(tick).toBeLessThan(a.durationTicks)
    expect(new ArenaEpisode(a)).toBeTruthy()
    expect(rushVariant(base, 'train', 8).resources.map(r => r.spawnTick)).not.toEqual(a.resources.map(r => r.spawnTick))
  })

  it('keeps hidden variants out of training', () => {
    const hidden = rushVariant(base, 'hidden', 3)
    expect(hidden.split).toBe('evaluation')
    expect(isEvaluationScenario(hidden.id)).toBe(true)
    expect(isEvaluationScenario(rushVariant(base, 'train', 3).id)).toBe(false)
  })

  it('swaps sides without touching anything else', () => {
    const swapped = swapSides(base)
    expect(swapped.entrants[0].baseNode).toBe('rival-base')
    expect(swapped.entrants[1].baseNode).toBe('champion-base')
    expect(swapped.resources).toEqual(base.resources)
  })
})

describe('ES training loop', () => {
  const context: EsContext = { rushBase: tinyRush(), opponents: ['safe', 'greedy'] }

  it('scores both sides of every task', () => {
    const score = scoreCheckpoint(SEASON_0_STARTER_CHECKPOINT, [{ kind: 'train', seed: 1, opponent: 0 }], context)
    expect(score.matches).toBe(2)
    expect(score.wins + score.losses).toBeLessThanOrEqual(2)
  })

  it('is deterministic for a seed and never reports a regression as best', async () => {
    const run = async () => {
      const frames = []
      for await (const frame of trainES({
        parent: SEASON_0_STARTER_CHECKPOINT,
        context,
        generations: 2,
        pairs: 2,
        sigma: 0.05,
        learningRate: 1,
        trainScenariosPerGen: 1,
        validationSeeds: [11],
        seed: 42,
      })) frames.push(frame)
      return frames
    }
    const first = await run()
    const second = await run()
    expect(first).toHaveLength(2)
    expect(first.map(frame => frame.checkpoint.weightsHash)).toEqual(second.map(frame => frame.checkpoint.weightsHash))
    expect(first[1].best).toBeGreaterThanOrEqual(first[0].best)
    for (const frame of first) expect(() => validateCheckpoint(frame.checkpoint)).not.toThrow()
  })
})
