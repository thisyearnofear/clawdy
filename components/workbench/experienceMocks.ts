/**
 * UI-only contract fixtures for the Experience track.
 *
 * These deliberately do not import Dev A's unfinished backend. Keep the
 * shapes aligned with docs/adal/contracts.md; replace fixtures with real
 * queries/events when each service lands. Never show mock ratings as live.
 */

import type { ArenaSimEvent } from '../../services/arenaEpisode'

export type RushPresentationEvent = ArenaSimEvent

export interface LadderPreviewEntry {
  roverId: string
  name: string
  look: { accent: string }
  rating: number
  wins: number
  losses: number
  lastMatchAt: number | null
}

export interface TrainingPreviewStep {
  gen: number
  best: number
  mean: number
}

/** Illustration only; never submit these entries to a real ladder. */
export const LADDER_PREVIEW: readonly LadderPreviewEntry[] = [
  { roverId: 'preview-champion', name: 'Your champion', look: { accent: '#bce478' }, rating: 1210, wins: 5, losses: 2, lastMatchAt: null },
  { roverId: 'preview-rival', name: 'Copper Dash', look: { accent: '#efad68' }, rating: 1190, wins: 4, losses: 3, lastMatchAt: null },
]

/** Illustration only; the real training UI must consume trainES instead. */
export const TRAINING_PREVIEW: readonly TrainingPreviewStep[] = [
  { gen: 0, best: 10, mean: 7 },
  { gen: 1, best: 12, mean: 9 },
  { gen: 2, best: 13, mean: 10 },
  { gen: 3, best: 16, mean: 12 },
]

export const RUSH_EVENT_PREVIEW: readonly RushPresentationEvent[] = [
  { type: 'core_spawn', tick: 160, resourceId: 'mother-1', nodeId: 'arena-core', value: 3 },
  { type: 'bump', tick: 174, winnerId: 'champion', loserId: 'rival', position: [7, 0.5, 8], stolen: 1 },
]

/**
 * Return only events appended since the previous published snapshot.
 * On a reset or recording swap, the new log is treated as a fresh timeline.
 * Existing events are never re-fired on ordinary tick updates.
 */
export function newlyAppendedRushEvents(
  previous: readonly RushPresentationEvent[] | undefined,
  current: readonly RushPresentationEvent[] | undefined,
): readonly RushPresentationEvent[] {
  if (!current?.length) return []
  if (!previous?.length) return current
  const unchangedPrefix = previous.length <= current.length &&
    previous.every((event, index) => {
      const next = current[index]
      if (event.type !== next.type || event.tick !== next.tick) return false
      if (event.type === 'core_spawn' && next.type === 'core_spawn') {
        return event.resourceId === next.resourceId && event.nodeId === next.nodeId && event.value === next.value
      }
      if (event.type === 'bump' && next.type === 'bump') {
        return event.winnerId === next.winnerId && event.loserId === next.loserId &&
          event.stolen === next.stolen && event.position.every((value, axis) => value === next.position[axis])
      }
      return false
    })
  return unchangedPrefix ? current.slice(previous.length) : current
}

/** Show events crossed in a live frame, including ticks skipped by the HUD throttle. */
export function liveRushEvents(
  previous: readonly RushPresentationEvent[] | undefined,
  current: readonly RushPresentationEvent[] | undefined,
  previousTick: number,
  tick: number,
): readonly RushPresentationEvent[] {
  return newlyAppendedRushEvents(previous, current).filter(event => event.tick > previousTick && event.tick <= tick)
}
