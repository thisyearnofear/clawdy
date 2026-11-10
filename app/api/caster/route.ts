import { NextResponse } from 'next/server'
import { casterSystemPrompt, casterUserMessage, type CasterFact } from '../../../services/raceCaster'

/**
 * Race-caster route — Track D (AI Builder Hackathon).
 *
 * The browser sends one recorded race fact (bank/steal/flood/drain/finish,
 * already shown deterministically) and receives one short commentary line.
 * The fact's anchor numbers are enforced client-side by `validateCasterLine`,
 * so the caster can only reword, never invent. Presentation only.
 *
 * Env (server-only, shared with the other translators): COACH_INTENT_API_KEY,
 * COACH_INTENT_BASE_URL, COACH_INTENT_MODEL, plus optional CASTER_MODEL to use
 * a different model for commentary. Unset → 503 and the deterministic caption
 * stands.
 */
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const apiKey = process.env.COACH_INTENT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'caster-not-configured' }, { status: 503 })
  }
  let payload: { fact?: CasterFact; championName?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const { fact } = payload
  const championName = typeof payload.championName === 'string' && payload.championName.trim().length > 0
    ? payload.championName.trim().slice(0, 24)
    : 'the champion'
  if (
    typeof fact !== 'object' || fact === null ||
    typeof fact.fallback !== 'string' || fact.fallback.length > 200 ||
    typeof fact.kind !== 'string' || typeof fact.score !== 'string' || fact.score.length > 40 ||
    !Array.isArray(fact.anchors) || fact.anchors.some((anchor: unknown) => typeof anchor !== 'string')
  ) {
    return NextResponse.json({ error: 'invalid-fact' }, { status: 400 })
  }
  const baseUrl = process.env.COACH_INTENT_BASE_URL?.replace(/\/+$/, '') ?? 'https://api.openai.com/v1'
  const model = process.env.CASTER_MODEL ?? process.env.COACH_INTENT_MODEL ?? 'gpt-4o-mini'
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        max_tokens: 60,
        messages: [
          { role: 'system', content: casterSystemPrompt() },
          { role: 'user', content: casterUserMessage(fact, championName) },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) {
      return NextResponse.json({ error: 'caster-upstream-error' }, { status: 502 })
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'caster-empty-reply' }, { status: 502 })
    }
    return NextResponse.json({ line: content })
  } catch {
    return NextResponse.json({ error: 'caster-unreachable' }, { status: 502 })
  }
}
