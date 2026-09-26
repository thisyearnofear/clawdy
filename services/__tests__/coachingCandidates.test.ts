import { describe, expect, it } from 'vitest'
import { ArenaEpisode, type ArenaScenario } from '../arenaEpisode'
import { rankCoachingCandidates } from '../coachingCandidates'

// Fixture: base at west, cargo at field. The low road is 5 ticks, the ridge
// detour 30 — a taken detour is a correction the rollouts can measure.
function scenario(): ArenaScenario {
  return {
    id: 'candidate-test',
    worldVersion: 'fixture-v1',
    split: 'practice',
    seed: 12,
    durationTicks: 300,
    nodes: [
      { id: 'west', position: [-4, 0, 0] },
      { id: 'east', position: [4, 0, 0] },
      { id: 'ridge', position: [0, 3, 4] },
      { id: 'field', position: [0, 0, 0] },
    ],
    edges: [
      { id: 'west-low', from: 'west', to: 'field', travelTicks: 5, floodable: false },
      { id: 'east-low', from: 'east', to: 'field', travelTicks: 5, floodable: false },
      { id: 'west-high', from: 'west', to: 'ridge', travelTicks: 15, floodable: false },
      { id: 'east-high', from: 'east', to: 'ridge', travelTicks: 15, floodable: false },
      { id: 'ridge-field', from: 'ridge', to: 'field', travelTicks: 15, floodable: false },
    ],
    entrants: [
      { id: 'champion', baseNode: 'west', policyVersion: 'safe-v1' },
      { id: 'rival', baseNode: 'east', policyVersion: 'greedy-v1' },
    ],
    resources: Array.from({ length: 6 }, (_, index) => ({ id: `core-${index}`, nodeId: 'field', value: 1 })),
    floods: [],
  }
}

describe('Outcome-verified coaching candidates (WS1.4)', () => {
  it('proposes the short road when the champion commits to the detour', () => {
    const sc = scenario()
    const episode = new ArenaEpisode(sc)
    const snapshot = episode.snapshot()
    const observation = episode.observe('champion')
    const taken = { type: 'move', edgeId: 'west-high' } as const
    const candidates = rankCoachingCandidates(sc, snapshot, observation, taken)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.length).toBeLessThanOrEqual(3)
    expect(candidates[0].action).toEqual({ type: 'move', edgeId: 'west-low' })
    for (const c of candidates) {
      expect(c.delta120).toBeGreaterThanOrEqual(1)
      expect(c.delta240).toBeGreaterThanOrEqual(1)
      expect(c.rationale).toContain('measures +')
      expect(c.rationale).toContain('route model')
      expect(observation.availableActions.some(a => JSON.stringify(a) === JSON.stringify(c.action))).toBe(true)
    }
    expect(candidates.map(c => c.delta120)).toEqual([...candidates.map(c => c.delta120)].sort((a, b) => b - a))
  })

  it('is deterministic and respects the limit option', () => {
    const sc = scenario()
    const episode = new ArenaEpisode(sc)
    const snapshot = episode.snapshot()
    const observation = episode.observe('champion')
    const taken = { type: 'move', edgeId: 'west-high' } as const
    const first = rankCoachingCandidates(sc, snapshot, observation, taken)
    const second = rankCoachingCandidates(sc, snapshot, observation, taken)
    expect(JSON.stringify(first)).toEqual(JSON.stringify(second))
    const one = rankCoachingCandidates(sc, snapshot, observation, taken, { limit: 1 })
    expect(one).toHaveLength(1)
  })

  it('stays silent when the taken action is optimal and when no alternative clears the threshold', () => {
    const sc = scenario()
    const episode = new ArenaEpisode(sc)
    const snapshot = episode.snapshot()
    const observation = episode.observe('champion')
    // Taking the short road leaves nothing that beats it by ≥1 at both horizons.
    expect(rankCoachingCandidates(sc, snapshot, observation, { type: 'move', edgeId: 'west-low' })).toEqual([])
    expect(rankCoachingCandidates(sc, snapshot, observation, { type: 'move', edgeId: 'west-high' }, { minDelta: 1000 })).toEqual([])
  })
})
