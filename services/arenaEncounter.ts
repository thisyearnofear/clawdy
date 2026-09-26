import type { CollectorStrategy } from './arenaPolicy'
import {
  type SpecializationFocus,
  emptyFocusVector,
  focusVectorFromExamples,
  houseFocusVector,
  type FocusVector,
  topFocusLabels,
} from './coachingEngine'
import type { ArenaPosition, ArenaSnapshot } from './arenaEpisode'

/** Horizontal distance (XZ) at which a clash can fire. */
export const ENCOUNTER_TRIGGER_DISTANCE = 1.65

/** Minimum ticks between clashes in one episode. */
export const ENCOUNTER_COOLDOWN_TICKS = 280

/** Ignore the opening scramble. */
export const ENCOUNTER_MIN_TICK = 80

/** How long the loser is action-locked after a clash. */
export const ENCOUNTER_STAGGER_TICKS = 24

/** Rock–paper–scissors among specializations (attacker key beats value). */
export const FOCUS_BEATS: Record<SpecializationFocus, SpecializationFocus> = {
  weather: 'contest',
  contest: 'banking',
  banking: 'collection',
  collection: 'energy',
  energy: 'weather',
}

export type EncounterContext = {
  flooded: boolean
  championCargo: number
  rivalCargo: number
}

export type EncounterResolution = {
  winnerId: 'champion' | 'rival'
  loserId: 'champion' | 'rival'
  reason: string
  /** Transfer up to one cargo unit from loser → winner when possible. */
  transferCargo: boolean
  championScore: number
  rivalScore: number
  championFocus: FocusVector
  rivalFocus: FocusVector
}

export function horizontalDistance(a: ArenaPosition, b: ArenaPosition): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2])
}

export function agentsWithinEncounterRange(episode: ArenaSnapshot): boolean {
  const champion = episode.agents.find(agent => agent.id === 'champion')
  const rival = episode.agents.find(agent => agent.id === 'rival')
  if (!champion || !rival) return false
  return horizontalDistance(champion.position, rival.position) <= ENCOUNTER_TRIGGER_DISTANCE
}

export function shouldOfferEncounter(args: {
  phaseRunning: boolean
  episode: ArenaSnapshot
  lastEncounterTick: number | null
}): boolean {
  if (!args.phaseRunning) return false
  if (args.episode.status !== 'running') return false
  if (args.episode.tick < ENCOUNTER_MIN_TICK) return false
  if (args.lastEncounterTick !== null && args.episode.tick - args.lastEncounterTick < ENCOUNTER_COOLDOWN_TICKS) {
    return false
  }
  return agentsWithinEncounterRange(args.episode)
}

function encounterScore(self: FocusVector, foe: FocusVector, flooded: boolean): number {
  let score = 0
  for (const key of Object.keys(self) as SpecializationFocus[]) {
    score += self[key]
    const beaten = FOCUS_BEATS[key]
    score += self[key] * foe[beaten] * 1.35
  }
  if (flooded) score += self.weather * 0.45 + self.energy * 0.2
  return score
}

/**
 * Rules own the outcome. Presentation (overlay / feed) is separate.
 * Ties break toward the agent currently carrying less cargo (underdog contest).
 */
export function resolveEncounter(
  championFocus: FocusVector,
  rivalFocus: FocusVector,
  context: EncounterContext,
): EncounterResolution {
  const championScore = encounterScore(championFocus, rivalFocus, context.flooded)
  const rivalScore = encounterScore(rivalFocus, championFocus, context.flooded)
  let winnerId: 'champion' | 'rival'
  if (Math.abs(championScore - rivalScore) < 1e-6) {
    winnerId = context.championCargo <= context.rivalCargo ? 'champion' : 'rival'
  } else {
    winnerId = championScore > rivalScore ? 'champion' : 'rival'
  }
  const loserId = winnerId === 'champion' ? 'rival' : 'champion'
  const winnerFocus = winnerId === 'champion' ? championFocus : rivalFocus
  const top = topFocusLabels(winnerFocus, 1)[0] ?? 'general play'
  const floodedNote = context.flooded ? ' in the flood' : ''
  const loserHasCargo = loserId === 'champion' ? context.championCargo > 0 : context.rivalCargo > 0
  return {
    winnerId,
    loserId,
    reason: `${winnerId === 'champion' ? 'You' : 'Rival'} win${winnerId === 'champion' ? '' : 's'} the clash${floodedNote} — ${top} edged it.`,
    transferCargo: loserHasCargo,
    championScore,
    rivalScore,
    championFocus,
    rivalFocus,
  }
}

export function focusVectorForChampion(
  examples: ReadonlyArray<{ rationale: string; preferredAction: { type: string }; approved?: boolean }>,
): FocusVector {
  const fromExamples = focusVectorFromExamples(examples)
  const mass = Object.values(fromExamples).reduce((sum, value) => sum + value, 0)
  if (mass > 0) return fromExamples
  return houseFocusVector('safe')
}

export function focusVectorForRival(strategy: CollectorStrategy): FocusVector {
  return houseFocusVector(strategy)
}

export function fingerprintLine(vector: FocusVector): string {
  const labels = topFocusLabels(vector, 2)
  if (labels.length === 0) return 'No focus yet — coach to specialize'
  if (labels.length === 1) return `Focus · ${labels[0]}`
  return `Focus · ${labels[0]} · ${labels[1]}`
}

export function emptyEncounterFocus(): FocusVector {
  return emptyFocusVector()
}
