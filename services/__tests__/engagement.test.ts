import { describe, expect, it } from 'vitest'
import { engagementView, heroLedeMode } from '../engagement'

describe('engagementView', () => {
  it('strips a first visit down to one job and one button', () => {
    const view = engagementView({ hasCompletedRun: false, hasOwnBrain: false })
    expect(view.stage).toBe('first-visit')
    expect(view.showBroadcastCta).toBe(false)
    expect(view.showBroadcastPanel).toBe(false)
    expect(view.showRulesDetail).toBe(false)
    expect(view.showTournament).toBe(false)
    expect(view.showAgentDetail).toBe(false)
    expect(view.showCameraSwitcher).toBe(false)
    // The hero must name exactly one action on a first visit.
    expect(heroLedeMode(view)).toBe('loop-only')
  })

  it('reveals the camera switcher and rules after the first run', () => {
    const view = engagementView({ hasCompletedRun: true, hasOwnBrain: false })
    expect(view.stage).toBe('played')
    expect(view.showCameraSwitcher).toBe(true)
    expect(view.showRulesDetail).toBe(true)
    expect(view.showBroadcastCta).toBe(true)
    // Still held back: these are rewards for investing, not onboarding.
    expect(view.showTournament).toBe(false)
    expect(view.showBroadcastPanel).toBe(false)
  })

  it('unlocks the full surface once the player owns a brain', () => {
    const view = engagementView({ hasCompletedRun: true, hasOwnBrain: true })
    expect(view.stage).toBe('trained')
    expect(view.showTournament).toBe(true)
    expect(view.showBroadcastPanel).toBe(true)
    expect(view.showAgentDetail).toBe(true)
  })

  it('treats owning a brain as sufficient even without a completed run', () => {
    // Someone who imports a checkpoint before their first round still owns a
    // brain; the earned surface must not depend on run order.
    expect(engagementView({ hasCompletedRun: false, hasOwnBrain: true }).stage).toBe('trained')
  })

  it('never regresses a returning player who has already trained', () => {
    const trained = engagementView({ hasCompletedRun: true, hasOwnBrain: true })
    // A later session that has not yet completed a fresh run must keep the
    // earned surface rather than snapping back to first-visit.
    expect(engagementView({ hasCompletedRun: false, hasOwnBrain: true })).toEqual(trained)
  })

  it('never shows the hero progress rail at any stage', () => {
    // The next-step bar always names the single next action; the rail
    // restated it and is redundant at every depth.
    for (const input of [
      { hasCompletedRun: false, hasOwnBrain: false },
      { hasCompletedRun: true, hasOwnBrain: false },
      { hasCompletedRun: true, hasOwnBrain: true },
    ]) {
      expect(engagementView(input).showProgressRail).toBe(false)
    }
  })

  it('shows the Play hint only before the player has run a round', () => {
    // The overlay repeats the lede and the next-step bar; after a round the
    // player knows to press Play and the repetition is noise.
    expect(engagementView({ hasCompletedRun: false, hasOwnBrain: false }).showPlayHint).toBe(true)
    expect(engagementView({ hasCompletedRun: true, hasOwnBrain: false }).showPlayHint).toBe(false)
  })

  it('names the broadcast in the lede only once it is relevant', () => {
    expect(heroLedeMode(engagementView({ hasCompletedRun: false, hasOwnBrain: false }))).toBe('loop-only')
    expect(heroLedeMode(engagementView({ hasCompletedRun: true, hasOwnBrain: false }))).toBe('with-broadcast')
  })
})