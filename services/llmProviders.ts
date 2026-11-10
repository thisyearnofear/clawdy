/**
 * Server-side LLM provider chain for the AI Builder Hackathon translators
 * (coach-intent, arena-intent, doctrine, caster). Providers are tried in
 * order — primary first, then the fallback — so a provider that runs out of
 * credits or times out degrades to the next instead of killing the surface.
 * When no provider is configured, callers return 503 and the deterministic
 * fallbacks (keyword matcher, preset Clash, heuristic doctrine, base
 * captions) stand.
 *
 * This module is pure about configuration (env in → ordered provider list
 * out) so tests cover the chain without a network. It is imported only by
 * server routes; the browser never sees keys.
 */

export interface LlmProvider {
  baseUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_LLM_MODEL = 'gpt-4o-mini'

function readProvider(env: Record<string, string | undefined>, prefix: 'COACH_INTENT' | 'COACH_INTENT_FALLBACK'): LlmProvider | null {
  const apiKey = env[`${prefix}_API_KEY`]?.trim()
  if (!apiKey) return null
  const baseUrl = (env[`${prefix}_BASE_URL`]?.trim() || DEFAULT_LLM_BASE_URL).replace(/\/+$/, '')
  const model = env[`${prefix}_MODEL`]?.trim() || DEFAULT_LLM_MODEL
  return { baseUrl, apiKey, model }
}

/** Ordered provider chain: primary (with optional per-route overrides), then fallback. Empty when unconfigured. */
export function llmProviders(
  env: Record<string, string | undefined>,
  primaryOverrides?: { apiKey?: string; baseUrl?: string; model?: string },
): LlmProvider[] {
  const chain: LlmProvider[] = []
  const primary: LlmProvider | null = (() => {
    const apiKey = primaryOverrides?.apiKey?.trim() || env.COACH_INTENT_API_KEY?.trim()
    if (!apiKey) return null
    const baseUrl = (primaryOverrides?.baseUrl?.trim() || env.COACH_INTENT_BASE_URL?.trim() || DEFAULT_LLM_BASE_URL).replace(/\/+$/, '')
    const model = primaryOverrides?.model?.trim() || env.COACH_INTENT_MODEL?.trim() || DEFAULT_LLM_MODEL
    return { baseUrl, apiKey, model }
  })()
  if (primary) chain.push(primary)
  const fallback = readProvider(env, 'COACH_INTENT_FALLBACK')
  if (fallback && !chain.some(entry => entry.apiKey === fallback.apiKey && entry.baseUrl === fallback.baseUrl)) chain.push(fallback)
  return chain
}

export interface ChatRequest {
  system: string
  user: string
  temperature: number
  maxTokens: number
  /** Ask the provider for a JSON object (OpenAI-compatible response_format). */
  json?: boolean
  /** Per-route model override (e.g. CASTER_MODEL for commentary). */
  modelOverride?: string
  timeoutMs?: number
}

export type ChatResult = { kind: 'ok'; content: string } | { kind: 'unconfigured' } | { kind: 'upstream' }

/**
 * Runs the request against each provider in order until one returns usable
 * content. Credit exhaustion, rate limits, timeouts and empty replies all
 * fall through to the next provider.
 */
export async function completeChat(
  providers: readonly LlmProvider[],
  request: ChatRequest,
): Promise<ChatResult> {
  if (providers.length === 0) return { kind: 'unconfigured' }
  let lastFailure: ChatResult = { kind: 'upstream' }
  for (const provider of providers) {
    try {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify({
          model: request.modelOverride ?? provider.model,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          ...(request.json ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
        }),
        signal: AbortSignal.timeout(request.timeoutMs ?? 12_000),
      })
      if (!response.ok) {
        lastFailure = { kind: 'upstream' }
        continue
      }
      const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] }
      const content = data.choices?.[0]?.message?.content
      if (typeof content === 'string' && content.trim().length > 0) return { kind: 'ok', content }
      lastFailure = { kind: 'upstream' }
    } catch {
      lastFailure = { kind: 'upstream' }
    }
  }
  return lastFailure
}
