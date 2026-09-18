import { describe, expect, it } from 'vitest'
import { ArenaRunner } from '../arenaPolicy'
import type { ArenaScenario } from '../arenaEpisode'
import { planCinematicShots, shotAt } from '../arenaCinematic'

function scenario(): ArenaScenario {
  return {
    id: 'cinematic-course',
    worldVersion: 'fixture-v1',
    split: 'practice',
    seed: 12,
    durationTicks: 200,
    nodes: [
      { id: 'west', position: [-4, 0, 0] },
      { id: 'east', position: [4, 0, 0] },
      { id: 'ridge', position: [0, 3, 4] },
      { id: 'field', position: [0, 0, 0] },
    ],
    edges: [
      { id: 'west-low', from: 'west', to: 'field', travelTicks: 5, floodable: true },
      { id: 'east-low', from: 'east', to: 'field', travelTicks: 5, floodable: true },
      { id: 'west-high', from: 'west', to: 'ridge', travelTicks: 7, floodable: false },
      { id: 'east-high', from: 'east', to: 'ridge', travelTicks: 7, floodable: false },
      { id: 'ridge-field', from: 'ridge', to: 'field', travelTicks: 7, floodable: false },
    ],
    entrants: [
      { id: 'champion', baseNode: 'west', policyVersion: 'safe-v1' },
      { id: 'rival', baseNode: 'east', policyVersion: 'greedy-v1' },
    ],
    resources: Array.from({ length: 6 }, (_, index) => ({ id: `core-${index}`, nodeId: 'field', value: 1 })),
    floods: [{ startTick: 40, endTick: 80 }],
  }
}

function finishedRecording() {
  const runner = new ArenaRunner(scenario(), { champion: 'safe', rival: 'greedy' })
  runner.advanceTicks(scenario().durationTicks)
  return runner.recording()
}

describe('deterministic cinematic storyboard', () => {
  it('returns no shots for an empty recording', () => {
    expect(planCinematicShots({ checkpoints: [] })).toEqual([])
  })

  it('partitions the full checkpoint range into ordered, contiguous shots', () => {
    const recording = finishedRecording()
    const count = recording.checkpoints.length
    const shots = planCinematicShots(recording)
    expect(shots.length).toBeGreaterThan(2)
    expect(shots[0].kind).toBe('establish')
    expect(shots[0].fromIndex).toBe(0)
    expect(shots.at(-1)!.kind).toBe('finish')
    expect(shots.at(-1)!.toIndex).toBe(count)
    for (let index = 1; index < shots.length; index++) {
      expect(shots[index].fromIndex).toBe(shots[index - 1].toIndex)
      expect(shots[index].toIndex).toBeGreaterThan(shots[index].fromIndex)
    }
  })

  it('emits event shots only for recorded facts: flood, collect/bank, finish', () => {
    const recording = finishedRecording()
    const shots = planCinematicShots(recording)
    const flood = shots.find(shot => shot.kind === 'flood')
    expect(flood).toBeDefined()
    // The flood shot must overlap the recorded transition at tick 40 (checkpoint every 5 ticks).
    const transitionIndex = recording.checkpoints.findIndex(checkpoint => checkpoint.state.tick === 40)
    expect(transitionIndex).toBeGreaterThan(0)
    expect(transitionIndex).toBeGreaterThanOrEqual(flood!.fromIndex)
    expect(transitionIndex).toBeLessThan(flood!.toIndex)
    expect(shots.some(shot => shot.kind === 'collect' || shot.kind === 'bank')).toBe(true)
    for (const shot of shots.filter(shot => shot.kind === 'collect' || shot.kind === 'bank')) {
      expect(shot.agentId).not.toBeNull()
    }
    expect(shots.at(-1)!.agentId).toBe(recording.checkpoints.at(-1)!.state.winner)
  })

  it('is deterministic: the same recording always yields the same storyboard', () => {
    const recording = finishedRecording()
    expect(planCinematicShots(recording)).toEqual(planCinematicShots(recording))
  })

  it('ends unfinished recordings with coverage shots, not a finish shot', () => {
    const runner = new ArenaRunner(scenario(), { champion: 'safe', rival: 'greedy' })
    runner.advanceTicks(60)
    const recording = runner.recording()
    const shots = planCinematicShots(recording)
    expect(shots.some(shot => shot.kind === 'finish')).toBe(false)
    expect(shots.at(-1)!.toIndex).toBe(recording.checkpoints.length)
    for (let index = 1; index < shots.length; index++) {
      expect(shots[index].fromIndex).toBe(shots[index - 1].toIndex)
    }
  })

  it('locates the shot covering each index and rejects out-of-range indices', () => {
    const recording = finishedRecording()
    const shots = planCinematicShots(recording)
    for (const shot of shots) {
      expect(shotAt(shots, shot.fromIndex)).toEqual(shot)
      expect(shotAt(shots, shot.toIndex - 1)).toEqual(shot)
    }
    expect(shotAt(shots, -1)).toBeNull()
    expect(shotAt(shots, recording.checkpoints.length)).toBeNull()
    expect(shotAt([], 0)).toBeNull()
  })
})
