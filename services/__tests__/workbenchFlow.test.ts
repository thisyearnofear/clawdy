import { describe, expect, it } from 'vitest'
import { computeNextStep, detectMistakeSignal, type NextStepInput } from '../workbenchFlow'

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

type MistakeInput = Parameters<typeof detectMistakeSignal>[0]

const mistakeBase: MistakeInput = {
  tick: 200,
  flooded: false,
  recoveries: 0,
  prevRecoveries: 0,
  lastOutcome: null,
  transitEdgeId: null,
  floodableEdgeIds: new Set(['edge-flood']),
}

const mistake = (over: Partial<MistakeInput>) => detectMistakeSignal({ ...mistakeBase, ...over })

describe('detectMistakeSignal — visible-error trigger for the first-mistake card', () => {
  it('fires when a rescue increments recoveries', () => {
    expect(mistake({ recoveries: 1 })?.headline).toContain('rescue')
  })

  it('does not re-fire while the recovery count merely holds', () => {
    expect(mistake({ recoveries: 1, prevRecoveries: 1 })).toBeNull()
  })

  it('a reset dropping recoveries below the cursor does not fire (self-heals next tick)', () => {
    expect(mistake({ recoveries: 0, prevRecoveries: 2 })).toBeNull()
  })

  it('fires on a same-tick non-cadence rejection and names the reason', () => {
    const signal = mistake({
      lastOutcome: { tick: 200, accepted: false, reason: 'movement-blocked' },
    })
    expect(signal?.headline).toContain('movement blocked')
  })

  it('ignores stale rejections from earlier ticks', () => {
    expect(mistake({
      lastOutcome: { tick: 199, accepted: false, reason: 'movement-blocked' },
    })).toBeNull()
  })

  it('ignores in-transit rejections — cadence noise the player never sees', () => {
    expect(mistake({
      lastOutcome: { tick: 200, accepted: false, reason: 'in-transit' },
    })).toBeNull()
  })

  it('ignores accepted outcomes', () => {
    expect(mistake({
      lastOutcome: { tick: 200, accepted: true },
    })).toBeNull()
  })

  it('fires on flood-caught transit over a floodable edge', () => {
    expect(mistake({ flooded: true, transitEdgeId: 'edge-flood' })?.headline).toContain('flood')
  })

  it('does not flood-fire on a dry edge or a dry transit', () => {
    expect(mistake({ flooded: true, transitEdgeId: 'edge-dry' })).toBeNull()
    expect(mistake({ flooded: false, transitEdgeId: 'edge-flood' })).toBeNull()
    expect(mistake({ flooded: true, transitEdgeId: null })).toBeNull()
  })

  it('rescue outranks rejection outranks flood (first match wins)', () => {
    const signal = mistake({
      recoveries: 1,
      lastOutcome: { tick: 200, accepted: false, reason: 'no-cargo' },
      flooded: true,
      transitEdgeId: 'edge-flood',
    })
    expect(signal?.headline).toContain('rescue')
  })

  it('fires on a rejection inside the observed window — fast-forward publishes skip ticks', () => {
    const signal = mistake({
      tick: 205,
      sinceTick: 198,
      lastOutcome: { tick: 201, accepted: false, reason: 'movement-blocked' },
    })
    expect(signal?.headline).toContain('movement blocked')
  })

  it('still ignores rejections older than the observed window', () => {
    expect(mistake({
      tick: 205,
      sinceTick: 198,
      lastOutcome: { tick: 195, accepted: false, reason: 'movement-blocked' },
    })).toBeNull()
  })
})
