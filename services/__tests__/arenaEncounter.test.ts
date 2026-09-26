import { describe, expect, it } from 'vitest'
import {
  ENCOUNTER_TRIGGER_DISTANCE,
  fingerprintLine,
  focusVectorForChampion,
  focusVectorForRival,
  horizontalDistance,
  resolveEncounter,
  shouldOfferEncounter,
} from '../arenaEncounter'
import type { ArenaSnapshot } from '../arenaEpisode'

function stubEpisode(overrides: {
  championPos: [number, number, number]
  rivalPos: [number, number, number]
  tick?: number
  flooded?: boolean
}): ArenaSnapshot {
  return {
    rulesVersion: 'test',
    controllerVersion: 'test',
    tick: overrides.tick ?? 100,
    status: 'running',
    winner: null,
    agents: [
      {
        id: 'champion',
        baseNode: 'a',
        policyVersion: 't',
        nodeId: 'a',
        position: overrides.championPos,
        transit: null,
        energy: 10,
        cargo: 1,
        banked: 0,
        cooldownUntilTick: 0,
        lastOutcome: null,
        visitedNodes: ['a'],
        knownResources: [],
        grounded: true,
        rotation: [0, 0, 0, 1],
        blockedTicks: 0,
        blockedEdges: [],
        recoveries: 0,
      },
      {
        id: 'rival',
        baseNode: 'b',
        policyVersion: 't',
        nodeId: 'b',
        position: overrides.rivalPos,
        transit: null,
        energy: 10,
        cargo: 2,
        banked: 0,
        cooldownUntilTick: 0,
        lastOutcome: null,
        visitedNodes: ['b'],
        knownResources: [],
        grounded: true,
        rotation: [0, 0, 0, 1],
        blockedTicks: 0,
        blockedEdges: [],
        recoveries: 0,
      },
    ],
    resources: [],
    weather: { flooded: Boolean(overrides.flooded), drainedUntilTick: 0 },
  }
}

describe('arenaEncounter', () => {
  it('measures horizontal distance', () => {
    expect(horizontalDistance([0, 1, 0], [3, 9, 4])).toBe(5)
  })

  it('offers an encounter when agents are close after the opening', () => {
    const episode = stubEpisode({
      championPos: [0, 0, 0],
      rivalPos: [ENCOUNTER_TRIGGER_DISTANCE - 0.1, 0, 0],
      tick: 100,
    })
    expect(shouldOfferEncounter({ phaseRunning: true, episode, lastEncounterTick: null })).toBe(true)
    expect(shouldOfferEncounter({ phaseRunning: true, episode, lastEncounterTick: 90 })).toBe(false)
  })

  it('resolves weather-trained champions over contest-heavy rivals in a flood', () => {
    const champion = focusVectorForChampion([
      { rationale: 'Flooding is active; take the ridge', preferredAction: { type: 'move' }, approved: true },
      { rationale: 'Flooding is active; take the ridge', preferredAction: { type: 'move' }, approved: true },
      { rationale: 'Drain opens the valley', preferredAction: { type: 'drain' }, approved: true },
    ])
    const rival = focusVectorForRival('greedy')
    const result = resolveEncounter(champion, rival, { flooded: true, championCargo: 0, rivalCargo: 2 })
    expect(result.winnerId).toBe('champion')
    expect(result.transferCargo).toBe(true)
    expect(result.reason.toLowerCase()).toContain('clash')
  })

  it('builds a fingerprint line from examples', () => {
    const vector = focusVectorForChampion([
      { rationale: 'Deliver banked resources', preferredAction: { type: 'bank' }, approved: true },
      { rationale: 'Deliver banked resources', preferredAction: { type: 'bank' }, approved: true },
    ])
    expect(fingerprintLine(vector)).toContain('bank')
  })
})
