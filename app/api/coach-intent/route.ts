import { NextResponse } from 'next/server'

/**
 * Coach-intent translator: the AI Builder Hackathon "plain language" surface.
 *
 * The browser sends the coach's free-text note plus a precomputed digest of
 * the *legal* actions at the recorded tick (`legalActionSummary`). The LLM is
 * asked to reply with one JSON object naming a legal action and a rationale.
 * It never receives secrets, never invents legality (the client-side resolver
 * checks its answer against the recorded observation before any draft is
 * created), and cannot touch scored matches — the Coach UI already locks
 * those off before this route can be reached.
 *
 * Env (server-only, never NEXT_PUBLIC): COACH_INTENT_API_KEY (required),
 * COACH_INTENT_BASE_URL (optional, OpenAI-compatible), COACH_INTENT_MODEL
 * (optional). Unset → 503 and the client falls back to the keyword matcher,
 * exactly like the Orbis/FAL optional integrations.
 */
export const runtime = 'nodejs'

const MAX_NOTE_CHARS = 500

const SYSTEM_PROMPT = [
  'You translate a coach\'s free-text instruction about a rover-racing game into exactly one JSON object.',
  'You will receive: the coach\'s note, and a list of the ONLY actions the rover may legally choose at this moment.',
  'Reply with {"action": {...}, "rationale": "..."} where action matches one listed option exactly',
  '(for a route: {"type":"move","edgeId":"..."}; a core: {"type":"collect","resourceId":"..."};',
  'or {"type":"bank"} / {"type":"drain"} / {"type":"wait"}).',
  'Never invent ids. If no listed action fits the instruction, reply {"action": null, "rationale": "why not"}.',
  'The rationale is one sentence in the coach\'s voice: what to do and when. Output JSON only.',
].join(' ')

function sanitiseNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const note = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (note.length === 0 || note.length > MAX_NOTE_CHARS) return null
  return note
}

/** Pure parse so tests cover it without a network. */
export function parseIntentReply(body: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    // Some providers wrap JSON in fences; one retry on the first {...} block.
    const match = body.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return null
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { action } = parsed as { action?: unknown }
  if (action === null || action === undefined) return null
  return parsed
}

export async function POST(request: Request) {
  const apiKey = process.env.COACH_INTENT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'coach-intent-not-configured' }, { status: 503 })
  }
  let payload: { note?: unknown; summary?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const note = sanitiseNote(payload.note)
  const summary = typeof payload.summary === 'string' ? payload.summary.slice(0, 4000) : null
  if (!note || !summary) {
    return NextResponse.json({ error: 'note-and-summary-required' }, { status: 400 })
  }
  const baseUrl = process.env.COACH_INTENT_BASE_URL?.replace(/\/+$/, '') ?? 'https://api.openai.com/v1'
  const model = process.env.COACH_INTENT_MODEL ?? 'gpt-4o-mini'
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Coach's note: ${note}\n\nLegal actions this tick:\n${summary}` },
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
    const intent = parseIntentReply(content)
    if (!intent) {
      return NextResponse.json({ error: 'translator-no-fit' }, { status: 422 })
    }
    return NextResponse.json({ intent })
  } catch {
    return NextResponse.json({ error: 'translator-unreachable' }, { status: 502 })
  }
}
