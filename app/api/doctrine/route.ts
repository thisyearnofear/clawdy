import { NextResponse } from 'next/server'
import { completeChat, llmProviders } from '../../../services/llmProviders'

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
  const providers = llmProviders(process.env, {
    apiKey: process.env.DOCTRINE_API_KEY,
    baseUrl: process.env.DOCTRINE_BASE_URL,
    model: process.env.DOCTRINE_MODEL,
  })
  if (providers.length === 0) {
    return NextResponse.json({ error: 'doctrine-not-configured' }, { status: 503 })
  }
  const result = await completeChat(providers, {
    system: SYSTEM_PROMPT,
    user: `Coach's doctrine: ${note}`,
    temperature: 0,
    maxTokens: 250,
    json: true,
    accept: content => parseDoctrineReply(content) !== null,
  })
  if (result.kind === 'unconfigured') {
    return NextResponse.json({ error: 'doctrine-not-configured' }, { status: 503 })
  }
  if (result.kind === 'upstream') {
    return NextResponse.json({ error: 'translator-upstream-error' }, { status: 502 })
  }
  const spec = parseDoctrineReply(result.content)
  if (!spec) {
    return NextResponse.json({ error: 'translator-no-spec' }, { status: 422 })
  }
  return NextResponse.json({ spec })
}
