import type { StealStoryboard } from './stealHighlight'

/**
 * Clip resolution for the steal-highlight MVP.
 *
 * Default path is a stub/placeholder that works with zero credentials.
 * When FAL_KEY is present on the server, POST /api/steal-highlight may return
 * a generated clip URL — the client must treat that as optional and never
 * block the match (docs/SCENES.md: generation off the critical path).
 */

export type StealClipMode = 'stub' | 'fal'

export type StealClipResult = {
  mode: StealClipMode
  /** Short clip URL when ready; stub uses a data-URI poster loop stand-in. */
  videoUrl: string | null
  /** Always available — SVG poster for PIP before/without video. */
  posterUrl: string
  /** Human-readable status for the PIP caption. */
  label: string
  storyboardId: string
}

export const STEAL_HIGHLIGHT_API_PATH = '/api/steal-highlight'

/** Inline SVG poster — works offline, no network, no keys. */
export function buildStealPosterDataUrl(storyboard: StealStoryboard): string {
  const title = escapeXml(storyboard.title)
  const subtitle = escapeXml(storyboard.subtitle)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a2a22"/>
      <stop offset="100%" stop-color="#3d2a14"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <rect x="24" y="24" width="592" height="312" fill="none" stroke="#d9a441" stroke-width="3" opacity="0.85"/>
  <text x="48" y="120" fill="#ffb14d" font-family="ui-monospace,monospace" font-size="28" font-weight="700">${title}</text>
  <text x="48" y="168" fill="#e6ece0" font-family="ui-monospace,monospace" font-size="16">${subtitle}</text>
  <text x="48" y="280" fill="#8fa88f" font-family="ui-monospace,monospace" font-size="12">STUB CLIP · set FAL_KEY for fal generate</text>
  <circle cx="540" cy="260" r="36" fill="#d9a441" opacity="0.35"/>
  <circle cx="540" cy="260" r="18" fill="#ffb14d"/>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Immediate stub result — never throws, never waits on the network. */
export function stubStealClip(storyboard: StealStoryboard): StealClipResult {
  return {
    mode: 'stub',
    videoUrl: null,
    posterUrl: buildStealPosterDataUrl(storyboard),
    label: 'Stub highlight (no FAL_KEY)',
    storyboardId: storyboard.id,
  }
}

export type RequestStealClipOptions = {
  endpoint?: string
  fetchImpl?: typeof fetch
  /** Abort / timeout — late gen must not block the match. */
  signal?: AbortSignal
}

/**
 * Non-blocking clip request. Always returns a stub immediately on failure /
 * abort / missing key so the PIP can show storyboard beats without waiting.
 */
export async function requestStealClip(
  storyboard: StealStoryboard,
  options: RequestStealClipOptions = {},
): Promise<StealClipResult> {
  const fallback = stubStealClip(storyboard)
  const endpoint = options.endpoint ?? STEAL_HIGHLIGHT_API_PATH
  const fetchImpl = options.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        storyboardId: storyboard.id,
        prompt: storyboard.prompt,
        audioPrompt: storyboard.audioPrompt,
        facts: storyboard.facts,
      }),
      signal: options.signal,
      cache: 'no-store',
    })
    if (!response.ok) return fallback
    const body = (await response.json()) as Partial<StealClipResult>
    if (body.mode !== 'stub' && body.mode !== 'fal') return fallback
    return {
      mode: body.mode,
      videoUrl: typeof body.videoUrl === 'string' ? body.videoUrl : null,
      posterUrl: typeof body.posterUrl === 'string' ? body.posterUrl : fallback.posterUrl,
      label: typeof body.label === 'string' ? body.label : fallback.label,
      storyboardId: storyboard.id,
    }
  } catch {
    return fallback
  }
}
