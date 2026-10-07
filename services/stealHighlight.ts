import type { ArenaSimEvent } from './arenaEpisode'

/**
 * Steal-highlight MVP (presentation only).
 *
 * On a Raider full-load steal in Skirmish Clash — a bump that takes more than
 * the Season 0 single unit — build a short storyboard from recorded battle
 * facts and optionally overlay a stub/fal clip. Nothing here mutates the sim,
 * score, observations, or evaluation (docs/SCENES.md).
 */

/** Season 0 bumps steal at most 1; Raider steal-all can take a multi-unit load. */
export const FULL_LOAD_STEAL_MIN = 2

export type StealHighlightFacts = {
  tick: number
  winnerId: string
  loserId: string
  stolen: number
  position: [number, number, number]
}

export type StealStoryboardBeat = {
  id: string
  label: string
  line: string
}

export type StealStoryboard = {
  id: string
  title: string
  subtitle: string
  prompt: string
  audioPrompt: string
  beats: StealStoryboardBeat[]
  facts: StealHighlightFacts
}

export function isFullLoadSteal(
  event: { type: string; stolen?: number },
): boolean {
  return event.type === 'bump' && typeof event.stolen === 'number' && event.stolen >= FULL_LOAD_STEAL_MIN
}

/** Latest full-load steal after `afterTick` (exclusive), or null. Pure. */
export function detectFullLoadSteal(
  events: readonly ArenaSimEvent[] | undefined,
  afterTick = -1,
): StealHighlightFacts | null {
  if (!events?.length) return null
  let latest: StealHighlightFacts | null = null
  for (const event of events) {
    if (event.type !== 'bump') continue
    if (event.tick <= afterTick) continue
    if (!isFullLoadSteal(event)) continue
    if (!latest || event.tick >= latest.tick) {
      latest = {
        tick: event.tick,
        winnerId: event.winnerId,
        loserId: event.loserId,
        stolen: event.stolen,
        position: [event.position[0], event.position[1], event.position[2]],
      }
    }
  }
  return latest
}

function agentLabel(id: string): string {
  if (id === 'champion') return 'Your Raider'
  if (id === 'rival') return 'Rival'
  return id
}

function loserLabel(id: string): string {
  if (id === 'champion') return 'you'
  if (id === 'rival') return 'the rival'
  return id
}

/**
 * Compact storyboard rebuilt from recorded bump facts only.
 * Safe to call mid-match — does not read mutable sim objects.
 */
export function buildStealStoryboard(facts: StealHighlightFacts): StealStoryboard {
  const winner = agentLabel(facts.winnerId)
  const loser = loserLabel(facts.loserId)
  const cargoWord = facts.stolen === 1 ? 'core' : 'cores'
  const title = 'FULL-LOAD STEAL'
  const subtitle = `${winner} takes ${facts.stolen} ${cargoWord} at tick ${facts.tick}`
  const beats: StealStoryboardBeat[] = [
    {
      id: 'approach',
      label: 'Approach',
      line: `${winner} closes on ${loser} near the contested ground.`,
    },
    {
      id: 'impact',
      label: 'Impact',
      line: `Bump contact — Raider perk fires. Whole load transfers.`,
    },
    {
      id: 'transfer',
      label: 'Transfer',
      line: `+${facts.stolen} cargo ripped from ${loser}. Score already decided by the sim.`,
    },
    {
      id: 'stagger',
      label: 'Stagger',
      line: `${loser === 'you' ? 'You are' : 'They are'} staggered — highlight is presentation only.`,
    },
  ]

  const prompt = [
    'sun-baked sandstone basin arena, two small autonomous rovers',
    `${winner} rams ${loser} and steals a glowing full cargo load of ${facts.stolen} amber cores`,
    'dust kick, cargo lights flare on the winner, loser staggers',
    'cinematic documentary camera, readable, grounded, no text or HUD',
  ].join(', ')

  const audioPrompt =
    'Short impact thud, cargo chime, dust settle over desert wind; no spoken instructions.'

  return {
    id: `steal-${facts.tick}-${facts.winnerId}-${facts.stolen}`,
    title,
    subtitle,
    prompt,
    audioPrompt,
    beats,
    facts,
  }
}
