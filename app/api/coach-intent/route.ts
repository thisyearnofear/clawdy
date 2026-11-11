import { NextResponse } from 'next/server'
import { completeChat, llmProviders } from '../../../services/llmProviders'

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
 * Providers: primary then fallback (services/llmProviders.ts) — a provider
 * that runs dry degrades to the next; unconfigured → 503 and the client falls
 * back to the keyword matcher.
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
  const providers = llmProviders(process.env)
  if (providers.length === 0) {
    return NextResponse.json({ error: 'coach-intent-not-configured' }, { status: 503 })
  }
  const result = await completeChat(providers, {
    system: SYSTEM_PROMPT,
    user: `Coach's note: ${note}\n\nLegal actions this tick:\n${summary}`,
    temperature: 0,
    maxTokens: 200,
    json: true,
    accept: content => parseIntentReply(content) !== null,
  })
  if (result.kind === 'unconfigured') {
    return NextResponse.json({ error: 'coach-intent-not-configured' }, { status: 503 })
  }
  if (result.kind === 'upstream') {
    return NextResponse.json({ error: 'translator-upstream-error' }, { status: 502 })
  }
  const intent = parseIntentReply(result.content)
  if (!intent) {
    return NextResponse.json({ error: 'translator-no-fit' }, { status: 422 })
  }
  return NextResponse.json({ intent })
}
