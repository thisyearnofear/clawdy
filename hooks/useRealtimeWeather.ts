'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

export interface RealtimeWeatherState {
  preset: string
  agent_id: string | null
  amount: number
  expires_at: string | null
  updated_at: string
}

/**
 * Real-time weather state: subscribes to weather_state table changes.
 * Replaces the on-chain weather polling for instant weather sync.
 */
export function useRealtimeWeather() {
  const [weather, setWeather] = useState<RealtimeWeatherState | null>(null)

  useEffect(() => {
    if (!supabase) return

    // Initial fetch
    const fetchWeather = async () => {
      const { data } = await supabase!
        .from('weather_state')
        .select('*')
        .eq('id', 1)
        .single()
      if (data) setWeather(data)
    }
    fetchWeather()

    // Real-time subscription
    const channel = supabase
      .channel('weather-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'weather_state', filter: 'id=eq.1' },
        (payload) => {
          if (payload.new) setWeather(payload.new as RealtimeWeatherState)
        },
      )
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [])

  return weather
}

/**
 * Update the weather state (called when a weather auction is won).
 */
export async function updateWeatherState(state: {
  preset: string
  agentId?: string
  amount?: number
  expiresAt?: string
}) {
  if (!supabase) return

  await supabase.from('weather_state').update({
    preset: state.preset,
    agent_id: state.agentId,
    amount: state.amount,
    expires_at: state.expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)
}
