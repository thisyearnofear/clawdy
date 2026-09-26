
/**
 * Guest keys are browser-minted (`guest-<uuid>`, see services/guestIdentity.ts)
 * or the SSR/ephemeral fallbacks. Shape-validated only — Season 0's trust
 * model is an exhibition guest key; `resolveOwner` is the single seam where a
 * Convex Auth swap produces `user:<id>` owners instead.
 */
export const GUEST_KEY_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/

export function resolveOwner(guestKey: string): string {
  if (!GUEST_KEY_PATTERN.test(guestKey)) {
    throw new Error('invalid guest key')
  }
  return `guest:${guestKey}`
}
