import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// One-shot migration — run once then delete this route
// Requires SUPABASE_SERVICE_ROLE_KEY in Vercel env vars
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'missing env' }, { status: 500 })

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  // Check if table already exists
  const { error: existsErr } = await supabase.from('game_events').select('id').limit(1)
  if (!existsErr) return NextResponse.json({ status: 'already exists' })

  // Create via pg extension — Supabase service role can call pg_catalog functions
  // We use a workaround: insert a row into a temp table to trigger schema creation
  // Actually use the Supabase SQL API (available to service role via /pg endpoint)
  const sqlRes = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: `
      CREATE TABLE IF NOT EXISTS game_events (
        id BIGSERIAL PRIMARY KEY,
        event TEXT NOT NULL,
        player_id TEXT,
        payload JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_game_events_event ON game_events (event);
      CREATE INDEX IF NOT EXISTS idx_game_events_player ON game_events (player_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_game_events_created ON game_events (created_at DESC);
      ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_events' AND policyname='Game events insertable by everyone') THEN
          CREATE POLICY "Game events insertable by everyone" ON game_events FOR INSERT WITH CHECK (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_events' AND policyname='Game events readable by everyone') THEN
          CREATE POLICY "Game events readable by everyone" ON game_events FOR SELECT USING (true);
        END IF;
      END $$;
    ` }),
  })

  const sqlBody = await sqlRes.text()

  // Verify
  const { error: verifyErr } = await supabase.from('game_events').select('id').limit(1)

  return NextResponse.json({
    pgStatus: sqlRes.status,
    pgBody: sqlBody.slice(0, 300),
    tableExists: !verifyErr,
  })
}
