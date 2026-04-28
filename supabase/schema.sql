-- Leaderboard: persistent player scores and stats
CREATE TABLE IF NOT EXISTS leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE,
  wallet_address TEXT,
  total_earned NUMERIC DEFAULT 0,
  total_collected INTEGER DEFAULT 0,
  total_bids_won INTEGER DEFAULT 0,
  total_rents INTEGER DEFAULT 0,
  best_combo_multiplier NUMERIC DEFAULT 1,
  rounds_played INTEGER DEFAULT 0,
  rounds_won INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Weather state: current weather for real-time sync
CREATE TABLE IF NOT EXISTS weather_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  preset TEXT DEFAULT 'custom',
  agent_id TEXT,
  amount NUMERIC DEFAULT 0,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_total_earned ON leaderboard (total_earned DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rounds_won ON leaderboard (rounds_won DESC);

-- RLS policies
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_state ENABLE ROW LEVEL SECURITY;

-- Anyone can read leaderboard
CREATE POLICY "Leaderboard readable by everyone" ON leaderboard FOR SELECT USING (true);

-- Players can update their own row
CREATE POLICY "Players can update own leaderboard entry" ON leaderboard
  FOR UPDATE USING (true);

-- Players can insert their own row
CREATE POLICY "Players can insert own leaderboard entry" ON leaderboard
  FOR INSERT WITH CHECK (true);

-- Weather state is readable by everyone
CREATE POLICY "Weather state readable by everyone" ON weather_state FOR SELECT USING (true);

-- Weather state can be updated by anyone
CREATE POLICY "Weather state updatable" ON weather_state FOR ALL USING (true);

-- Insert initial weather state
INSERT INTO weather_state (id, preset) VALUES (1, 'custom') ON CONFLICT (id) DO NOTHING;
