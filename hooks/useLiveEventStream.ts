'use client'

import { useEffect, useState, useCallback } from 'react'
import { subscribeToLiveEvents } from '../services/gameEvents'

export interface LiveEvent {
  event: string
  playerId?: string
  message?: string
  ts: number
}

/**
 * Subscribes to live game events via Supabase Broadcast.
 * Returns the most recent events (capped at maxEvents).
 */
export function useLiveEventStream(maxEvents = 20) {
  const [events, setEvents] = useState<LiveEvent[]>([])

  const handleEvent = useCallback((evt: { event: string; payload: Record<string, unknown> }) => {
    setEvents(prev => {
      const next: LiveEvent = {
        event: evt.event,
        playerId: evt.payload.playerId as string | undefined,
        message: evt.payload.message as string | undefined,
        ts: (evt.payload.ts as number) ?? Date.now(),
      }
      return [next, ...prev].slice(0, maxEvents)
    })
  }, [maxEvents])

  useEffect(() => {
    const unsub = subscribeToLiveEvents(handleEvent)
    return unsub
  }, [handleEvent])

  return events
}
