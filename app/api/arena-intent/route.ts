import { NextResponse } from 'next/server'

/**
 * Arena-intent translator — Track A "Prompt the Arena" (AI Builder Hackathon).
 *
 * The browser sends the player's free-text Clash description plus
 * `customClashDigest(course)`: the real station names, flood-exposure map,
 * base pads and legal ranges. The LLM compiles it into one JSON
 * `CustomClashSpec` (flood windows, core placements/values, duration, rival
 * bot). It never invents geometry and never sees secrets; the client runs the
 * reply through `sanitizeCustomClashSpec` against the actual course before
 * anything is built, and `buildCustomClash` keeps the pinned collider, nodes
 * and edge paths untouched. The episode validator is the final gate when the
 * runner is constructed.
 *
 * Env (server-only): COACH_INTENT_API_KEY / COACH_INTENT_BASE_URL /
 * COACH_INTENT_MODEL — shared with the coach-intent route. Unset → 503 and
 * the client falls back to the preset Clash with an honest message.
 */
export const runtime = 'nodejs'

const MAX_DESCRIPTION_CHARS = 600

const SYSTEM_PROMPT = [
  'You design a rover-racing Clash: turn the player\'s description into exactly one JSON object.',
  'You will receive: the player\'s description, then the arena facts (station names, which stations are flood-exposed valley pads, base pads, core value range, flood limits, rival house bots).',
  'Reply with {"floods":[{"startTick":n,"endTick":n}...],"resources":[{"nodeId":"...","value":n}...],"durationTicks":n,"seed":n,"rivalStrategy":"poach|greedy|safe|weather"}.',
  'Rules: only place cores on the listed stations, never on base pads; 1-12 flood windows inside the duration; 1-24 cores; keep at least one core on a dry (non-valley) station so the champion can always reach it; seed is any whole number.',
  'Follow the player\'s intent for timing, scarcity, jackpot sizes and rival temperament. Output JSON only.',
].join(' ')

function sanitiseDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const note = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (note.length === 0 || note.length > MAX_DESCRIPTION_CHARS) return null
  return note
}

/** Pure parser so tests cover it without a network. */
export function parseSpecReply(body: string): unknown {
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
  const apiKey = process.env.COACH_INTENT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'arena-intent-not-configured' }, { status: 503 })
  }
  let payload: { description?: unknown; digest?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const description = sanitiseDescription(payload.description)
  const digest = typeof payload.digest === 'string' ? payload.digest.slice(0, 4000) : null
  if (!description || !digest) {
    return NextResponse.json({ error: 'description-and-digest-required' }, { status: 400 })
  }
  const baseUrl = process.env.COACH_INTENT_BASE_URL?.replace(/\/+$/, '') ?? 'https://api.openai.com/v1'
  const model = process.env.COACH_INTENT_MODEL ?? 'gpt-4o-mini'
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Player's description: ${description}\n\nArena facts:\n${digest}` },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      return NextResponse.json({ error: 'translator-upstream-error' }, { status: 502 })
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'translator-empty-reply' }, { status: 502 })
    }
    const spec = parseSpecReply(content)
    if (!spec) {
      return NextResponse.json({ error: 'translator-no-fit' }, { status: 422 })
    }
    return NextResponse.json({ spec })
  } catch {
    return NextResponse.json({ error: 'translator-unreachable' }, { status: 502 })
  }
}
