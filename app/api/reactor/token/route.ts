import { NextResponse } from 'next/server'

/**
 * Reactor session-token broker for the Orbis broadcast layer.
 *
 * The browser never sees REACTOR_API_KEY — it receives a session-scoped JWT
 * minted here. `?profile=broadcast` mints a bounded grant (one session, five
 * minutes) sized for a match reel; anything else is rejected before Reactor
 * is called.
 */
const MODEL_NAME = 'reactor/visko-orbis-dynamic'

const BROADCAST_GRANT = {
  expires_after: 300,
  authorization_details: [
    {
      type: 'session',
      resources: { models: { match: [MODEL_NAME] } },
      constraints: {
        max_sessions: 1,
        max_session_duration_seconds: 300,
      },
    },
  ],
}

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const profile = new URL(request.url).searchParams.get('profile')
  if (profile !== 'broadcast') {
    return NextResponse.json({ error: 'Unknown reactor token profile' }, { status: 400 })
  }

  const apiKey = process.env.REACTOR_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'REACTOR_API_KEY is not set on the server' }, { status: 500 })
  }

  try {
    const response = await fetch('https://api.reactor.inc/tokens', {
      method: 'POST',
      headers: {
        'Reactor-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(BROADCAST_GRANT),
    })
    if (!response.ok) {
      console.error('Reactor token mint failed:', response.status)
      return NextResponse.json({ error: `Reactor /tokens returned ${response.status}` }, { status: 502 })
    }
    const payload = await response.json() as { jwt?: unknown; expires_at?: unknown }
    if (typeof payload.jwt !== 'string' || payload.jwt.length === 0 || !Number.isFinite(payload.expires_at)) {
      console.error('Reactor token mint failed: malformed upstream payload')
      return NextResponse.json({ error: 'Reactor /tokens returned an unusable payload' }, { status: 502 })
    }
    return NextResponse.json({ jwt: payload.jwt, expires_at: payload.expires_at })
  } catch {
    console.error('Reactor token broker error')
    return NextResponse.json({ error: 'Unable to mint Reactor token' }, { status: 500 })
  }
}
