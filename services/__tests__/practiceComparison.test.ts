import { describe, expect, it, vi } from 'vitest'
import { type ArenaScenario } from '../arenaEpisode'
import type { ArenaMotion } from '../arenaPhysics'
import { ArenaRunner } from '../arenaPolicy'
import { computeWeightsHash, SEASON_0_BASE_CHECKPOINT } from '../policyModel'
import { comparePracticeCheckpoints, comparisonFrameAt } from '../practiceComparison'

const scenario: ArenaScenario = {
  id: 'comparison-practice', worldVersion: 'comparison-fixture-v1', split: 'practice', seed: 1, durationTicks: 100,
  nodes: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [1, 0, 0] }, { id: 'c', position: [0, 0, 1] }],
  edges: [
    { id: 'ab', from: 'a', to: 'b', travelTicks: 5, floodable: false },
    { id: 'ac', from: 'a', to: 'c', travelTicks: 5, floodable: false },
  ],
  entrants: [{ id: 'champion', baseNode: 'a', policyVersion: 'test' }, { id: 'rival', baseNode: 'b', policyVersion: 'test' }],
  resources: [{ id: 'core-b', nodeId: 'b', value: 1 }, { id: 'core-c', nodeId: 'c', value: 1 }], floods: [],
}

function checkpoint(actionClass: number) {
  const result = structuredClone(SEASON_0_BASE_CHECKPOINT)
  result.id = `comparison-${actionClass}`
  result.name = `Comparison ${actionClass}`
  result.weights.actionHead.weights = result.weights.actionHead.weights.map(row => row.map(() => 0))
  result.weights.actionHead.biases = result.weights.actionHead.biases.map((_, index) => index === actionClass ? 100 : -100)
  result.weightsHash = computeWeightsHash(result.weights)
  return result
}

function motion(): ArenaMotion {
  return {
    version: 'comparison-motion-v1', reset: vi.fn(), recover: vi.fn(), dispose: vi.fn(),
    step: targets => targets.map(target => ({ ...target, grounded: true, rotation: [0, 0, 0, 1] as [number, number, number, number] })),
  }
}

const options = { rival: 'poach' as const, controllerVersion: 'comparison-motion-v1' }

describe('matched physical practice evidence', () => {
  it('uses fresh motion for each checkpoint and matches the live runner exactly', async () => {
    const motions: ArenaMotion[] = []
    const factory = () => { const created = motion(); motions.push(created); return created }
    const brain = checkpoint(6)
    const result = await comparePracticeCheckpoints(brain, brain, scenario, factory, options)
    const liveMotion = motion()
    const live = new ArenaRunner(scenario, { champion: { strategy: 'learned', checkpoint: brain }, rival: 'poach' }, liveMotion)
    live.advanceTicks(scenario.durationTicks)
    expect(result.baseline.recording).toEqual(live.recording())
    expect(result.trained.recording).toEqual(live.recording())
    expect(result.bankedDelta).toBe(0)
    expect(result.firstDivergence).toBeNull()
    expect(result.controllerVersion).toBe(live.recording().controllerVersion)
    expect(motions).toHaveLength(2)
    for (const created of motions) {
      expect(created.reset).toHaveBeenCalled()
      expect(created.dispose).toHaveBeenCalledTimes(1)
    }
    liveMotion.dispose()
  })

  it('reports the first different accepted decision without promising improvement', async () => {
    const result = await comparePracticeCheckpoints(checkpoint(0), checkpoint(6), scenario, motion, options)
    expect(result.firstDivergence).toMatchObject({ tick: 10, parentAction: { type: 'move' }, childAction: { type: 'move' } })
    expect(result.firstDivergence!.parentAction).not.toEqual(result.firstDivergence!.childAction)
    for (const decision of result.baseline.decisions.filter(item => item.tick < 10)) {
      expect(decision.action).toEqual(result.trained.decisions.find(item => item.tick === decision.tick)!.action)
    }
    expect(result.bankedDelta).toBe(result.trained.banked - result.baseline.banked)
    expect(result.baseline.weightsHash).toBe(checkpoint(0).weightsHash)
    expect(comparisonFrameAt(result.trained.recording, 0)?.tick).toBe(0)
    expect(comparisonFrameAt(result.trained.recording, 1000)?.tick).toBe(100)
  })

  it('rejects held-out scenarios before constructing motion', async () => {
    const factory = vi.fn(motion)
    await expect(comparePracticeCheckpoints(checkpoint(0), checkpoint(6), { ...scenario, split: 'evaluation' }, factory, options)).rejects.toThrow('practice')
    expect(factory).not.toHaveBeenCalled()
  })

  it('disposes motion on a runtime failure and never publishes partial comparison', async () => {
    const broken = motion()
    broken.step = () => { throw new Error('physics failed') }
    await expect(comparePracticeCheckpoints(checkpoint(0), checkpoint(6), scenario, () => broken, options)).rejects.toThrow('physics failed')
    expect(broken.dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects a controller mismatch and releases its physics world', async () => {
    const created = motion()
    await expect(comparePracticeCheckpoints(checkpoint(0), checkpoint(6), scenario, () => created, { ...options, controllerVersion: 'another-controller' })).rejects.toThrow('controller')
    expect(created.dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects reuse of the same motion instance', async () => {
    const created = motion()
    await expect(comparePracticeCheckpoints(checkpoint(0), checkpoint(6), scenario, () => created, options)).rejects.toThrow('isolated')
    expect(created.dispose).toHaveBeenCalledTimes(1)
  })

  it('honors cancellation before creating physics', async () => {
    const controller = new AbortController()
    controller.abort()
    const factory = vi.fn(motion)
    await expect(comparePracticeCheckpoints(checkpoint(0), checkpoint(6), scenario, factory, { ...options, signal: controller.signal })).rejects.toThrow()
    expect(factory).not.toHaveBeenCalled()
  })

  it('freezes caller inputs before yielding between runs', async () => {
    const input = structuredClone(scenario)
    const parent = checkpoint(0)
    const child = checkpoint(6)
    let created = 0
    const result = await comparePracticeCheckpoints(parent, child, input, () => {
      created += 1
      if (created === 1) {
        input.resources = []
        parent.name = 'Changed parent'
        child.name = 'Changed child'
      }
      return motion()
    }, options)
    expect(result.baseline.checkpointName).toBe('Comparison 0')
    expect(result.trained.checkpointName).toBe('Comparison 6')
    expect(result.trained.recording.scenario.resources).toEqual(scenario.resources)
  })
})
