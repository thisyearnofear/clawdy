'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '../services/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Real-time player presence using Supabase Presence channels.
 * Replaces the polling-based heartbeat system.
 * Falls back to the existing /api/players endpoint if Supabase is not configured.
 */
export function useRealtimePresence(playerId: string) {
  const [onlineCount, setOnlineCount] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!playerId) return
    const supabase = getSupabase()
    if (!supabase) return

    const channel = supabase.channel('game-presence', {
      config: { presence: { key: playerId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setOnlineCount(Object.keys(state).length)
      })
      .on('presence', { event: 'join' }, () => {
        const state = channel.presenceState()
        setOnlineCount(Object.keys(state).length)
      })
      .on('presence', { event: 'leave' }, () => {
        const state = channel.presenceState()
        setOnlineCount(Object.keys(state).length)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            player_id: playerId,
            online_at: new Date().toISOString(),
          })
        }
      })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [playerId])

  return onlineCount
}
