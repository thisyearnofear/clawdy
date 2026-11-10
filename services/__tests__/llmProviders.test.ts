import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL, completeChat, llmProviders } from '../llmProviders'

const env = {
  COACH_INTENT_API_KEY: 'primary-key',
  COACH_INTENT_BASE_URL: 'https://primary.example/v1',
  COACH_INTENT_MODEL: 'primary-model',
  COACH_INTENT_FALLBACK_API_KEY: 'fallback-key',
  COACH_INTENT_FALLBACK_BASE_URL: 'https://fallback.example/v1',
  COACH_INTENT_FALLBACK_MODEL: 'fallback-model',
}

function jsonResponse(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('llm provider chain configuration', () => {
  it('orders primary then fallback and applies defaults', () => {
    const chain = llmProviders(env)
    expect(chain).toEqual([
      { baseUrl: 'https://primary.example/v1', apiKey: 'primary-key', model: 'primary-model' },
      { baseUrl: 'https://fallback.example/v1', apiKey: 'fallback-key', model: 'fallback-model' },
    ])
  })

  it('uses OpenAI defaults when only a key is set', () => {
    expect(llmProviders({ COACH_INTENT_API_KEY: 'k' })).toEqual([
      { baseUrl: DEFAULT_LLM_BASE_URL, apiKey: 'k', model: DEFAULT_LLM_MODEL },
    ])
  })

  it('is empty when unconfigured', () => {
    expect(llmProviders({})).toEqual([])
    expect(llmProviders({ COACH_INTENT_FALLBACK_API_KEY: 'only-fallback' })).toHaveLength(1)
  })

  it('per-route overrides replace primary fields but keep the fallback (doctrine semantics)', () => {
    const chain = llmProviders(env, { apiKey: 'doctrine-key', model: 'doctrine-model' })
    expect(chain[0]).toEqual({ baseUrl: 'https://primary.example/v1', apiKey: 'doctrine-key', model: 'doctrine-model' })
    expect(chain[1].apiKey).toBe('fallback-key')
  })
})

describe('chat completion fallback behavior', () => {
  const request = { system: 's', user: 'u', temperature: 0, maxTokens: 50 }
  const providers = llmProviders(env)

  it('uses the primary when it is healthy', async () => {
    const fetchMock = vi.fn(async () => jsonResponse('from primary'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await completeChat(providers, request)
    expect(result).toEqual({ kind: 'ok', content: 'from primary' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(init.headers && (init.headers as Record<string, string>).Authorization)).toContain('primary-key')
  })

  it('falls through credit-exhausted primaries to the fallback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('quota exceeded', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse('from fallback'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await completeChat(providers, request)
    expect(result).toEqual({ kind: 'ok', content: 'from fallback' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondCall = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(secondCall[0]).toContain('fallback.example')
  })

  it('falls through network failure and empty content, and reports upstream when all providers fail', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await completeChat(providers, request)
    expect(result).toEqual({ kind: 'upstream' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports unconfigured without touching the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await completeChat([], request)).toEqual({ kind: 'unconfigured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('applies the per-route model override without changing the provider key', async () => {
    const fetchMock = vi.fn(async () => jsonResponse('cast line'))
    vi.stubGlobal('fetch', fetchMock)
    await completeChat(providers, { ...request, modelOverride: 'caster-model' })
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.model).toBe('caster-model')
  })
})
