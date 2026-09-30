import { shouldOfferEncounter, shouldOfferSighting } from './arenaEncounter'
import type { ArenaScenario } from './arenaEpisode'
import type { ArenaMotion } from './arenaPhysics'
import { ArenaRunner, type EntrantPolicyOption } from './arenaPolicy'

/**
 * A predicted beat in the match ahead. The match is deterministic given its
 * scenario, entrant policies, and motion adapter, so the future is
 * computable: run a headless clone of the episode and record where the
 * presentation layer's own gating (contested ground / sightings / banks /
 * floods / rescues / finish) would fire.
 *
 * Proximity is presentation only. This clone never transfers cargo or
 * staggers an entrant: every outcome belongs to the same runner used by
 * live play and physical practice comparison. Approved notes cannot alter
 * the forecast or the frozen match. Moments remain advisory beats, never
 * scoring input.
 */
export type MatchMomentKind = 'clash' | 'sighting' | 'bank' | 'flood-on' | 'flood-off' | 'rescue' | 'finish'

export type MatchMoment = {
  tick: number
  kind: MatchMomentKind
  agentId?: string
}

/** How far ahead of a beat a skip should land so the run-up is watchable. */
export const MOMENT_LEAD_TICKS: Record<MatchMomentKind, number> = {
  clash: 25,
  sighting: 12,
  bank: 8,
  'flood-on': 15,
  'flood-off': 8,
  rescue: 12,
  finish: 0,
}

export const MOMENT_LABELS: Record<MatchMomentKind, string> = {
  clash: 'contested ground',
  sighting: 'sighting',
  bank: 'bank',
  'flood-on': 'flood',
  'flood-off': 'waters recede',
  rescue: 'rescue',
  finish: 'finish',
}

export function buildMatchTimeline(
  scenario: ArenaScenario,
  options: Record<string, EntrantPolicyOption>,
  createMotion: (() => ArenaMotion) | undefined,
): MatchMoment[] {
  const motion = createMotion?.()
  const moments: MatchMoment[] = []
  let lastEncounterTick: number | null = null
  let lastSightingTick: number | null = null
  let sightingCount = 0
  let lastFlooded = false
  const lastBanked: Record<string, number> = {}
  const lastRecoveries: Record<string, number> = {}
  try {
    const runner = new ArenaRunner(scenario, options, motion)
    lastFlooded = runner.peek().weather.flooded
    while (runner.peek().status !== 'finished') {
      runner.advanceTicks(1)
      const live = runner.peek()
      for (const agent of live.agents) {
        const banked = lastBanked[agent.id] ?? 0
        if (agent.banked > banked) {
          moments.push({ tick: live.tick, kind: 'bank', agentId: agent.id })
        }
        lastBanked[agent.id] = agent.banked
        const recoveries = lastRecoveries[agent.id] ?? 0
        if (agent.recoveries > recoveries) {
          moments.push({ tick: live.tick, kind: 'rescue', agentId: agent.id })
        }
        lastRecoveries[agent.id] = agent.recoveries
      }
      if (live.weather.flooded !== lastFlooded) {
        moments.push({ tick: live.tick, kind: live.weather.flooded ? 'flood-on' : 'flood-off' })
        lastFlooded = live.weather.flooded
      }
      // Same proximity gating the live overlay uses, without a score mutation:
      // contested-ground beats describe shared space, not combat or skill.
      // The runner alone determines the recorded trajectory.
      if (shouldOfferEncounter({ phaseRunning: true, episode: live, lastEncounterTick })) {
        lastEncounterTick = live.tick
        moments.push({ tick: live.tick, kind: 'clash' })
        continue
      }
      if (
        shouldOfferSighting({
          phaseRunning: true,
          episode: live,
          lastEncounterTick,
          lastSightingTick,
          sightingCount,
        })
      ) {
        lastSightingTick = live.tick
        sightingCount += 1
        moments.push({ tick: live.tick, kind: 'sighting' })
      }
    }
    moments.push({ tick: scenario.durationTicks, kind: 'finish' })
  } finally {
    motion?.dispose()
  }
  return moments
}

// Advisory proximity never applies a prize or changes the match authority.

/**
 * The next beat strictly after `tick`. `sinceLastClash` moments that fired
 * inside the sighting mute window are already filtered at build time; this
 * is a plain forward scan over a tick-sorted list.
 */
export function nextMomentAfter(moments: readonly MatchMoment[], tick: number): MatchMoment | null {
  return moments.find(moment => moment.tick > tick) ?? null
}
