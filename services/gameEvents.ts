import { getSupabase } from './supabase'
import { logger } from './logger'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface GameEvent {
  event: string
  playerId?: string
  payload?: Record<string, unknown>
}

// Shared persistent channel — created once and reused for all broadcasts
let _broadcastChannel: RealtimeChannel | null = null

function getBroadcastChannel(): RealtimeChannel | null {
  const supabase = getSupabase()
  if (!supabase) return null
  if (!_broadcastChannel) {
    _broadcastChannel = supabase.channel('live-events').subscribe()
  }
  return _broadcastChannel
}

/**
 * Persist a game event to Supabase (fire-and-forget).
 * Events are also broadcast via Supabase Realtime for live feeds.
 */
export function logGameEvent(evt: GameEvent) {
  const supabase = getSupabase()
  if (!supabase) return

  supabase
    .from('game_events')
    .insert({
      event: evt.event,
      player_id: evt.playerId ?? null,
      payload: evt.payload ?? {},
    })
    .then(({ error }) => {
      if (error) logger.debug('[gameEvents] insert failed:', error.message)
    })

  // Broadcast on the shared live channel for instant UI updates
  const channel = getBroadcastChannel()
  if (channel) {
    channel.send({
      type: 'broadcast',
      event: evt.event,
      payload: { playerId: evt.playerId, ...evt.payload, ts: Date.now() },
    })
  }
}

/**
 * Subscribe to live game events via Supabase Broadcast.
 * Returns an unsubscribe function.
 */
export function subscribeToLiveEvents(
  onEvent: (evt: { event: string; payload: Record<string, unknown> }) => void,
): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}

  const channel = supabase
    .channel('live-events')
    .on('broadcast', { event: '*' }, (msg) => {
      onEvent({ event: msg.event, payload: msg.payload as Record<string, unknown> })
    })
    .subscribe()

  return () => { channel.unsubscribe() }
}
