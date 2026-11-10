import { NextResponse } from 'next/server'
import { completeChat, llmProviders } from '../../../services/llmProviders'
import { WORLD_LANDFORMS, WORLD_PALETTES } from '../../../services/arenaWorldgen'

/**
 * World-intent translator — the AI Builder Hackathon prompt-to-world surface.
 *
 * The browser sends the player's free-text world description. The LLM is asked
 * to reply with one JSON `WorldSpec`: *parameters only* — a landform enum,
 * bounded relief numbers, a palette enum and a display name. It never emits
 * coordinates, vertices, edges or geometry (the resolver owns every number
 * that reaches the mesh), never sees secrets, and cannot reach the match
 * authority: the client runs the reply through `sanitizeWorldSpec` before
 * anything is built, and a generated course is practice-split only.
 *
 * Env (server-only): WORLD_INTENT_API_KEY / WORLD_INTENT_BASE_URL /
 * WORLD_INTENT_MODEL take precedence; the shared COACH_INTENT_* chain is the
 * implicit backup. Unconfigured → 503 and the client falls back to the preset
 * world gallery, so the surface is never dead.
 */
export const runtime = 'nodejs'

const MAX_DESCRIPTION_CHARS = 500

const SYSTEM_PROMPT = [
  'You design terrain for a tiny rover-racing arena: turn the player\'s description into exactly one JSON object.',
  'Reply with {"landform":"...","ridge":{"x":n,"height":n},"channels":{"count":n,"spacing":n,"depth":n},"rim":{"height":n,"steepness":n},"waterlineOffset":n,"palette":"...","rockDensity":n,"scenarioName":"..."}.',
  `landform is one of: ${WORLD_LANDFORMS.join(', ')}. palette is one of: ${WORLD_PALETTES.join(', ')}.`,
  'Ranges: ridge.x 5.5–8.5, ridge.height 0.2–1.6, channels.count 0–6 (whole number), channels.spacing 1.5–4, channels.depth 0.02–0.2, rim.height 0–2.2, rim.steepness 1–4, waterlineOffset -0.2–0.35, rockDensity 0–1.',
  'The arena is a low basin with a floodable valley road, a dry ridge road, and drainage channels in between. Follow the description\'s mood: "flooded" wants a high waterlineOffset and deep channels, "flat" wants low ridge/rim, "rugged" wants the opposite.',
  'scenarioName is a short display name (≤40 characters) derived from the description. Output JSON only.',
].join(' ')

function sanitiseDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const note = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (note.length === 0 || note.length > MAX_DESCRIPTION_CHARS) return null
  return note
}

/** Pure parser so tests cover it without a network. */
export function parseWorldReply(body: string): unknown {
  try {
    const parsed: unknown = JSON.parse(body)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    const match = body.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      const parsed: unknown = JSON.parse(match[0])
      return typeof parsed === 'object' && parsed !== null ? parsed : null
    } catch {
      return null
    }
  }
}

export async function POST(request: Request) {
  let payload: { description?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const description = sanitiseDescription(payload.description)
  if (!description) {
    return NextResponse.json({ error: 'description-required' }, { status: 400 })
  }
  const providers = llmProviders(process.env, {
    apiKey: process.env.WORLD_INTENT_API_KEY,
    baseUrl: process.env.WORLD_INTENT_BASE_URL,
    model: process.env.WORLD_INTENT_MODEL,
  })
  if (providers.length === 0) {
    return NextResponse.json({ error: 'world-intent-not-configured' }, { status: 503 })
  }
  const result = await completeChat(providers, {
    system: SYSTEM_PROMPT,
    user: `World description: ${description}`,
    temperature: 0.4,
    maxTokens: 400,
    json: true,
    timeoutMs: 15_000,
  })
  if (result.kind === 'unconfigured') {
    return NextResponse.json({ error: 'world-intent-not-configured' }, { status: 503 })
  }
  if (result.kind === 'upstream') {
    return NextResponse.json({ error: 'translator-upstream-error' }, { status: 502 })
  }
  const spec = parseWorldReply(result.content)
  if (!spec) {
    return NextResponse.json({ error: 'translator-no-fit' }, { status: 422 })
  }
  return NextResponse.json({ spec })
}
