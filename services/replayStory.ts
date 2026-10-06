import { ARENA_RULES, type ArenaRecording } from './arenaEpisode'
import { summarizeReplayMarkers, type ReplayMarker } from './replayMarkers'

/**
 * Replay story: turns the attribution markers (`services/replayMarkers.ts`)
 * into plain-language moments a viewer can read and jump to, so "why did my
 * rover lose" is answered on the scrubber instead of by hunting through 240
 * checkpoints. Pure: the same recording and options give the same story, and
 * nothing here reads or changes the sim.
 */

export type StoryTone = 'good' | 'bad' | 'neutral'
export type StoryKind = 'bump' | 'battery-out' | 'recovery' | 'bank'

export interface StoryMoment {
  tick: number
  /** Checkpoint index to seek to (the first checkpoint at or after `tick`). */
  frame: number
  kind: StoryKind
  text: string
  tone: StoryTone
}

export interface StoryOptions {
  /** The entrant the viewer is coaching, if any. Absent = third person (a shared replay). */
  you?: string
  /** Display name per entrant slot id. */
  names: Record<string, string>
}

/** More than this and the list stops being a summary. Rarer, more decisive moments win. */
export const MAX_STORY_MOMENTS = 12

/** A caption stays on screen this long after its moment (1.5 s at the pinned 50 ms tick). */
export const CAPTION_WINDOW_TICKS = Math.round(1500 / ARENA_RULES.stepMs)

const PRIORITY: Record<StoryKind, number> = { bump: 0, 'battery-out': 1, recovery: 2, bank: 3 }

export function frameForTick(recording: ArenaRecording, tick: number): number {
  const index = recording.checkpoints.findIndex(checkpoint => checkpoint.state.tick >= tick)
  return index === -1 ? Math.max(0, recording.checkpoints.length - 1) : index
}

function number(note: string | undefined, pattern: RegExp): number | null {
  const match = note ? pattern.exec(note) : null
  return match ? Number(match[1]) : null
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function momentFor(marker: ReplayMarker, recording: ArenaRecording, options: StoryOptions): Omit<StoryMoment, 'frame'> | null {
  const { you, names } = options
  const name = (id: string) => names[id] ?? id
  // "You" as the subject, a name otherwise; "you" as the object, a name otherwise.
  const subject = (id: string) => (id === you ? 'You' : capitalise(name(id)))
  const object = (id: string) => (id === you ? 'you' : name(id))
  const id = marker.agentId
  if (!id) return null

  switch (marker.type) {
    case 'bump': {
      // The marker's agent is the loser; the winner is the other slot.
      const winner = recording.scenario.entrants.find(entrant => entrant.id !== id)?.id
      if (!winner) return null
      const stolen = number(marker.note, /stole (\d+) cargo/) ?? 0
      const took = stolen > 0 ? ` and took ${stolen} cargo` : ''
      return {
        tick: marker.tick,
        kind: 'bump',
        text: id === you
          ? `${subject(winner)} bumped you${took}. You were staggered`
          : `${subject(winner)} bumped ${object(id)}${took}`,
        tone: id === you ? 'bad' : winner === you ? 'good' : 'neutral',
      }
    }
    case 'battery-out':
      return { tick: marker.tick, kind: 'battery-out', text: `${subject(id)} ran out of energy`, tone: id === you ? 'bad' : 'neutral' }
    case 'recovery':
      return { tick: marker.tick, kind: 'recovery', text: `${subject(id)} got stuck and recovered`, tone: id === you ? 'bad' : 'neutral' }
    case 'bank': {
      const amount = number(marker.note, /banked (\d+)/)
      if (amount === null) return null
      return { tick: marker.tick, kind: 'bank', text: `${subject(id)} banked ${amount}`, tone: id === you ? 'good' : 'neutral' }
    }
    default:
      // core-spawn and any future event type are not story moments.
      return null
  }
}

const cache = new WeakMap<ArenaRecording, Map<string, StoryMoment[]>>()

/** The moments of a recording, chronological, capped at `MAX_STORY_MOMENTS`. */
export function buildReplayStory(recording: ArenaRecording, options: StoryOptions): StoryMoment[] {
  const key = JSON.stringify([options.you ?? null, options.names])
  const hit = cache.get(recording)?.get(key)
  if (hit) return hit

  const moments: StoryMoment[] = []
  for (const marker of summarizeReplayMarkers(recording)) {
    const moment = momentFor(marker, recording, options)
    if (moment) moments.push({ ...moment, frame: frameForTick(recording, moment.tick) })
  }
  const story = moments
    .map((moment, order) => ({ moment, order }))
    .sort((a, b) => PRIORITY[a.moment.kind] - PRIORITY[b.moment.kind] || a.order - b.order)
    .slice(0, MAX_STORY_MOMENTS)
    .map(({ moment }) => moment)
    .sort((a, b) => a.tick - b.tick)

  const perRecording = cache.get(recording) ?? new Map<string, StoryMoment[]>()
  perRecording.set(key, story)
  cache.set(recording, perRecording)
  return story
}

/** The caption to show at `tick`: the latest moment that just happened, if any. */
export function captionAt(story: StoryMoment[], tick: number): StoryMoment | null {
  let current: StoryMoment | null = null
  for (const moment of story) {
    if (moment.tick > tick) break
    if (tick - moment.tick <= CAPTION_WINDOW_TICKS) current = moment
  }
  return current
}
