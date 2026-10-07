import { describe, expect, it } from 'vitest'
import type { ArenaAction, ArenaObservation } from '../arenaEpisode'
import {
  applyLiveCallToAction,
  edgeDestinationNode,
  liveCallContext,
  resolveLiveCallPreference,
  wrapPolicyWithLiveCall,
  type LiveCallPreference,
} from '../liveCall'

function observation(opts: {
  nodeId: string
  edges: { id: string; from: string; to: string; travelTicks?: number }[]
  legalEdgeIds: string[]
}): ArenaObservation {
  return {
    self: { nodeId: opts.nodeId },
    availableActions: opts.legalEdgeIds.map(edgeId => ({ type: 'move', edgeId })),
    edges: opts.edges.map((edge, i) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      length: 1,
      currentTravelTicks: edge.travelTicks ?? 10 + i,
      floodable: false,
    })),
  } as unknown as ArenaObservation
}

describe('liveCallContext', () => {
  it('offers legal alternatives once the race is far enough along', () => {
    const obs = observation({
      nodeId: 'a',
      edges: [
        { id: 'ridge', from: 'a', to: 'b' },
        { id: 'valley', from: 'a', to: 'c' },
        { id: 'short', from: 'a', to: 'd' },
      ],
      legalEdgeIds: ['ridge', 'valley', 'short'],
    })
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
    const obs = observation({
      nodeId: 'a',
      edges: [
        { id: 'ridge', from: 'a', to: 'b' },
        { id: 'valley', from: 'a', to: 'c' },
      ],
      legalEdgeIds: ['ridge', 'valley'],
    })
    expect(liveCallContext({
      tick: 150,
      durationTicks: 600,
      observation: obs,
      plannedAction: { type: 'move', edgeId: 'ridge' },
      alreadyCalled: true,
    })).toBeNull()
    expect(liveCallContext({
      tick: 150,
      durationTicks: 600,
      observation: obs,
      plannedAction: { type: 'move', edgeId: 'ridge' },
      alreadyCalled: false,
    })).toBeNull()
  })
})

describe('resolveLiveCallPreference — destination sticky', () => {
  it('remembers the destination node from the call-time junction', () => {
    const obs = observation({
      nodeId: 'junction',
      edges: [{ id: 'valley', from: 'junction', to: 'core-spot' }],
      legalEdgeIds: ['valley'],
    })
    expect(resolveLiveCallPreference(obs, 'valley')).toEqual({
      calledEdgeId: 'valley',
      preferredNodeId: 'core-spot',
    })
    expect(edgeDestinationNode({ from: 'core-spot', to: 'junction' }, 'junction')).toBe('core-spot')
  })

  it('returns null for an unknown edge', () => {
    const obs = observation({ nodeId: 'a', edges: [], legalEdgeIds: [] })
    expect(resolveLiveCallPreference(obs, 'missing')).toBeNull()
  })
})

