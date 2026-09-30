import { describe, expect, it } from 'vitest'
import { ArenaRunner } from '../arenaPolicy'
import { draftRecordedCorrection, recordedCoachContext } from '../coachingReview'
import { applyControllerRules } from '../arenaControllerRules'
import { type ArenaScenario } from '../arenaEpisode'
import { proposeCorrection } from '../coachingEngine'

const scenario: ArenaScenario = {
  id: 'coaching-review-practice', worldVersion: 'review-fixture-v1', split: 'practice', seed: 1, durationTicks: 100,
  nodes: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [1, 0, 0] }, { id: 'c', position: [0, 0, 1] }],
  edges: [
    { id: 'ab', from: 'a', to: 'b', travelTicks: 5, floodable: false },
    { id: 'ac', from: 'a', to: 'c', travelTicks: 5, floodable: false },
  ],
  entrants: [{ id: 'champion', baseNode: 'a', policyVersion: 'test' }, { id: 'rival', baseNode: 'b', policyVersion: 'test' }],
  resources: [{ id: 'core-b', nodeId: 'b', value: 1 }, { id: 'core-c', nodeId: 'c', value: 1 }], floods: [],
}

function recording() {
  const runner = new ArenaRunner(scenario, { champion: 'safe', rival: 'greedy' })
  runner.advanceTicks(scenario.durationTicks)
  return runner.recording()
}

describe('recorded correction provenance', () => {
  it('uses the actual pre-decision observation and the accepted recorded action', () => {
    const recorded = recording()
    const context = recordedCoachContext(recorded, 1)!
    expect(context.tick).toBe(0)
    expect(context.observation.tick).toBe(0)
    expect(context.observation.self.nodeId).toBe('a')
    expect(context.originalAction).toEqual(recorded.batches[0].requests.find(request => request.agentId === 'champion')!.action)
    expect(context.alternatives.length).toBeGreaterThan(0)
    for (const action of context.alternatives) {
      expect(applyControllerRules(context.observation, action)).toEqual(action)
      expect(action).not.toEqual(context.originalAction)
    }
    expect(recordedCoachContext(recorded, 0)).toEqual(context)
  })

  it('creates detached human drafts and rejects arbitrary actions', () => {
    const context = recordedCoachContext(recording(), 1)!
    const draft = draftRecordedCorrection(context, context.alternatives[0], scenario.id, 'draft-1')
    expect(draft).toMatchObject({ approved: false, source: 'draft', provenance: { kind: 'human' }, tick: 0, sourceEpisodeId: scenario.id })
    draft.observation.self.energy = 0
    expect(context.observation.self.energy).not.toBe(0)
    expect(() => draftRecordedCorrection(context, { type: 'move', edgeId: 'missing' }, scenario.id, 'bad')).toThrow('supported alternative')
  })

  it('does not create a correction from invalid or unrecorded frames', () => {
    const recorded = recording()
    expect(recordedCoachContext(recorded, -1)).toBeNull()
    expect(recordedCoachContext(recorded, recorded.checkpoints.length)).toBeNull()
    recorded.batches = []
    expect(recordedCoachContext(recorded, 0)).toBeNull()
  })

  it('refuses evaluation recordings and unrelated coaching text', () => {
    const recorded = recording()
    recorded.scenario.split = 'evaluation'
    expect(recordedCoachContext(recorded, 0)).toBeNull()
    const context = recordedCoachContext(recording(), 0)!
    expect(proposeCorrection('be more imaginative', context.observation, context.originalAction)).toBeNull()
  })

  it('recognizes a drain preference only during legal flooded transit', () => {
    const context = recordedCoachContext(recording(), 0)!
    const observation = structuredClone(context.observation)
    observation.weather.flooded = true
    observation.availableActions = [{ type: 'wait' }, { type: 'drain' }]
    observation.self.transit = { edgeId: 'ab', from: 'a', to: 'b', progressUnits: 1, requiredUnits: 20 }
    expect(proposeCorrection('drain when low route is urgent', observation, { type: 'wait' })?.preferredAction).toEqual({ type: 'drain' })
    observation.self.transit = null
    expect(proposeCorrection('drain when low route is urgent', observation, { type: 'wait' })).toBeNull()
  })

  it('never offers strategic overrides that the shared controller replaces', () => {
    const recorded = recording()
    for (let index = 0; index < recorded.checkpoints.length; index += 1) {
      const context = recordedCoachContext(recorded, index)
      if (!context) continue
      for (const action of context.alternatives) {
        expect(applyControllerRules(context.observation, action)).toEqual(action)
      }
    }
  })
})
