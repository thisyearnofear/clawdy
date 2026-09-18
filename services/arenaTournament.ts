import type { ArenaRecording, ArenaScenario } from './arenaEpisode'
import type { ArenaMotion } from './arenaPhysics'
import { ArenaRunner, type EntrantPolicyOption } from './arenaPolicy'

/**
 * Single-elimination tournament over the shared course.
 *
 * Each match runs a full recorded episode through `ArenaRunner`, so bracket
 * results carry the same authority and replay guarantees as a live match.
 * Matches keep the canonical `champion`/`rival` entrant ids (the "slots") so
 * review, coaching, camera, and rendering code work unchanged — the bracket
 * maps slots back to entrant identities. See docs/SCENES.md for how match
 * recordings feed the scene layer.
 */

export interface TournamentEntrant {
  id: string
  name: string
  policy: EntrantPolicyOption
  /** Recorded into the match scenario for audit; must satisfy the scenario identifier pattern. */
  policyVersion: string
}

export interface TournamentMatch {
  id: string
  round: number
  index: number
  slotA: string | null
  slotB: string | null
  status: 'pending' | 'done'
  /** Entrant id of the winner; never null once status is 'done' (walkovers and tiebreaks resolve). */
  winner: string | null
  banked: Record<string, number>
  recording?: ArenaRecording
}

export interface ArenaTournament {
  seed: number
  entrants: TournamentEntrant[]
  rounds: TournamentMatch[][]
  status: 'pending' | 'running' | 'done'
  champion: string | null
}

const MAX_ENTRANTS = 16

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value)
}

/** Deterministic PRNG (mulberry32) so a bracket is reproducible from its seed. */
function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createTournament(entrants: TournamentEntrant[], seed = 1): ArenaTournament {
  if (!Number.isSafeInteger(seed)) throw new Error('Tournament seed must be an integer')
  if (!Array.isArray(entrants) || entrants.length < 2 || entrants.length > MAX_ENTRANTS) {
    throw new Error(`Tournament requires 2-${MAX_ENTRANTS} entrants`)
  }
  if (new Set(entrants.map(entrant => entrant.id)).size !== entrants.length) throw new Error('Duplicate entrant id')
  for (const entrant of entrants) {
    if (!identifier(entrant.id) || !identifier(entrant.policyVersion)) {
      throw new Error(`Invalid entrant or policy identifier: ${entrant.id}`)
    }
  }

  // Seeded shuffle fixes the bracket: same entrants + seed → same pairings.
  const rng = mulberry32(seed)
  const seeds = entrants.map(entrant => entrant.id)
  for (let index = seeds.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1))
    ;[seeds[index], seeds[swap]] = [seeds[swap], seeds[index]]
  }

  const firstRound: TournamentMatch[] = []
  for (let index = 0; index < seeds.length; index += 2) {
    const slotA = seeds[index]
    const slotB = seeds[index + 1] ?? null
    firstRound.push({
      id: `r1m${firstRound.length + 1}`,
      round: 0,
      index: firstRound.length,
      slotA,
      slotB,
      // A missing opponent is a walkover — the entrant advances without a match.
      status: slotB === null ? 'done' : 'pending',
      winner: slotB === null ? slotA : null,
      banked: {},
    })
  }

  const rounds: TournamentMatch[][] = [firstRound]
  let count = firstRound.length
  while (count > 1) {
    const previous = rounds.at(-1)!
    count = Math.ceil(count / 2)
    const round: TournamentMatch[] = []
    for (let index = 0; index < count; index++) {
      // A match fed by a single feeder (odd feeder count) is a walkover.
      const bye = previous[index * 2 + 1] === undefined
      round.push({
        id: `r${rounds.length + 1}m${index + 1}`,
        round: rounds.length,
        index,
        slotA: null,
        slotB: null,
        status: bye ? 'done' : 'pending',
        winner: null,
        banked: {},
      })
    }
    rounds.push(round)
  }

  return { seed, entrants, rounds, status: 'pending', champion: null }
}

/** Propagate finished-match winners into the next round's slots. */
function propagate(tournament: ArenaTournament) {
  for (let round = 1; round < tournament.rounds.length; round++) {
    for (const match of tournament.rounds[round]) {
      const feederA = tournament.rounds[round - 1][match.index * 2]
      const feederB = tournament.rounds[round - 1][match.index * 2 + 1]
      if (match.slotA === null) match.slotA = feederA?.winner ?? null
      if (feederB !== undefined && match.slotB === null) match.slotB = feederB.winner ?? null
      // Walkover: no second feeder exists, so slotA advances when it arrives.
      if (match.status === 'done' && match.winner === null && match.slotA !== null) {
        match.winner = match.slotA
      }
    }
  }
  const final = tournament.rounds.at(-1)!.at(-1)!
  if (final.status === 'done' && final.winner !== null) {
    tournament.status = 'done'
    tournament.champion = final.winner
  }
}

