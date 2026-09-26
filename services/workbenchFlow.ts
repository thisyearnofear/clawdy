import type { ArenaPhase } from './arenaProtocol'
import type { CoursePlayMode } from './arenaCourse'

export type NextStepAction =
  | 'retry'
  | 'play'
  | 'review'
  | 'review-coach'
  | 'teach'
  | 'coach'
  | 'train'
  | null

export interface NextStepInput {
  visualReady: boolean
  phase: ArenaPhase
  playMode: CoursePlayMode
  coachingLocked: boolean
  studioOpen: boolean
  approvedCount: number
}

/**
 * The workbench guidance state machine — pure data in, pure data out so the
 * branch order stays unit-testable and the render path never holds closures
 * that touch refs. ArenaScene maps the returned action key back onto its own
 * handlers in the click path.
 */
export function computeNextStep(state: NextStepInput): { label: string; run: NextStepAction } {
  const { visualReady, phase, playMode, coachingLocked, studioOpen, approvedCount } = state
  if (!visualReady) return { label: 'Settling the world…', run: null }
  if (phase === 'error') return { label: 'Reload the world', run: 'retry' }
  if (phase === 'ready' && playMode === 'compete') {
    return { label: 'Press Play — Match (coaching locked)', run: 'play' }
  }
  if (phase === 'ready') return { label: 'Press Play to start Practice', run: 'play' }
  if (phase === 'running') return { label: 'Watch the race — Pause anytime', run: null }
  if (phase === 'paused') return { label: 'Resume, or open Replay', run: 'review' }
  if (phase === 'finished' && !coachingLocked) {
    return { label: 'Open Replay, then Coach the miss', run: 'review-coach' }
  }
  if (phase === 'finished' && coachingLocked) {
    return { label: 'Reset, then switch to Practice to teach', run: 'teach' }
  }
  if (phase === 'review' && !studioOpen && !coachingLocked) {
    return { label: 'Open Coach and pick a focus', run: 'coach' }
  }
  if (studioOpen && !coachingLocked && approvedCount === 0) {
    return { label: 'Pick a focus chip and Approve a fix', run: null }
  }
  if (studioOpen && !coachingLocked && approvedCount > 0) {
    return { label: `Train from ${approvedCount} approved note${approvedCount === 1 ? '' : 's'}`, run: 'train' }
  }
  return { label: 'Play → Replay → Coach → Train → Match', run: null }
}
