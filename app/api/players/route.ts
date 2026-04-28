import { NextRequest, NextResponse } from 'next/server'

const heartbeats = new Map<string, number>()
const TTL_MS = 90_000
const MAX_PLAYERS = 1000
const MAX_PLAYER_ID_LENGTH = 128

function pruneExpired() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, ts] of heartbeats) {
    if (ts < cutoff) heartbeats.delete(id)
  }
}

export async function GET() {
  pruneExpired()
  return NextResponse.json({ count: heartbeats.size })
}

export async function POST(req: NextRequest) {
  try {
    const { playerId } = await req.json()
    if (typeof playerId !== 'string' || !playerId) {
      return NextResponse.json({ error: 'playerId required' }, { status: 400 })
    }
    if (playerId.length > MAX_PLAYER_ID_LENGTH) {
      return NextResponse.json({ error: `playerId must be <= ${MAX_PLAYER_ID_LENGTH} chars` }, { status: 400 })
    }
    pruneExpired()
    if (heartbeats.size >= MAX_PLAYERS && !heartbeats.has(playerId)) {
      return NextResponse.json({ error: 'Player limit reached' }, { status: 429 })
    }
    heartbeats.set(playerId, Date.now())
    return NextResponse.json({ count: heartbeats.size })
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
}
