import { describe, expect, it } from 'vitest'
import { COACH_GUIDANCE_HINT, coachPanelView } from '../coachPanelView'

const base = {
  exampleCount: 0,
  approvedCount: 0,
  coachingLocked: false,
  syncHasProblem: false,
}

const view = (over: Partial<Parameters<typeof coachPanelView>[0]>) => coachPanelView({ ...base, ...over })

describe('coachPanelView', () => {
  it('opens guidance when there is nothing to approve', () => {
    // With an empty queue, keyword guidance is the only way to make progress,
    // so it leads rather than hiding in a drawer.
    expect(view({}).guidanceOpen).toBe(true)
    expect(view({}).showGuidanceHint).toBe(false)
  })

  it('collapses guidance behind a one-line hint once a queue exists', () => {
    const withQueue = view({ exampleCount: 2, approvedCount: 1 })
    expect(withQueue.guidanceOpen).toBe(false)
    expect(withQueue.showGuidanceHint).toBe(true)
  })

  it('hides the hint in a scored match, where coaching is off entirely', () => {
    expect(view({ exampleCount: 2, coachingLocked: true }).showGuidanceHint).toBe(false)
    // Guidance still opens: a locked match is exactly when a player goes
    // looking for why they cannot coach.
    expect(view({ coachingLocked: true }).guidanceOpen).toBe(true)
  })

  it('always renders the queue, empty or not', () => {
    // The empty state is where a player learns how to start, so it is never
    // suppressed.
    expect(view({}).showQueue).toBe(true)
    expect(view({ exampleCount: 3 }).showQueue).toBe(true)
  })

  it('keeps sync trouble loud only when the queue is empty', () => {
    // An empty queue plus a sync warning means the player has nothing else to
    // look at, so the warning can surface. With work queued, it must not
    // outrank the Approve/Train buttons.
    expect(view({ syncHasProblem: true }).syncIsQuiet).toBe(false)
    expect(view({ syncHasProblem: true, exampleCount: 1 }).syncIsQuiet).toBe(true)
  })

  it('never reports sync trouble when there is none', () => {
    expect(view({ syncHasProblem: false }).syncIsQuiet).toBe(true)
    expect(view({ syncHasProblem: false, exampleCount: 2 }).syncIsQuiet).toBe(true)
  })

  it('names both ways to add a lesson', () => {
    expect(COACH_GUIDANCE_HINT).toMatch(/mid-race/i)
    expect(COACH_GUIDANCE_HINT).toMatch(/Replay/i)
  })
})