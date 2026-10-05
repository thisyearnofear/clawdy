import { describe, expect, it } from 'vitest'
import type { ArenaAgentState, ArenaRecording, ArenaSnapshot } from '../arenaEpisode'
import { MAX_REPLAY_MARKERS, summarizeReplayMarkers } from '../replayMarkers'

const agent = (id: string, over: Partial<Record<string, unknown>> = {}): ArenaAgentState => ({
  id,
  baseNode: 'n1',
  policyVersion: `learned.${id}`,
  nodeId: 'n1',
  position: [0, 0, 0],
  transit: null,
  energy: 12,
  cargo: 0,
  banked: 0,
  cooldownUntilTick: 0,
  staggeredUntilTick: 0,
  lastOutcome: null,
  visitedNodes: ['n1'],
  knownResources: [],
  grounded: true,
  rotation: [0, 0, 0, 1],
  blockedTicks: 0,
  blockedEdges: [],
  recoveries: 0,
  ...over,
} as ArenaAgentState)

function recording(states: Partial<ArenaSnapshot>[]): ArenaRecording {
  return {
    schemaVersion: 'arena-recording-v1',
    rulesVersion: 'season-0.reference.3',
    controllerVersion: 'route-reference-v2',
    scenario: {
      id: 's1', worldVersion: 'w1', split: 'evaluation', seed: 1, durationTicks: 100,
      nodes: [{ id: 'n1', position: [0, 0, 0] }],
      edges: [],
      entrants: [
        { id: 'champion', baseNode: 'n1', policyVersion: 'learned.champ' },
        { id: 'rival', baseNode: 'n1', policyVersion: 'learned.rival' },
      ],
      resources: [], floods: [],
    },
    finalTick: states.length - 1,
    batches: [],
    checkpoints: states.map(over => ({
      state: {
        rulesVersion: 'season-0.reference.3',
        controllerVersion: 'route-reference-v2',
        tick: 0, status: 'running', winner: null,
        agents: [agent('champion'), agent('rival')],
        resources: [],
        weather: { flooded: false, drainedUntilTick: 0 },
        events: [],
        ...over,
      } as ArenaSnapshot,
    })),
  }
}

describe('replay markers', () => {
  it('passes through authoritative sim events', () => {
    const rec = recording([{
      events: [
        { type: 'bump', tick: 40, winnerId: 'champion', loserId: 'rival', position: [1, 0, 1], stolen: 1 },
        { type: 'core_spawn', tick: 10, resourceId: 'core-3', nodeId: 'n7', value: 2 },
      ],
    }])
    const markers = summarizeReplayMarkers(rec)
    expect(markers.map(marker => marker.type).sort()).toEqual(['bump', 'core-spawn'])
    const bump = markers.find(marker => marker.type === 'bump')!
    expect(bump.tick).toBe(40)
    expect(bump.agentId).toBe('rival')
    expect(bump.note).toContain('learned.champ')
  })

  it('passes through future sim event types instead of dropping them', () => {
    const rec = recording([{
      events: [
        { type: 'collision-damage', tick: 60, agentId: 'rival', amount: 2 } as never,
      ],
    }])
    const markers = summarizeReplayMarkers(rec)
    expect(markers).toContainEqual({ type: 'collision-damage', tick: 60, agentId: 'rival', note: 'amount=2' })
  })

  it('marks the first checkpoint where a battery bottoms out, once per agent', () => {
    const rec = recording([
      { tick: 0, agents: [agent('champion', { energy: 8 }), agent('rival')] },
      { tick: 5, agents: [agent('champion', { energy: -0.4 }), agent('rival', { energy: 0 })] },
      { tick: 10, agents: [agent('champion', { energy: -0.4 }), agent('rival', { energy: 0 })] },
    ])
    const markers = summarizeReplayMarkers(rec).filter(marker => marker.type === 'battery-out')
    expect(markers).toHaveLength(2)
    expect(markers.every(marker => marker.tick === 5)).toBe(true)
    expect(markers.map(marker => marker.agentId).sort()).toEqual(['champion', 'rival'])
  })

  it('marks recoveries and bank deposits as they appear', () => {
    const rec = recording([
      { tick: 0 },
      { tick: 5, agents: [agent('champion', { recoveries: 1 }), agent('rival', { banked: 3 })] },
      { tick: 10, agents: [agent('champion', { recoveries: 2 }), agent('rival', { banked: 6 })] },
    ])
    const markers = summarizeReplayMarkers(rec)
    expect(markers.filter(marker => marker.type === 'recovery').map(marker => marker.tick)).toEqual([5, 10])
    expect(markers.filter(marker => marker.type === 'bank').map(marker => marker.tick)).toEqual([5, 10])
    expect(markers.find(marker => marker.type === 'bank' && marker.tick === 10)?.note).toBe('banked 3 (total 6)')
  })

  it('returns [] for a malformed recording and stays sorted and bounded', () => {
    expect(summarizeReplayMarkers({} as ArenaRecording)).toEqual([])
    const rec = recording([
      { tick: 5 },
      { tick: 0, agents: [agent('champion', { energy: -1 }), agent('rival')] },
    ])
    const markers = summarizeReplayMarkers(rec)
    expect(markers[0].tick).toBe(0) // sorted by tick, not by checkpoint order
    const huge = recording(Array.from({ length: 500 }, (_, tick) => ({
      tick,
      agents: [agent('champion', { banked: tick }), agent('rival')],
    })))
    expect(summarizeReplayMarkers(huge).length).toBeLessThanOrEqual(MAX_REPLAY_MARKERS)
  })
})
