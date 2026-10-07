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
  | 'watch-lesson'
  | null

export interface NextStepInput {
  visualReady: boolean
  phase: ArenaPhase
  playMode: CoursePlayMode | 'rush'
  coachingLocked: boolean
  studioOpen: boolean
  approvedCount: number
  /**
   * A trained-vs-parent comparison is loaded and not yet watched. Available as
   * an optional CTA ("See what changed") — it must not force another watch as
   * the only next-step; Play / Clash again stay the primary action.
   */
  hasUnwatchedComparison?: boolean
}

export interface NextStepResult {
  label: string
  run: NextStepAction
  /** Clear optional CTA when a comparison is waiting; never the sole next-step. */
  optionalCompare?: { label: string; run: 'watch-lesson' }
}

/**
 * The workbench guidance state machine — pure data in, pure data out so the
 * branch order stays unit-testable and the render path never holds closures
 * that touch refs. ArenaScene maps the returned action key back onto its own
 * handlers in the click path.
 */
export function computeNextStep(state: NextStepInput): NextStepResult {
  const { visualReady, phase, playMode, coachingLocked, studioOpen, approvedCount } = state
  if (!visualReady) return { label: 'Settling the world…', run: null }
  if (phase === 'error') return { label: 'Reload the world', run: 'retry' }

  const optionalCompare = state.hasUnwatchedComparison
    ? { label: 'See what changed', run: 'watch-lesson' as const }
    : undefined

  const withOptional = (step: { label: string; run: NextStepAction }): NextStepResult => (
    optionalCompare ? { ...step, optionalCompare } : step
  )

  if (phase === 'ready' && playMode === 'compete') {
    return withOptional({ label: 'Press Play — Match (coaching locked)', run: 'play' })
  }
  if (phase === 'ready' && playMode === 'rush') {
    return withOptional({ label: 'Press Play to start Rush (unranked)', run: 'play' })
  }
  if (phase === 'ready') {
    return withOptional({ label: 'Press Play to start Practice', run: 'play' })
  }
  if (phase === 'running') {
    return withOptional({ label: 'Watch the race — Pause anytime', run: null })
  }
  if (phase === 'paused') {
    return withOptional({ label: 'Resume, or open Replay', run: 'review' })
  }
  if (phase === 'finished' && !coachingLocked) {
    return withOptional({ label: 'Open Replay, then Coach the miss', run: 'review-coach' })
  }
  if (phase === 'finished' && coachingLocked) {
    return withOptional({ label: 'Reset, then switch to Practice to teach', run: 'teach' })
  }
  if (phase === 'review' && !studioOpen && !coachingLocked) {
    return withOptional({ label: 'Open Lessons and pick a focus', run: 'coach' })
  }
  if (studioOpen && !coachingLocked && approvedCount === 0) {
    return withOptional({ label: 'Pick a focus chip and Approve a fix', run: null })
  }
  if (studioOpen && !coachingLocked && approvedCount > 0) {
    return withOptional({
      label: `Train from ${approvedCount} approved note${approvedCount === 1 ? '' : 's'}`,
      run: 'train',
    })
  }
  return withOptional({ label: 'Play → Replay → Coach → Train → Match', run: null })
}

export interface MistakeSignal {
  headline: string
  detail: string
}

/**
 * The first-mistake trigger's pure predicate: given the champion's live
 * snapshot fields, decide whether this tick surfaces a visible, coachable
 * error worth interrupting for. Three signals, first match wins:
 *
 * - a rescue (recoveries ticked up) — the rover visibly teleported home;
 * - a rejection committed since the caller last observed (`sinceTick`) that
 *   ISN'T 'in-transit' — in-transit rejections are decision-cadence noise
 *   the player never sees. Fast-forward publishes several sim ticks at
 *   once, so freshness is a window, not same-tick equality;
 * - in transit on a floodable edge while flooded — the thematic crawl.
 *
 * The caller owns the prevRecoveries cursor (pass the prior tick's count),
 * the sinceTick cursor (the previous observed tick), and the
 * once-per-session marker.
 */
export function detectMistakeSignal(input: {
  tick: number
  flooded: boolean
  recoveries: number
  prevRecoveries: number
  lastOutcome: { tick: number; accepted: boolean; reason?: string | null } | null
  transitEdgeId: string | null
  floodableEdgeIds: ReadonlySet<string>
  sinceTick?: number
}): MistakeSignal | null {
  const { tick, flooded, recoveries, prevRecoveries, lastOutcome, transitEdgeId, floodableEdgeIds } = input
  const sinceTick = input.sinceTick ?? tick - 1
  if (recoveries > prevRecoveries) {
    return {
      headline: 'Your champion got pinned and needed a rescue',
      detail: 'A stuck rover can be taught better routes — coach the decision that led there.',
    }
  }
  if (lastOutcome && !lastOutcome.accepted && lastOutcome.tick > sinceTick && lastOutcome.tick <= tick && lastOutcome.reason !== 'in-transit') {
    return {
      headline: `Your champion's call was rejected (${lastOutcome.reason?.replaceAll('-', ' ') ?? 'invalid'})`,
      detail: 'A rejected decision is a coachable decision.',
    }
  }
  if (flooded && transitEdgeId && floodableEdgeIds.has(transitEdgeId)) {
    return {
      headline: 'Your champion is crawling through the flood',
      detail: 'Ridge routes stay fast — you can teach that preference.',
    }
  }
  return null
}
