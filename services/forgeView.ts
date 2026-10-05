import { ConvexError } from 'convex/values'
import { FORGE_MESSAGES, type ForgeErrorCode } from './forge'

/**
 * What the Forge panel shows and which forged rover is the champion's look.
 * Pure, so it is unit-tested without React or Convex. Limits are enforced by
 * the server (`convex/forge.ts`); the client only avoids obviously doomed
 * requests and shows the server's message when one is refused.
 */
export interface ForgeRow {
  id: string
  chassis: string
  paint: string
  status: 'pending' | 'ready' | 'failed'
  createdAt: number
  url: string | null
  error: string | null
}

export interface ForgedLook {
  forgeId: string
  chassis: string
  url: string
}

/** localStorage key holding the player's look choice. Absent or 'auto' means the newest ready forge. */
export const FORGED_LOOK_KEY = 'clawdy.forgedLook'
export const STANDARD_LOOK = 'standard'

export function parseLookChoice(raw: string | null | undefined): string {
  if (!raw) return 'auto'
  const value = raw.trim()
  return value.length > 0 && value.length <= 64 ? value : 'auto'
}

function newestFirst(rows: readonly ForgeRow[]): ForgeRow[] {
  return [...rows].sort((a, b) => b.createdAt - a.createdAt)
}

export function readyForges(rows: readonly ForgeRow[]): ForgeRow[] {
  return newestFirst(rows).filter(row => row.status === 'ready' && row.url)
}

export function pendingForge(rows: readonly ForgeRow[]): ForgeRow | undefined {
  return rows.find(row => row.status === 'pending')
}

/** The newest failure, only while it is newer than the newest success, so old errors do not nag. */
export function latestFailure(rows: readonly ForgeRow[]): ForgeRow | undefined {
  const sorted = newestFirst(rows)
  const failure = sorted.find(row => row.status === 'failed')
  if (!failure) return undefined
  const ready = sorted.find(row => row.status === 'ready')
  return ready && ready.createdAt > failure.createdAt ? undefined : failure
}

/**
 * Resolve the champion's look. 'standard' shows the normal rover, an id picks that
 * forge if it is still ready, and anything else (including a stale id) falls back
 * to the newest ready forge so a forge result is shown without extra clicks.
 */
export function pickForgedLook(rows: readonly ForgeRow[], choice: string): ForgedLook | null {
  if (choice === STANDARD_LOOK) return null
  const ready = readyForges(rows)
  const chosen = choice === 'auto' ? undefined : ready.find(row => row.id === choice)
  const row = chosen ?? ready[0]
  return row?.url ? { forgeId: row.id, chassis: row.chassis, url: row.url } : null
}

export interface ForgeFormState {
  canForge: boolean
  /** Shown beside the disabled button. */
  reason: string | null
}

export function forgeFormState(input: { signedIn: boolean; rows: readonly ForgeRow[]; submitting: boolean }): ForgeFormState {
  if (!input.signedIn) return { canForge: false, reason: FORGE_MESSAGES['sign-in-required'] }
  if (input.submitting || pendingForge(input.rows)) return { canForge: false, reason: FORGE_MESSAGES['forge-busy'] }
  return { canForge: true, reason: null }
}

/** Turn a rejected `forge.start` into the message the player sees. */
export function describeForgeError(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === 'string' && error.data in FORGE_MESSAGES) {
    return FORGE_MESSAGES[error.data as ForgeErrorCode]
  }
  return 'The forge request failed. Check your connection and try again.'
}
