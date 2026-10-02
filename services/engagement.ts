/**
 * Engagement depth — how much of the workbench a player should be shown.
 *
 * Playtest feedback was that the landing view carries so many small details
 * that people struggle to parse them. The cause is not that any single detail
 * is wrong; it is that ~13 instructional surfaces render at once, at every
 * stage, with no hierarchy. The fix is progressive disclosure: a first-time
 * visitor sees one job and one button, and each new thing appears only once
 * it has become relevant.
 *
 * This module is the pure decision layer for that. It never reads storage or
 * refs; the caller passes current signals and maps the result onto render
 * flags. Stages only ever move forward — a returning player must never lose
 * access to something they have already unlocked.
 */

export type EngagementStage = 'first-visit' | 'played' | 'trained'

export interface EngagementInput {
  /** The player has completed (or is past) a run in this browser. */
  hasCompletedRun: boolean
  /** The player owns at least one brain they trained or imported. */
  hasOwnBrain: boolean
}

export interface EngagementView {
  stage: EngagementStage
  /**
   * Show the "Watch it broadcast live" CTA. The sponsor surface is a
   * curiosity, not an entry point — on a first visit it competes with the
   * only button that matters.
   */
  showBroadcastCta: boolean
  /** Show the full broadcast panel instead of the collapsed "Go live" row. */
  showBroadcastPanel: boolean
  /** Show the rules paragraph, not just the one-line summary and legend. */
  showRulesDetail: boolean
  /** Show the tournament section at all. */
  showTournament: boolean
  /** Show full agent cards rather than a collapsed name + score. */
  showAgentDetail: boolean
  /** Show the Camera / Follow you / Follow rival switcher. */
  showCameraSwitcher: boolean
  /**
   * Show the run utilities (Reset, Replay, Record, Sound). They are inert
   * before a first round — Replay is disabled, Reset has nothing to reset —
   * and four greyed-out buttons next to Play read as a broken control bar.
   */
  showRunControls: boolean
  /**
   * The Play hint overlay ("Press Play. Follow your champion…") restates the
   * lede and the next-step bar verbatim. Once the player has run a round they
   * know to press Play, so the overlay is noise from then on.
   */
  showPlayHint: boolean
  /**
   * The Play/Replay/Coach rail beside the hero is never shown: the next-step
   * bar already names the single next action at all times, and the rail
   * restated it. Kept as an explicit false so the reason is recorded here
   * rather than living as a mystery `display: none` in the stylesheet.
   */
  showProgressRail: false
}

const FIRST_VISIT: EngagementView = {
  stage: 'first-visit',
  showBroadcastCta: false,
  showBroadcastPanel: false,
  showRulesDetail: false,
  showTournament: false,
  showAgentDetail: false,
  showCameraSwitcher: false,
  showRunControls: false,
  showPlayHint: true,
  showProgressRail: false,
}

const AFTER_PLAY: EngagementView = {
  ...FIRST_VISIT,
  stage: 'played',
  showBroadcastCta: true,
  showCameraSwitcher: true,
  showRulesDetail: true,
  showRunControls: true,
  showPlayHint: false,
}

const AFTER_TRAIN: EngagementView = {
  ...AFTER_PLAY,
  stage: 'trained',
  showBroadcastPanel: true,
  showTournament: true,
  showAgentDetail: true,
}

/**
 * Resolve the view for the current signals. Monotonic by construction: the
 * returned stage is the furthest one earned so far, so returning to the page
 * mid-session can never regress a player who has already trained.
 */
export function engagementView(input: EngagementInput): EngagementView {
  if (input.hasOwnBrain) return AFTER_TRAIN
  if (input.hasCompletedRun) return AFTER_PLAY
  return FIRST_VISIT
}

/**
 * Whether the hero lede should name the sponsor broadcast. On a first visit
 * it names exactly one action.
 */
export function heroLedeMode(view: EngagementView): 'loop-only' | 'with-broadcast' {
  return view.showBroadcastCta ? 'with-broadcast' : 'loop-only'
}