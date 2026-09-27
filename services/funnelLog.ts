/**
 * services/funnelLog.ts — local funnel instrumentation.
 *
 * Append-only ring buffer of disclosure-ladder events, persisted to
 * localStorage so a session survives refresh. Nothing leaves the device —
 * this answers "does the nudge ladder convert?" during dogfooding without
 * a telemetry surface. Read it back via `formatFunnelLog` (Help drawer's
 * copy-debug-log button) or the browser console.
 *
 * Tap sites live at the existing handlers in ArenaScene; keep events
 * sparse (one per user-visible moment, not per tick).
 */
export interface FunnelEvent {
  /** Epoch ms. */
  at: number
  /** Dotted event name, e.g. 'mistake.shown'. */
  event: string
  /** Short context — 'movement-blocked', 'banked=6 winner=rival'. */
  detail?: string
}

const FUNNEL_KEY = 'clawdy_funnel_v1'
const MAX_EVENTS = 400

function funnelStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    const alt = (globalThis as unknown as { localStorage?: Storage }).localStorage
    if (alt) return alt
  } catch { /* sandboxed iframe — storage may throw */ }
  return null
}

export function getFunnelEvents(): FunnelEvent[] {
  const storage = funnelStorage()
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(FUNNEL_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(e => e && typeof e.at === 'number' && typeof e.event === 'string')
  } catch {
    return []
  }
}

export function recordFunnelEvent(event: string, detail?: string): void {
  const storage = funnelStorage()
  if (!storage) return
  try {
    const events = [...getFunnelEvents(), { at: Date.now(), event, detail }].slice(-MAX_EVENTS)
    storage.setItem(FUNNEL_KEY, JSON.stringify(events))
  } catch { /* storage full or locked — funnel is best-effort */ }
}

export function clearFunnelLog(): void {
  try { funnelStorage()?.removeItem(FUNNEL_KEY) } catch { /* ignore */ }
}

/** Human-readable dump for clipboard sharing / dogfooding notes. */
export function formatFunnelLog(events: readonly FunnelEvent[] = getFunnelEvents()): string {
  return events
    .map(e => `${new Date(e.at).toISOString().slice(11, 19)} ${e.event}${e.detail ? ` — ${e.detail}` : ''}`)
    .join('\n')
}
