import { getAuthUserId } from '@convex-dev/auth/server'
import type { Auth } from 'convex/server'

/**
 * Two kinds of owner share the same `guestKey` column and indexes:
 *
 *  - guests: browser-minted keys (`guest-<uuid>`, services/guestIdentity.ts) or
 *    the SSR/ephemeral fallbacks. Shape-validated only, an exhibition trust
 *    model: whoever holds the key owns the rows.
 *  - signed-in users: the key is derived on the server from the verified
 *    identity (`user-<convex user id>`), never taken from the client. A guest
 *    caller may not present a `user-` key, so account data cannot be reached or
 *    forged by guessing keys.
 *
 * Every public function passes its client args through `withCaller` first, so
 * a signed-in caller's `guestKey` argument is ignored entirely.
 */
export const GUEST_KEY_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/
export const USER_KEY_PREFIX = 'user-'

export function resolveOwner(guestKey: string): string {
  if (!GUEST_KEY_PATTERN.test(guestKey)) {
    throw new Error('invalid guest key')
  }
  if (guestKey.startsWith(USER_KEY_PREFIX)) return `user:${guestKey.slice(USER_KEY_PREFIX.length)}`
  return `guest:${guestKey}`
}

export function userKey(userId: string): string {
  return `${USER_KEY_PREFIX}${userId}`
}

/** The row key and owner this call may touch. */
export async function resolveCaller(ctx: { auth: Auth }, guestKey: string): Promise<{ key: string; owner: string; userId: string | null }> {
  const userId = await getAuthUserId(ctx)
  if (userId) {
    const key = userKey(userId)
    return { key, owner: resolveOwner(key), userId }
  }
  if (guestKey.startsWith(USER_KEY_PREFIX)) throw new Error('invalid guest key')
  return { key: guestKey, owner: resolveOwner(guestKey), userId: null }
}

export async function withCaller<Args extends { guestKey: string }>(ctx: { auth: Auth }, args: Args): Promise<Args> {
  const caller = await resolveCaller(ctx, args.guestKey)
  return { ...args, guestKey: caller.key }
}
