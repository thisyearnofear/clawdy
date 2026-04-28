import { NextRequest, NextResponse } from 'next/server'

// In-memory heartbeat store: playerId → lastSeenMs
// Players ping every 30s; entries expire after 90s
const heartbeats = new Map<string, number>()
const TTL_MS = 90_000

function pruneExpired() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, ts] of heartbeats) {
    if (ts < cutoff) heartbeats.delete(id)
  }
}

// GET /api/players — returns { count: number }
export async function GET() {
  pruneExpired()
  return NextResponse.json({ count: heartbeats.size })
}

// POST /api/players — body: { playerId: string } — registers/refreshes heartbeat
export async function POST(req: NextRequest) {
  try {
    const { playerId } = await req.json()
    if (typeof playerId !== 'string' || !playerId) {
      return NextResponse.json({ error: 'playerId required' }, { status: 400 })
    }
    pruneExpired()
    heartbeats.set(playerId, Date.now())
    return NextResponse.json({ count: heartbeats.size })
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
}
