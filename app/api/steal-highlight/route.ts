import { NextResponse } from 'next/server'

/**
 * Steal-highlight clip broker (presentation only).
 *
 * - No FAL_KEY → stub immediately (works offline / local / preview).
 * - FAL_KEY present → attempt a short fal image-to-video (or text) request
 *   with a hard timeout; any failure falls back to stub.
 *
 * Never feeds a match. The browser already shows the storyboard PIP; this
 * route only optionally upgrades the poster to a generated clip.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FAL_ENDPOINT = 'https://fal.run/fal-ai/minimax/video-01-live'
/** Keep gen off the match critical path — bail fast. */
const FAL_TIMEOUT_MS = 8_000

type StealHighlightBody = {
  storyboardId?: string
  prompt?: string
  audioPrompt?: string
  facts?: {
    tick?: number
    winnerId?: string
    loserId?: string
    stolen?: number
  }
}

function stubPoster(title: string, subtitle: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#1a2a22"/>
  <rect x="24" y="24" width="592" height="312" fill="none" stroke="#d9a441" stroke-width="3"/>
  <text x="48" y="120" fill="#ffb14d" font-family="monospace" font-size="28" font-weight="700">${escapeXml(title)}</text>
  <text x="48" y="168" fill="#e6ece0" font-family="monospace" font-size="16">${escapeXml(subtitle)}</text>
  <text x="48" y="280" fill="#8fa88f" font-family="monospace" font-size="12">STUB · FAL_KEY unset or gen late</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function stubResponse(body: StealHighlightBody, reason: string) {
  const stolen = body.facts?.stolen ?? 0
  const winner = body.facts?.winnerId === 'champion' ? 'Your Raider' : 'Rival'
  const title = 'FULL-LOAD STEAL'
  const subtitle = `${winner} · +${stolen} cargo`
  return NextResponse.json({
    mode: 'stub' as const,
    videoUrl: null,
    posterUrl: stubPoster(title, subtitle),
    label: reason,
    storyboardId: body.storyboardId ?? 'unknown',
  })
}

export async function POST(request: Request) {
  let body: StealHighlightBody = {}
  try {
    body = (await request.json()) as StealHighlightBody
  } catch {
    return stubResponse({}, 'Stub highlight (bad request body)')
  }

  const falKey = process.env.FAL_KEY
  if (!falKey) {
    return stubResponse(body, 'Stub highlight (no FAL_KEY)')
  }

  const prompt =
    typeof body.prompt === 'string' && body.prompt.trim().length > 0
      ? body.prompt.trim()
      : 'autonomous rover steals glowing cargo cores in a sandstone basin arena'

  // Hook for fal when FAL_KEY is present. Minimax live is a light text→video
  // path; swap model id freely — the contract is { mode, videoUrl, posterUrl }.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FAL_TIMEOUT_MS)
  try {
    const response = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        prompt_optimizer: true,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      return stubResponse(body, `Stub highlight (fal HTTP ${response.status})`)
    }
    const payload = (await response.json()) as {
      video?: { url?: string }
      video_url?: string
    }
    const videoUrl = payload.video?.url ?? payload.video_url ?? null
    if (!videoUrl) {
      return stubResponse(body, 'Stub highlight (fal returned no video url)')
    }
    return NextResponse.json({
      mode: 'fal' as const,
      videoUrl,
      posterUrl: stubPoster('FULL-LOAD STEAL', 'fal clip ready'),
      label: 'fal highlight',
      storyboardId: body.storyboardId ?? 'unknown',
    })
  } catch {
    return stubResponse(body, 'Stub highlight (fal late or failed)')
  } finally {
    clearTimeout(timer)
  }
}
