/**
 * Reactor token resolution for the Orbis broadcast layer.
 *
 * The browser never sees REACTOR_API_KEY. It asks the server-side broker for
 * a session-scoped JWT, memoizes it for its real lifetime, and coalesces the
 * parallel token calls the SDK makes while negotiating WebRTC.
 */

export const BROADCAST_TOKEN_PATH = '/api/reactor/token?profile=broadcast'

interface ReactorTokenResponse {
  jwt: string
  /** Unix epoch seconds, decided by Reactor rather than the client. */
  expires_at: number
}

export interface ReactorTokenResolverOptions {
  endpoint?: string
  fetchImpl?: typeof fetch
  now?: () => number
  refreshSkewMs?: number
}

const DEFAULT_REFRESH_SKEW_MS = 60_000

export function createReactorTokenResolver(
  options: ReactorTokenResolverOptions = {},
): () => Promise<string> {
  const endpoint = options.endpoint ?? BROADCAST_TOKEN_PATH
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => Date.now())
  const refreshSkewMs = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS

  let cachedToken: { jwt: string; expiresAtMs: number } | null = null
  let inflightToken: Promise<string> | null = null

  return async () => {
    if (cachedToken && now() < cachedToken.expiresAtMs - refreshSkewMs) {
      return cachedToken.jwt
    }
    if (inflightToken) return inflightToken

    inflightToken = (async () => {
      const response = await fetchImpl(endpoint, { cache: 'no-store' })
      const contentType = response.headers.get('content-type') ?? ''
      const body = contentType.includes('application/json')
        ? (await response.json()) as Partial<ReactorTokenResponse> & { error?: string }
        : {}
      if (!response.ok) {
        throw new Error(body.error ?? `${endpoint} returned HTTP ${response.status}`)
      }
      if (typeof body.jwt !== 'string' || typeof body.expires_at !== 'number') {
        throw new Error(`${endpoint} did not return { jwt, expires_at }`)
      }
      cachedToken = { jwt: body.jwt, expiresAtMs: body.expires_at * 1000 }
      return body.jwt
    })()

    try {
      return await inflightToken
    } finally {
      inflightToken = null
    }
  }
}
