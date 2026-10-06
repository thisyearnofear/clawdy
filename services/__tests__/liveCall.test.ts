import { describe, expect, it } from 'vitest'
import type { ArenaObservation } from '../arenaEpisode'
import { liveCallContext } from '../liveCall'

function observation(at: string, edges: { id: string; from: string; to: string; ticks: number }[]): ArenaObservation {
  return {
    self: { nodeId: at },
    edges: edges.map(edge => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      travelTicks: edge.ticks,
      currentTravelTicks: edge.ticks,
      floodable: true,
      blocked: false,
    })),
    availableActions: edges.map(edge => ({ type: 'move' as const, edgeId: edge.id })),
  } as unknown as ArenaObservation
}

describe('liveCallContext route labels', () => {
  it('gives distinct readable labels when two valley edges are legal', () => {
    const obs = observation('champion-base', [
      { id: 'valley-cb-n1', from: 'champion-base', to: 'valley-n1', ticks: 10 },
      { id: 'valley-cb-vc', from: 'champion-base', to: 'valley-center', ticks: 12 },
      { id: 'base-cb-rn', from: 'champion-base', to: 'ridge-north', ticks: 14 },
    ])
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
