import { beforeEach, describe, expect, it } from 'vitest'
import {
  RETURN_VISIT_GAP_MS,
  loadEngagementProgress,
  returnVisitGapHours,
  saveEngagementProgress,
} from '../engagementProgress'

describe('engagementProgress', () => {
  const store = new Map<string, string>()
  const mockLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  }

  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: mockLocalStorage },
      writable: true,
      configurable: true,
    })
  })

  it('round-trips lastVisitAt alongside the disclosure flags', () => {
    saveEngagementProgress({ hasCompletedRun: true, hasSeenRules: true, lastVisitAt: 1_700_000_000_000 })
    const loaded = loadEngagementProgress()
    expect(loaded.hasCompletedRun).toBe(true)
    expect(loaded.hasSeenRules).toBe(true)
    expect(loaded.lastVisitAt).toBe(1_700_000_000_000)
  })

  it('treats records written before the stamp existed as no-stamp', () => {
    saveEngagementProgress({ hasCompletedRun: true, hasSeenRules: false })
    expect(loadEngagementProgress().lastVisitAt).toBeUndefined()
  })
})

describe('returnVisitGapHours', () => {
  const now = 1_700_000_000_000

  it('returns null for a first boot or an unstamped record', () => {
    expect(returnVisitGapHours(undefined, now)).toBeNull()
    expect(returnVisitGapHours(Number.NaN, now)).toBeNull()
  })

  it('returns null inside the gap window so same-day reloads stay silent', () => {
    expect(returnVisitGapHours(now - 60_000, now)).toBeNull()
    expect(returnVisitGapHours(now - RETURN_VISIT_GAP_MS + 1, now)).toBeNull()
  })

  it('counts a return once the gap crosses the threshold, in whole hours', () => {
    expect(returnVisitGapHours(now - RETURN_VISIT_GAP_MS, now)).toBe(20)
    expect(returnVisitGapHours(now - 26 * 3_600_000, now)).toBe(26)
  })
})
