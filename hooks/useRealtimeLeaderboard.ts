'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '../services/supabase'

export interface LeaderboardEntry {
  player_id: string
  wallet_address: string | null
  total_earned: number
  total_collected: number
  total_bids_won: number
  total_rents: number
  best_combo_multiplier: number
  rounds_played: number
  rounds_won: number
  updated_at: string
}

/**
 * Real-time leaderboard: subscribes to leaderboard table changes.
 * Returns sorted entries and updates live when anyone's score changes.
 */
export function useRealtimeLeaderboard(limit = 10) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) { setLoading(false); return }

    // Initial fetch
    const fetchLeaderboard = async () => {
      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .order('total_earned', { ascending: false })
        .limit(limit)
      if (data) setEntries(data)
      setLoading(false)
    }
    fetchLeaderboard()

    // Real-time subscription
    const channel = supabase
      .channel('leaderboard-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leaderboard' },
        () => { fetchLeaderboard() },
      )
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [limit])

  return { entries, loading }
}

/**
 * Upsert a player's leaderboard entry.
 * Call this when a round ends or when the player earns/collects.
 */
export async function upsertLeaderboardEntry(entry: {
  playerId: string
  walletAddress?: string
  totalEarned?: number
  totalCollected?: number
  totalBidsWon?: number
  totalRents?: number
  bestComboMultiplier?: number
  roundsPlayed?: number
  roundsWon?: number
}) {
  const supabase = getSupabase()
  if (!supabase) return

  await supabase.from('leaderboard').upsert(
    {
      player_id: entry.playerId,
      wallet_address: entry.walletAddress,
      total_earned: entry.totalEarned,
      total_collected: entry.totalCollected,
      total_bids_won: entry.totalBidsWon,
      total_rents: entry.totalRents,
      best_combo_multiplier: entry.bestComboMultiplier,
      rounds_played: entry.roundsPlayed,
      rounds_won: entry.roundsWon,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id' },
  )
}
