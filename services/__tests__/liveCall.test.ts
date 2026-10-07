import { describe, expect, it } from 'vitest'
import type { ArenaAction, ArenaObservation } from '../arenaEpisode'
import { applyLiveCallToAction, liveCallContext, wrapPolicyWithLiveCall } from '../liveCall'

function observation(edgeIds: string[]): ArenaObservation {
  return {
    availableActions: edgeIds.map(edgeId => ({ type: 'move', edgeId })),
    edges: edgeIds.map((id, i) => ({
      id,
      from: 'a',
      to: 'b',
      length: 1,
      currentTravelTicks: 10 + i,
      floodable: false,
    })),
  } as unknown as ArenaObservation
}

describe('liveCallContext', () => {
  it('offers legal alternatives once the race is far enough along', () => {
    const obs = observation(['ridge', 'valley', 'short'])
    const ctx = liveCallContext({
      tick: 150,
      durationTicks: 600,
      observation: obs,
      plannedAction: { type: 'move', edgeId: 'ridge' },
      alreadyCalled: false,
    })
    expect(ctx).not.toBeNull()
    expect(ctx!.routeOptions.map(o => o.edgeId)).toEqual(['valley', 'short'])
  })

  it('stays quiet after a call or when only one alternative exists', () => {
    expect(liveCallContext({
      tick: 150,
      durationTicks: 600,
      observation: observation(['ridge', 'valley']),
      plannedAction: { type: 'move', edgeId: 'ridge' },
      alreadyCalled: true,
    })).toBeNull()
    expect(liveCallContext({
      tick: 150,
      durationTicks: 600,
      observation: observation(['ridge', 'valley']),
      plannedAction: { type: 'move', edgeId: 'ridge' },
      alreadyCalled: false,
    })).toBeNull()
  })
})

describe('applyLiveCallToAction — strong apply for the current run', () => {
  it('takes the called edge when it is legal', () => {
    const obs = observation(['ridge', 'valley', 'short'])
    const base: ArenaAction = { type: 'move', edgeId: 'ridge' }
    expect(applyLiveCallToAction({ observation: obs, calledEdgeId: 'valley', baseAction: base })).toEqual({
      type: 'move',
      edgeId: 'valley',
    })
  })

  it('falls through to the base action when the called edge is not legal', () => {
    const obs = observation(['ridge', 'short'])
    const base: ArenaAction = { type: 'wait' }
    expect(applyLiveCallToAction({ observation: obs, calledEdgeId: 'valley', baseAction: base })).toEqual(base)
  })
})

describe('wrapPolicyWithLiveCall — divert for the rest of the run', () => {
  it('prefers the called edge on later ticks whenever it is legal', () => {
    const base = () => ({ type: 'move', edgeId: 'ridge' }) as ArenaAction
    const wrapped = wrapPolicyWithLiveCall(base, 'valley')
    expect(wrapped(observation(['ridge', 'valley']))).toEqual({ type: 'move', edgeId: 'valley' })
    // In transit / wrong junction: fall through until the edge returns.
    expect(wrapped(observation(['ridge', 'short']))).toEqual({ type: 'move', edgeId: 'ridge' })
    expect(wrapped(observation(['valley', 'short']))).toEqual({ type: 'move', edgeId: 'valley' })
  })
})
