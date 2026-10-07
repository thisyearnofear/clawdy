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
  | 'skip-skirmish'
  | null

export interface NextStepInput {
  visualReady: boolean
  phase: ArenaPhase
  playMode: CoursePlayMode | 'rush'
  coachingLocked: boolean
  studioOpen: boolean
  approvedCount: number
  /**
   * A trained-vs-parent comparison is loaded and not yet watched. This is the
   * single most valuable moment in the product — it is where "my teaching
   * changed its behaviour" becomes visible — so it outranks every other prompt.
   */
  hasUnwatchedComparison?: boolean
  /**
   * Arena-first: when true on a ready Training Grounds session, the next-step
   * bar offers Skip-to-Skirmish ahead of the Practice curriculum.
   */
  canSkipToSkirmish?: boolean
  /** Current ruleset — Skirmish sessions keep the clash-first ready label. */
  rulesetId?: 'skirmish'
  /** Soften Tutor rail copy for early sessions (Clash before Coach→Train→Match). */
  engagementStage?: 'first-visit' | 'played' | 'trained'
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
  // Watching the lesson is the payoff, so it wins over every other prompt
  // whenever a comparison is waiting — including over "Play again", which is
  // what the guidance machine would otherwise suggest after a round.
  if (state.hasUnwatchedComparison) {
    return { label: 'Watch the lesson — see what your teaching changed', run: 'watch-lesson' }
  }
  // Arena-first: before the Practice curriculum, offer Clash (Skirmish) as the
  // primary CTA when the player can still skip. Tutor/Practice stay reachable.
  if (
    phase === 'ready'
    && state.canSkipToSkirmish
    && state.rulesetId !== 'skirmish'
    && playMode !== 'compete'
    && playMode !== 'rush'
  ) {
    return { label: 'Skip to Skirmish — clash first', run: 'skip-skirmish' }
  }
  if (phase === 'ready' && playMode === 'compete') {
    return { label: 'Press Play — Match (coaching locked)', run: 'play' }
  }
  if (phase === 'ready' && (playMode === 'rush' || state.rulesetId === 'skirmish')) {
    return { label: 'Press Play to start Skirmish', run: 'play' }
  }
  if (phase === 'ready') return { label: 'Press Play to start Practice', run: 'play' }
  if (phase === 'running') return { label: 'Watch the race — Pause anytime', run: null }
  if (phase === 'paused') return { label: 'Resume, or open Replay', run: 'review' }
  if (phase === 'finished' && !coachingLocked) {
    // Early sessions: Clash stays ahead of the Tutor depth path.
    if (state.engagementStage === 'first-visit' || state.engagementStage === 'played') {
      return { label: 'Clash again, or open Replay to coach', run: 'play' }
    }
    return { label: 'Open Replay, then Coach the miss', run: 'review-coach' }
  }
  if (phase === 'finished' && coachingLocked) {
    return { label: 'Reset, then switch to Practice to teach', run: 'teach' }
  }
  if (phase === 'review' && !studioOpen && !coachingLocked) {
    return { label: 'Open Lessons and pick a focus', run: 'coach' }
  }
  if (studioOpen && !coachingLocked && approvedCount === 0) {
    return { label: 'Pick a focus chip and Approve a fix', run: null }
  }
  if (studioOpen && !coachingLocked && approvedCount > 0) {
    return { label: `Train from ${approvedCount} approved note${approvedCount === 1 ? '' : 's'}`, run: 'train' }
  }
  // Softened rail: Clash before the Tutor depth chain.
  return { label: 'Clash → Coach → Train → Match', run: null }
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