describe('applyLiveCallToAction — strong sticky apply', () => {
  const preference: LiveCallPreference = { calledEdgeId: 'valley', preferredNodeId: 'core-spot' }

  it('takes the called edge when it is legal', () => {
    const obs = observation({
      nodeId: 'junction',
      edges: [
        { id: 'ridge', from: 'junction', to: 'ridge-end' },
        { id: 'valley', from: 'junction', to: 'core-spot' },
      ],
      legalEdgeIds: ['ridge', 'valley'],
    })
    const base: ArenaAction = { type: 'move', edgeId: 'ridge' }
    expect(applyLiveCallToAction({ observation: obs, preference, baseAction: base })).toEqual({
      action: { type: 'move', edgeId: 'valley' },
      status: 'applied',
    })
  })

  it('prefers any legal move toward the destination when the exact edge is gone', () => {
    // Rover is elsewhere; a different edge also reaches core-spot.
    const obs = observation({
      nodeId: 'side',
      edges: [
        { id: 'ridge', from: 'side', to: 'ridge-end' },
        { id: 'alt-to-core', from: 'side', to: 'core-spot' },
      ],
      legalEdgeIds: ['ridge', 'alt-to-core'],
    })
    const base: ArenaAction = { type: 'move', edgeId: 'ridge' }
    expect(applyLiveCallToAction({ observation: obs, preference, baseAction: base })).toEqual({
      action: { type: 'move', edgeId: 'alt-to-core' },
      status: 'applied',
    })
  })

  it('defers to the base action until a legal junction can honor the call', () => {
    const obs = observation({
      nodeId: 'elsewhere',
      edges: [
        { id: 'ridge', from: 'elsewhere', to: 'ridge-end' },
        { id: 'short', from: 'elsewhere', to: 'short-end' },
      ],
      legalEdgeIds: ['ridge', 'short'],
    })
    const base: ArenaAction = { type: 'wait' }
    expect(applyLiveCallToAction({ observation: obs, preference, baseAction: base })).toEqual({
      action: base,
      status: 'deferred',
    })
  })
})

describe('wrapPolicyWithLiveCall — divert for the rest of the run', () => {
  it('re-applies at the next legal junction via destination sticky', () => {
    const preference: LiveCallPreference = { calledEdgeId: 'valley', preferredNodeId: 'core-spot' }
    const base = () => ({ type: 'move', edgeId: 'ridge' }) as ArenaAction
    const wrapped = wrapPolicyWithLiveCall(base, preference)

    // Exact edge legal.
    expect(wrapped(observation({
      nodeId: 'junction',
      edges: [
        { id: 'ridge', from: 'junction', to: 'r' },
        { id: 'valley', from: 'junction', to: 'core-spot' },
      ],
      legalEdgeIds: ['ridge', 'valley'],
    }))).toEqual({ type: 'move', edgeId: 'valley' })

    // Wrong junction: fall through until destination is reachable.
    expect(wrapped(observation({
      nodeId: 'elsewhere',
      edges: [
        { id: 'ridge', from: 'elsewhere', to: 'r' },
        { id: 'short', from: 'elsewhere', to: 's' },
      ],
      legalEdgeIds: ['ridge', 'short'],
    }))).toEqual({ type: 'move', edgeId: 'ridge' })

    // Later junction: different edge to the same destination still honors the call.
    expect(wrapped(observation({
      nodeId: 'side',
      edges: [
        { id: 'ridge', from: 'side', to: 'r' },
        { id: 'alt-to-core', from: 'side', to: 'core-spot' },
      ],
      legalEdgeIds: ['ridge', 'alt-to-core'],
    }))).toEqual({ type: 'move', edgeId: 'alt-to-core' })
  })
})

describe('liveCallContext route labels', () => {
  it('gives distinct readable labels when two valley edges are legal', () => {
    const obs = observation({
      nodeId: 'champion-base',
      edges: [
        { id: 'valley-cb-n1', from: 'champion-base', to: 'valley-n1', travelTicks: 10 },
        { id: 'valley-cb-vc', from: 'champion-base', to: 'valley-center', travelTicks: 12 },
        { id: 'base-cb-rn', from: 'champion-base', to: 'ridge-north', travelTicks: 14 },
      ],
      legalEdgeIds: ['valley-cb-n1', 'valley-cb-vc', 'base-cb-rn'],
    })
    const context = liveCallContext({
      tick: 200,
      durationTicks: 1200,
      observation: obs,
      plannedAction: { type: 'move', edgeId: 'base-cb-rn' },
      alreadyCalled: false,
    })
    expect(context).not.toBeNull()
    const labels = context!.routeOptions.map(option => option.label)
    expect(labels).toContain('the valley → valley n1')
    expect(labels).toContain('the valley → valley center')
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels.every(label => !label.startsWith('valley-'))).toBe(true)
  })
})
