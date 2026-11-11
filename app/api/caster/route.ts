import { NextResponse } from 'next/server'
import { completeChat, llmProviders } from '../../../services/llmProviders'
import { casterSystemPrompt, casterUserMessage, validateCasterLine, type CasterFact } from '../../../services/raceCaster'

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
  const providers = llmProviders(process.env)
  if (providers.length === 0) {
    return NextResponse.json({ error: 'caster-not-configured' }, { status: 503 })
  }
  const result = await completeChat(providers, {
    system: casterSystemPrompt(),
    user: casterUserMessage(fact, championName),
    temperature: 0.9,
    maxTokens: 60,
    timeoutMs: 8_000,
    modelOverride: process.env.CASTER_MODEL,
    accept: content => validateCasterLine(content, fact) !== null,
  })
  if (result.kind === 'unconfigured') {
    return NextResponse.json({ error: 'caster-not-configured' }, { status: 503 })
  }
  if (result.kind === 'upstream') {
    return NextResponse.json({ error: 'caster-upstream-error' }, { status: 502 })
  }
  return NextResponse.json({ line: result.content })
}
