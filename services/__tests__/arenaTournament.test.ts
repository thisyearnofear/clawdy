import { describe, expect, it } from 'vitest'
import type { ArenaScenario } from '../arenaEpisode'
import { createTournament, nextPendingMatch, runTournament, runTournamentMatch, type TournamentEntrant } from '../arenaTournament'

function scenario(): ArenaScenario {
  return {
    id: 'tournament-course',
    worldVersion: 'fixture-v1',
    split: 'evaluation',
    seed: 12,
    durationTicks: 200,
    nodes: [
      { id: 'west', position: [-4, 0, 0] },
      { id: 'east', position: [4, 0, 0] },
      { id: 'ridge', position: [0, 3, 4] },
      { id: 'field', position: [0, 0, 0] },
    ],
    edges: [
      { id: 'west-low', from: 'west', to: 'field', travelTicks: 5, floodable: true },
      { id: 'east-low', from: 'east', to: 'field', travelTicks: 5, floodable: true },
      { id: 'west-high', from: 'west', to: 'ridge', travelTicks: 7, floodable: false },
      { id: 'east-high', from: 'east', to: 'ridge', travelTicks: 7, floodable: false },
      { id: 'ridge-field', from: 'ridge', to: 'field', travelTicks: 7, floodable: false },
    ],
    entrants: [
      { id: 'champion', baseNode: 'west', policyVersion: 'safe-v1' },
      { id: 'rival', baseNode: 'east', policyVersion: 'greedy-v1' },
    ],
    resources: Array.from({ length: 6 }, (_, index) => ({ id: `core-${index}`, nodeId: 'field', value: 1 })),
    floods: [{ startTick: 40, endTick: 80 }],
  }
}

const field: TournamentEntrant[] = [
  { id: 'you', name: 'You', policy: 'safe', policyVersion: 'baseline.safe.v2' },
  { id: 'careful', name: 'Careful', policy: 'safe', policyVersion: 'baseline.safe.v2' },
  { id: 'greedy', name: 'Greedy', policy: 'greedy', policyVersion: 'baseline.greedy.v2' },
  { id: 'weather', name: 'Weather', policy: 'weather', policyVersion: 'baseline.weather.v2' },
]

describe('single-elimination tournament bracket', () => {
  it('seeds a deterministic bracket from entrants and seed', () => {
    const a = createTournament(field, 7)
    const b = createTournament(field, 7)
    expect(a).toEqual(b)
    expect(a.rounds).toHaveLength(2)
    expect(a.rounds[0]).toHaveLength(2)
    expect(a.rounds[1]).toHaveLength(1)
    const firstRoundIds = a.rounds[0].flatMap(match => [match.slotA, match.slotB]).sort()
    expect(firstRoundIds).toEqual(field.map(entrant => entrant.id).sort())
  })

  it('advances walkovers without running a match for odd fields', () => {
    const tournament = createTournament(field.slice(0, 3), 3)
    const bye = tournament.rounds[0].find(match => match.slotB === null)!
    expect(bye.status).toBe('done')
    expect(bye.winner).toBe(bye.slotA)
  })

  it('rejects invalid entrant lists', () => {
    expect(() => createTournament(field.slice(0, 1), 1)).toThrow('2-16')
    expect(() => createTournament([...field, { ...field[0], name: 'dup' }], 1)).toThrow('Duplicate')
    expect(() => createTournament([{ ...field[0], id: 'bad id!' }, field[1]], 1)).toThrow('identifier')
  })

  it('runs a full bracket with recordings, scores, and a champion', async () => {
    const tournament = createTournament(field, 5)
    const played: string[] = []
    await runTournament(tournament, scenario(), undefined, match => played.push(match.id))
    expect(played).toEqual(['r1m1', 'r1m2', 'r2m1'])
    expect(tournament.status).toBe('done')
    expect(tournament.champion).not.toBeNull()
    for (const match of tournament.rounds.flat()) {
      expect(match.status).toBe('done')
      expect(match.winner).not.toBeNull()
      expect(match.recording!.checkpoints.length).toBeGreaterThan(1)
      expect(match.recording!.finalTick).toBe(200)
      expect(Object.keys(match.banked).sort()).toEqual([match.slotA, match.slotB].sort())
    }
    // Every recorded match keeps the champion/rival slots the review UI expects.
    for (const match of tournament.rounds.flat()) {
      expect(match.recording!.scenario.entrants.map(entrant => entrant.id)).toEqual(['champion', 'rival'])
    }
  })

  it('produces identical results for identical seed and entrants', async () => {
    const a = createTournament(field, 11)
    const b = createTournament(field, 11)
    await runTournament(a, scenario())
    await runTournament(b, scenario())
    expect(a.rounds.map(round => round.map(match => match.winner))).toEqual(b.rounds.map(round => round.map(match => match.winner)))
    expect(a.champion).toBe(b.champion)
  })

  it('resolves draws deterministically instead of leaving a null winner', async () => {
    // Too short to collect and bank: both entrants finish with zero banked,
    // so the energy/slot tiebreak must still advance someone.
    const sprint: ArenaScenario = { ...scenario(), durationTicks: 10, floods: [] }
    const tournament = createTournament(field.slice(0, 2), 1)
    const match = nextPendingMatch(tournament)!
    runTournamentMatch(tournament, match, sprint)
    expect(match.banked).toEqual({ you: 0, careful: 0 })
    expect(match.winner).not.toBeNull()
    expect(tournament.champion).toBe(match.winner)
  })

  it('refuses to run a match before both slots are resolved', () => {
    const tournament = createTournament(field, 2)
    const final = tournament.rounds[1][0]
    expect(() => runTournamentMatch(tournament, final, scenario())).toThrow('not ready')
  })
})
