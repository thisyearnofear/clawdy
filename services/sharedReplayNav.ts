/**
 * In-app navigation for league replay share links.
 *
 * `?replay=<shareId>` boots a shared match on cold load. Same-tab clicks from
 * the ladder drawer must not rely on a remount (Next soft-nav keeps ArenaScene
 * mounted), so those clicks dispatch OPEN_REPLAY_EVENT and ArenaScene loads
 * the recording the same way the boot path does.
 */

export const OPEN_REPLAY_EVENT = 'clawdy:open-replay'

export function replayShareHref(
  shareId: string,
  origin: string = typeof window !== 'undefined' ? window.location.origin : '',
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '/',
): string {
  return `${origin}${pathname}?replay=${encodeURIComponent(shareId)}`
}

export function requestOpenReplay(shareId: string): void {
  if (typeof window === 'undefined' || !shareId) return
  window.dispatchEvent(new CustomEvent(OPEN_REPLAY_EVENT, { detail: { shareId } }))
}

export function subscribeOpenReplay(listener: (shareId: string) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    const shareId = (event as CustomEvent<{ shareId?: string }>).detail?.shareId
    if (typeof shareId === 'string' && shareId.length > 0) listener(shareId)
  }
  window.addEventListener(OPEN_REPLAY_EVENT, handler)
  return () => window.removeEventListener(OPEN_REPLAY_EVENT, handler)
}

/** Training Grounds is stored as an absent rulesetId; match with === so both sides stay undefined. */
export function brainMatchesRuleset(
  brainRulesetId: string | undefined,
  selectedRulesetId: string | undefined,
): boolean {
  return brainRulesetId === selectedRulesetId
}
