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