/** The next runnable match — one with both entrants resolved. */
export function nextPendingMatch(tournament: ArenaTournament): TournamentMatch | null {
  propagate(tournament)
  for (const round of tournament.rounds) {
    for (const match of round) {
      if (match.status === 'pending' && match.slotA !== null && match.slotB !== null) return match
    }
  }
  return null
}

/**
 * Remap the base scenario's entrants onto the champion/rival slots. Sides
 * alternate by bracket position so neither entrant keeps a base advantage.
 */
function buildMatchScenario(base: ArenaScenario, a: TournamentEntrant, b: TournamentEntrant, swapSides: boolean): ArenaScenario {
  const scenario = structuredClone(base)
  const [champion, rival] = swapSides ? [b, a] : [a, b]
  const [baseA, baseB] = scenario.entrants.map(entrant => entrant.baseNode)
  scenario.entrants = [
    { ...scenario.entrants[0], id: 'champion', baseNode: baseA, policyVersion: champion.policyVersion },
    { ...scenario.entrants[1], id: 'rival', baseNode: baseB, policyVersion: rival.policyVersion },
  ]
  return scenario
}

/**
 * Deterministic tiebreak when banked totals tie: more remaining energy wins,
 * then the first-listed slot (the documented bracket-seed advantage).
 */
function resolveWinner(banked: [number, number], energy: [number, number], slotA: string, slotB: string): string {
  if (banked[0] !== banked[1]) return banked[0] > banked[1] ? slotA : slotB
  if (energy[0] !== energy[1]) return energy[0] > energy[1] ? slotA : slotB
  return slotA
}

/**
 * Run one bracket match to completion. Each match gets a fresh motion from
 * `createMotion` (disposed afterwards) so no physics state leaks between
 * matches; omitting it runs the route-only path used by isolated tests.
 */
export function runTournamentMatch(
  tournament: ArenaTournament,
  match: TournamentMatch,
  baseScenario: ArenaScenario,
  createMotion?: () => ArenaMotion,
): TournamentMatch {
  if (match.status !== 'pending' || match.slotA === null || match.slotB === null) {
    throw new Error(`Match ${match.id} is not ready to run`)
  }
  const entrantA = tournament.entrants.find(entrant => entrant.id === match.slotA)!
  const entrantB = tournament.entrants.find(entrant => entrant.id === match.slotB)!
  const swapSides = (match.round + match.index) % 2 === 1
  const scenario = buildMatchScenario(baseScenario, entrantA, entrantB, swapSides)
  const [champion, rival] = swapSides ? [entrantB, entrantA] : [entrantA, entrantB]

  const motion = createMotion?.()
  try {
    const runner = new ArenaRunner(scenario, { champion: champion.policy, rival: rival.policy }, motion)
    runner.advanceTicks(scenario.durationTicks)
    const final = runner.snapshot()
    const championState = final.agents.find(agent => agent.id === 'champion')!
    const rivalState = final.agents.find(agent => agent.id === 'rival')!
    match.banked = { [entrantA.id]: (swapSides ? rivalState : championState).banked, [entrantB.id]: (swapSides ? championState : rivalState).banked }
    const slotWinner = final.winner === 'champion' ? champion.id : final.winner === 'rival' ? rival.id : null
    match.winner = slotWinner ?? resolveWinner(
      [championState.banked, rivalState.banked],
      [championState.energy, rivalState.energy],
      champion.id,
      rival.id,
    )
    match.recording = runner.recording()
    match.status = 'done'
    propagate(tournament)
    return match
  } finally {
    motion?.dispose()
  }
}

/**
 * Run every pending match in order. Yields between matches so the UI can
 * report progress; `onMatch` fires after each completed match.
 */
export async function runTournament(
  tournament: ArenaTournament,
  baseScenario: ArenaScenario,
  createMotion?: () => ArenaMotion,
  onMatch?: (match: TournamentMatch) => void,
): Promise<ArenaTournament> {
  if (tournament.status === 'done') return tournament
  tournament.status = 'running'
  let match: TournamentMatch | null
  while ((match = nextPendingMatch(tournament)) !== null) {
    // Macrotask yield: lets the UI paint progress between synchronous matches.
    await new Promise(resolve => setTimeout(resolve, 0))
    runTournamentMatch(tournament, match, baseScenario, createMotion)
    onMatch?.(match)
  }
  return tournament
}
