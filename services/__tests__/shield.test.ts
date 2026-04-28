import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Shield logic tests — pure unit tests for the Force Field mechanic.
 * We test the logic directly without importing React components.
 */

interface MockSession {
  shieldUntil?: number
  airBubbleUntil?: number
  airBubbleCount?: number
}

// Replicate the shield check logic from Experience.tsx handleDespawn
function shouldBlockDestroy(session: MockSession | null | undefined, now: number): boolean {
  return Boolean(session?.shieldUntil && session.shieldUntil > now)
}

// Replicate the free air bubble grant logic from useCombatEvents
function grantFreeAirBubble(session: MockSession, now: number): MockSession {
  return {
    ...session,
    airBubbleUntil: now + 8_000,
    airBubbleCount: (session.airBubbleCount ?? 0) + 1,
  }
}

// Replicate the shield asset collect logic
function grantForceField(session: MockSession, now: number): MockSession {
  return { ...session, shieldUntil: now + 15_000 }
}

describe('Shield / Force Field logic', () => {
  const NOW = 1_000_000

  // ── shouldBlockDestroy ────────────────────────────────────────────────────

  it('blocks destroy when shield is active', () => {
    const session: MockSession = { shieldUntil: NOW + 5_000 }
    expect(shouldBlockDestroy(session, NOW)).toBe(true)
  })

  it('does not block destroy when shield has expired', () => {
    const session: MockSession = { shieldUntil: NOW - 1 }
    expect(shouldBlockDestroy(session, NOW)).toBe(false)
  })

  it('does not block destroy when no shield set', () => {
    const session: MockSession = {}
    expect(shouldBlockDestroy(session, NOW)).toBe(false)
  })

  it('does not block destroy when session is null', () => {
    expect(shouldBlockDestroy(null, NOW)).toBe(false)
  })

  it('does not block destroy when session is undefined', () => {
    expect(shouldBlockDestroy(undefined, NOW)).toBe(false)
  })

  it('blocks destroy exactly at shieldUntil boundary (exclusive)', () => {
    const session: MockSession = { shieldUntil: NOW }
    // shieldUntil === now → NOT active (> not >=)
    expect(shouldBlockDestroy(session, NOW)).toBe(false)
  })

  it('blocks destroy 1ms before expiry', () => {
    const session: MockSession = { shieldUntil: NOW + 1 }
    expect(shouldBlockDestroy(session, NOW)).toBe(true)
  })

  // ── grantForceField ───────────────────────────────────────────────────────

  it('sets shieldUntil 15s in the future', () => {
    const session: MockSession = {}
    const updated = grantForceField(session, NOW)
    expect(updated.shieldUntil).toBe(NOW + 15_000)
  })

  it('overwrites an existing shorter shield', () => {
    const session: MockSession = { shieldUntil: NOW + 1_000 }
    const updated = grantForceField(session, NOW)
    expect(updated.shieldUntil).toBe(NOW + 15_000)
  })

  // ── grantFreeAirBubble ────────────────────────────────────────────────────

  it('sets airBubbleUntil 8s in the future', () => {
    const session: MockSession = {}
    const updated = grantFreeAirBubble(session, NOW)
    expect(updated.airBubbleUntil).toBe(NOW + 8_000)
  })

  it('increments airBubbleCount from 0', () => {
    const session: MockSession = {}
    const updated = grantFreeAirBubble(session, NOW)
    expect(updated.airBubbleCount).toBe(1)
  })

  it('increments airBubbleCount from existing value', () => {
    const session: MockSession = { airBubbleCount: 3 }
    const updated = grantFreeAirBubble(session, NOW)
    expect(updated.airBubbleCount).toBe(4)
  })

  it('does not mutate the original session', () => {
    const session: MockSession = { airBubbleCount: 1 }
    grantFreeAirBubble(session, NOW)
    expect(session.airBubbleCount).toBe(1) // unchanged
  })
})
