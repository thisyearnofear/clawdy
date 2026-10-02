/**
 * What the Coach panel should be showing, right now.
 *
 * The panel had grown four stacked sections — approve queue, status card,
 * keyword guidance with 2 sub-sections, and a storage drawer — all expanded
 * at once. Only the approve queue is the player's actual job. Everything else
 * was either a fallback path for having no examples, or a power-user drawer.
 *
 * The rule this encodes: **lead with the queue, reveal the rest only when it
 * has something to offer.** With no examples the guidance block is not a
 * footnote, it is the only way forward, so it opens. With examples queued, the
 * queue is the job and guidance collapses to a one-line escape hatch.
 *
 * Pure, like `engagement.ts` and `workbenchFlow.ts`, so the ordering is
 * unit-testable rather than discovered by reading JSX.
 */

export interface CoachPanelView {
  /** Render the approve queue and Train as the panel's primary job. */
  showQueue: boolean
  /** Open the keyword-guidance section rather than leaving it collapsed. */
  guidanceOpen: boolean
  /** Show the one-line "need a lesson?" escape hatch above the queue. */
  showGuidanceHint: boolean
  /** Fold sync state into a single quiet line rather than a banner. */
  syncIsQuiet: boolean
}

export interface CoachPanelInput {
  exampleCount: number
  approvedCount: number
  /** Coaching is off (scored match) — the panel is read-only guidance. */
  coachingLocked: boolean
  /** A sync problem exists and should still be surfaced, but calmly. */
  syncHasProblem: boolean
}

export function coachPanelView(input: CoachPanelInput): CoachPanelView {
  const { exampleCount, coachingLocked, syncHasProblem } = input
  const queueHasWork = exampleCount > 0
  return {
    // The queue always renders: approving is the job, even when it is empty,
    // because the empty state is where the player learns how to start.
    showQueue: true,
    // Nothing to approve yet means guidance is not a secondary affordance, it
    // is the only path. With a queue in front of the player it steps back.
    guidanceOpen: !queueHasWork,
    showGuidanceHint: queueHasWork && !coachingLocked,
    // Sync trouble is real and must not be hidden, but it is not the player's
    // mistake and must not outrank the Approve/Train buttons above it.
    syncIsQuiet: !syncHasProblem || queueHasWork,
  }
}

/**
 * The one-line hint shown above a non-empty queue, pointing at the two ways a
 * player can add a lesson. Deliberately names both paths — mid-race route call
 * and Replay correction — because neither is discoverable on its own.
 */
export const COACH_GUIDANCE_HINT =
  'Need another lesson? Call a route mid-race, or open Replay and prefer a different one.'