import { NextResponse } from 'next/server'

/**
 * Doctrine translator: the Track B "describe your champion's doctrine" surface.
 *
 * The browser sends the coach's free-text paragraph. The LLM replies with one
 * bounded JSON object — a name, a signed weight vector over the five coaching
 * foci, and a one-line interpretation. It never names an action, a tick, or an
 * id: the client-side `services/doctrine.ts` resolver turns the weights into
 * legal draft lessons at real recorded ticks, so the translator cannot invent
 * a move or reach the match authority.
 *
 * Env (server-only, never NEXT_PUBLIC): DOCTRINE_API_KEY, falling back to
 * COACH_INTENT_API_KEY so one key covers both translation surfaces; optional
 * DOCTRINE_BASE_URL / DOCTRINE_MODEL (then the COACH_INTENT_* equivalents).
 * Unset → 503 and the client falls back to `heuristicDoctrine` — the keyword
 * parser in services/doctrine.ts — like every other optional integration.
 */
export const runtime = 'nodejs'

const MAX_NOTE_CHARS = 500

const SYSTEM_PROMPT = [
  'You translate a coach\'s free-text "doctrine" for a rover-racing game into exactly one JSON object.',
  'Reply {"name": string (<=40 chars, catchy), "weights": {"weather": n, "banking": n, "collection": n, "contest": n, "energy": n}, "notes": string (<=140 chars)}.',
  'Each weight is in [-1, 1]: +1 strongly prefer, -1 strongly avoid, 0 indifferent.',
  'Meanings: weather = caution around flood water (+1 prefers dry ridge routes; negative means it hugs the flooded low road or panics);',
  'banking = delivering cargo home promptly; collection = grabbing energy cores greedily;',
  'contest = racing the rival to cores; energy = willingness to spend battery draining flood water.',
  'The doctrine is applied across a whole recorded run — capture tendencies, not single moves. Output JSON only.',
].join(' ')

function sanitiseNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const note = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (note.length === 0 || note.length > MAX_NOTE_CHARS) return null
  return note
}

/** Pure parse so tests cover it without a network. */
export function parseDoctrineReply(body: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    const match = body.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return null
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  return parsed
}

export async function POST(request: Request) {
  const apiKey = process.env.DOCTRINE_API_KEY ?? process.env.COACH_INTENT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'doctrine-not-configured' }, { status: 503 })
  }
  let payload: { note?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const note = sanitiseNote(payload.note)
  if (!note) {
    return NextResponse.json({ error: 'note-required' }, { status: 400 })
  }
  const baseUrl = (process.env.DOCTRINE_BASE_URL ?? process.env.COACH_INTENT_BASE_URL)?.replace(/\/+$/, '') ?? 'https://api.openai.com/v1'
  const model = process.env.DOCTRINE_MODEL ?? process.env.COACH_INTENT_MODEL ?? 'gpt-4o-mini'
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 250,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Coach's doctrine: ${note}` },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) {
      return NextResponse.json({ error: 'translator-upstream-error' }, { status: 502 })
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'translator-empty-reply' }, { status: 502 })
    }
    const spec = parseDoctrineReply(content)
    if (!spec) {
      return NextResponse.json({ error: 'translator-no-spec' }, { status: 422 })
    }
    return NextResponse.json({ spec })
  } catch {
    return NextResponse.json({ error: 'translator-unreachable' }, { status: 502 })
  }
}
