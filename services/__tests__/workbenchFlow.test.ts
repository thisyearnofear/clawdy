import { describe, expect, it } from 'vitest'
import { computeNextStep, type NextStepInput } from '../workbenchFlow'

const base: NextStepInput = {
  visualReady: true,
  phase: 'ready',
  playMode: 'practice',
  coachingLocked: false,
  studioOpen: false,
  approvedCount: 0,
}

const step = (over: Partial<NextStepInput>) => computeNextStep({ ...base, ...over })

describe('computeNextStep — golden branch order (mirrors the pre-extraction ArenaScene IIFE)', () => {
  it('world not ready wins over everything', () => {
    expect(step({ visualReady: false, phase: 'error' })).toEqual({ label: 'Settling the world…', run: null })
    expect(step({ visualReady: false, phase: 'finished', studioOpen: true, approvedCount: 3 })).toEqual({
      label: 'Settling the world…',
      run: null,
    })
  })

  it('error offers the reload', () => {
    expect(step({ phase: 'error' })).toEqual({ label: 'Reload the world', run: 'retry' })
  })

  it('ready distinguishes compete (coaching locked) from practice', () => {
    expect(step({ phase: 'ready', playMode: 'compete' })).toEqual({
      label: 'Press Play — Match (coaching locked)',
      run: 'play',
    })
    expect(step({ phase: 'ready', playMode: 'practice' })).toEqual({
      label: 'Press Play to start Practice',
      run: 'play',
    })
  })

  it('running has no action', () => {
    expect(step({ phase: 'running' })).toEqual({ label: 'Watch the race — Pause anytime', run: null })
  })

  it('paused routes to replay', () => {
    expect(step({ phase: 'paused' })).toEqual({ label: 'Resume, or open Replay', run: 'review' })
  })

  it('finished: coach the miss in practice, reset-then-teach when locked', () => {
    expect(step({ phase: 'finished' })).toEqual({ label: 'Open Replay, then Coach the miss', run: 'review-coach' })
    expect(step({ phase: 'finished', coachingLocked: true })).toEqual({
      label: 'Reset, then switch to Practice to teach',
      run: 'teach',
    })
    // coachingLocked also blocks the review-coach prompt even outside match mode
    expect(step({ phase: 'finished', coachingLocked: true, studioOpen: true, approvedCount: 2 })).toEqual({
      label: 'Reset, then switch to Practice to teach',
      run: 'teach',
    })
  })

  it('review opens the coach only when closed and unlocked', () => {
    expect(step({ phase: 'review' })).toEqual({ label: 'Open Coach and pick a focus', run: 'coach' })
    expect(step({ phase: 'review', studioOpen: true })).toEqual({
      label: 'Pick a focus chip and Approve a fix',
      run: null,
    })
    expect(step({ phase: 'review', coachingLocked: true })).toEqual({
      label: 'Play → Replay → Coach → Train → Match',
      run: null,
    })
  })

  it('open studio gates on approved count, with singular/plural label', () => {
    expect(step({ phase: 'review', studioOpen: true, approvedCount: 1 })).toEqual({
      label: 'Train from 1 approved note',
      run: 'train',
    })
    expect(step({ phase: 'review', studioOpen: true, approvedCount: 4 })).toEqual({
      label: 'Train from 4 approved notes',
      run: 'train',
    })
  })

  it('paused/running ignore studio state entirely (phase branches come first)', () => {
    expect(step({ phase: 'paused', studioOpen: true, approvedCount: 5 })).toEqual({
      label: 'Resume, or open Replay',
      run: 'review',
    })
  })

  it('fallback line covers review+studio+locked combos', () => {
    expect(step({ phase: 'review', studioOpen: true, coachingLocked: true, approvedCount: 3 })).toEqual({
      label: 'Play → Replay → Coach → Train → Match',
      run: null,
    })
  })
})
