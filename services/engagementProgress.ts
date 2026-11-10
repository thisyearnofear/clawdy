/**
 * Persistent engagement progress.
 *
 * The disclosure model in `engagement.ts` decides how much of the workbench to
 * show, but it needs two signals that must survive a reload — "has this player
 * finished a run" and "have they seen the rules once". Without persistence a
 * returning player would be re-shown the stripped-down first-visit view, which
 * is worse than never hiding anything at all.
 *
 * Deliberately localStorage (durable, not synced): a shared browser unlocking
 * the advanced surface is a harmless outcome, and keeping it out of the Convex
 * payload avoids growing the sync schema for a cosmetic preference.
 */

const PROGRESS_STORAGE_KEY = 'clawdy_progress_v1'

export interface EngagementProgress {
  hasCompletedRun: boolean
  hasSeenRules: boolean
  /**
   * Last boot stamp (epoch ms). Optional: records written before the return
   * funnel existed simply lack it, which `returnVisitGapHours` treats as
   * "not a return" — we can't claim a day-2 read on a visit we never stamped.
   */
  lastVisitAt?: number
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    // Storage access can throw in sandboxed iframes; treat as absent.
  }
  return null
}

export function loadEngagementProgress(): EngagementProgress {
  const storage = getLocalStorage()
  if (!storage) return { hasCompletedRun: false, hasSeenRules: false }
  try {
    const raw = storage.getItem(PROGRESS_STORAGE_KEY)
    if (!raw) return { hasCompletedRun: false, hasSeenRules: false }
    const parsed = JSON.parse(raw) as Partial<EngagementProgress>
    return {
      hasCompletedRun: parsed.hasCompletedRun === true,
      hasSeenRules: parsed.hasSeenRules === true,
      lastVisitAt: typeof parsed.lastVisitAt === 'number' && Number.isFinite(parsed.lastVisitAt) ? parsed.lastVisitAt : undefined,
    }
  } catch {
    return { hasCompletedRun: false, hasSeenRules: false }
  }
}

export function saveEngagementProgress(progress: EngagementProgress): void {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Non-fatal: the view degrades to first-visit disclosure next session.
  }
}

/**
 * A return visit is a new boot at least ~a day after the last stamped one —
 * the smallest honest read on "did anyone come back" the funnel can give
 * without accounts. Same-day reloads and first boots return null; the funnel
 * event only fires when the player already completed a run (the caller checks
 * `hasCompletedRun`) so a bounce never counts as retention.
 */
export const RETURN_VISIT_GAP_MS = 20 * 60 * 60 * 1000

export function returnVisitGapHours(lastVisitAt: number | undefined, now: number): number | null {
  if (lastVisitAt === undefined || !Number.isFinite(lastVisitAt)) return null
  const gap = now - lastVisitAt
  if (gap < RETURN_VISIT_GAP_MS) return null
  return Math.round(gap / 3_600_000)
}