const GUEST_KEY = 'clawdy_guest_v1'

/** Stable browser guest id for Season 0 Convex sync (pre-auth). */
export function getOrCreateGuestKey(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    const existing = window.localStorage.getItem(GUEST_KEY)
    if (existing && existing.length >= 8) return existing
    const created =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `guest-${crypto.randomUUID()}`
        : `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    window.localStorage.setItem(GUEST_KEY, created)
    return created
  } catch {
    return `guest-ephemeral-${Date.now().toString(36)}`
  }
}

export function shortGuestLabel(guestKey: string): string {
  const bare = guestKey.replace(/^guest-/, '')
  return bare.slice(0, 8)
}
