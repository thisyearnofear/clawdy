import { describe, expect, it } from 'vitest'
import {
  LADDER_PREVIEW,
  RUSH_EVENT_PREVIEW,
  TRAINING_PREVIEW,
  newlyAppendedRushEvents,
} from '../experienceMocks'

describe('Experience contract previews', () => {
  it('uses stable ladder fields and a chart with rising best fitness', () => {
    expect(LADDER_PREVIEW.map(rover => rover.roverId)).toEqual(['preview-champion', 'preview-rival'])
    for (const rover of LADDER_PREVIEW) {
      expect(rover.look.accent).toMatch(/^#[0-9a-f]{6}$/)
      expect(rover.rating).toBeGreaterThan(0)
    }
    expect(TRAINING_PREVIEW.map(step => step.gen)).toEqual([0, 1, 2, 3])
    expect(TRAINING_PREVIEW.every((step, index) =>
      index === 0 || step.best >= TRAINING_PREVIEW[index - 1].best,
    )).toBe(true)
  })

  it('fires only appended authoritative events, in order', () => {
    const [spawn, bump] = RUSH_EVENT_PREVIEW
    expect(newlyAppendedRushEvents([], [spawn])).toEqual([spawn])
    expect(newlyAppendedRushEvents([spawn], [spawn, bump])).toEqual([bump])
    expect(newlyAppendedRushEvents([spawn, bump], [spawn, bump])).toEqual([])
    if (bump.type !== 'bump') throw new Error('Expected bump fixture')
    expect(newlyAppendedRushEvents([spawn], [{ ...spawn }, { ...bump, position: [...bump.position] as [number, number, number] }])).toEqual([bump])
    expect(newlyAppendedRushEvents([bump], [{ ...bump, position: [...bump.position] as [number, number, number] }])).toEqual([])
  })

  it('treats a swapped recording or reset as a fresh log without missing events', () => {
    const [spawn, bump] = RUSH_EVENT_PREVIEW
    expect(newlyAppendedRushEvents([spawn, bump], [spawn])).toEqual([spawn])
    expect(newlyAppendedRushEvents([spawn], [bump])).toEqual([bump])
    expect(newlyAppendedRushEvents([spawn], undefined)).toEqual([])
  })
})
