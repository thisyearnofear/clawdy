import { describe, expect, it } from 'vitest'
import type { ArenaAction } from '../arenaEpisode'
import { describeBehaviourChange, summarizeBehaviourChange, type DecisionTrace } from '../behaviourDelta'

const move = (edgeId: string): ArenaAction => ({ type: 'move', edgeId })
const collect = (resourceId: string): ArenaAction => ({ type: 'collect', resourceId })

function trace(entries: [number, ArenaAction, boolean?][]): DecisionTrace[] {
  return entries.map(([tick, action, accepted = true]) => ({ tick, action, accepted }))
}

describe('behaviourDelta', () => {
  it('reports no change when both brains played identically', () => {
    const shared = trace([[0, move('ab')], [5, move('bc')], [10, { type: 'bank' }]])
    const delta = summarizeBehaviourChange(shared, shared)
    expect(delta.compared).toBe(3)
    expect(delta.changed).toBe(0)
    expect(delta.firstChangedTick).toBeNull()
    expect(describeBehaviourChange(delta)).toContain("didn't change how it drives")
  })

  it('counts the decisions that moved and pins the first one', () => {
    const parent = trace([[0, move('ab')], [5, move('bc')], [10, move('cd')]])
    const trained = trace([[0, move('ab')], [5, move('bd')], [10, move('cd')]])
    const delta = summarizeBehaviourChange(parent, trained)
    expect(delta.compared).toBe(3)
    expect(delta.changed).toBe(1)
    expect(delta.firstChangedTick).toBe(5)
    expect(delta.shifts).toEqual([{ from: 'move', to: 'move', count: 1 }])
  })

  it('ignores ticks only one run reached and decisions the controller rejected', () => {
    // Rejections are controller cadence, not the brain's choice, so they must
    // not be counted as behaviour — they are tracked separately instead.
    const parent = trace([[0, move('ab'), false], [5, move('bc')]])
    const trained = trace([[0, move('zz'), true], [5, move('bd')]])
    const delta = summarizeBehaviourChange(parent, trained)
    expect(delta.compared).toBe(1)
    expect(delta.changed).toBe(1)
    expect(delta.parentCounts.rejected).toBe(1)
    expect(delta.trainedCounts.rejected).toBe(0)
    expect(delta.rejectionDelta).toBe(-1)
  })

  it('treats a different edge or resource id as a real change', () => {
    const parent = trace([[0, move('ab')], [5, collect('core-1')]])
    const trained = trace([[0, move('ac')], [5, collect('core-2')]])
    const delta = summarizeBehaviourChange(parent, trained)
    expect(delta.changed).toBe(2)
  })

  it('reports fewer stuck moments as a positive signal', () => {
    const parent = trace([[0, move('ab'), false], [5, move('bc'), false], [10, move('cd')]])
    const trained = trace([[0, move('ab')], [5, move('bc')], [10, move('cd')]])
    const description = describeBehaviourChange(summarizeBehaviourChange(parent, trained))
    expect(description).toContain('2 fewer stuck moments')
  })

  it('describes a run with no shared decisions without dividing by zero', () => {
    const description = describeBehaviourChange(summarizeBehaviourChange(trace([[0, move('ab')]]), []))
    expect(description).toContain('No shared decisions')
  })
})