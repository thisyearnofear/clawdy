import { describe, expect, it } from 'vitest'
import { ArenaEpisode, capacityOf } from '../arenaEpisode'
import { replayArenaEpisode } from '../arenaReplay'
import type { ArenaCourse } from '../arenaCourse'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'
import { baseBuild } from '../chassis'
import { chassisRuleSummary, courseForRuleset, leagueBrainId, skirmishDisclosure } from '../workbenchRuleset'

const course: ArenaCourse = {
  scenario: structuredClone(PRACTICE_SCENARIOS[0]),
  config: { id: 'test', name: 'Test', terrain: { url: '/test.glb', sha256: 'test' } },
  center: [0, 0, 0],
  floodZones: [],
}

describe('workbench rulesets', () => {
  it('offers skip to every locked player (arena-first) and never removes unlocked access', () => {
    // First visit is no longer gated behind finishing a lesson.
    expect(skirmishDisclosure({ unlocked: false, hasCompletedRun: false, hasOwnBrain: false })).toEqual({ canSelect: false, canSkip: true })
    expect(skirmishDisclosure({ unlocked: false, hasCompletedRun: true, hasOwnBrain: false }).canSkip).toBe(true)
    expect(skirmishDisclosure({ unlocked: false, hasCompletedRun: false, hasOwnBrain: true }).canSkip).toBe(true)
    expect(skirmishDisclosure({ unlocked: true, hasCompletedRun: false, hasOwnBrain: false })).toEqual({ canSelect: true, canSkip: false })
  })

  it('keeps existing league ids and creates separate Skirmish identities', () => {
    expect(leagueBrainId('brain-1')).toBe('brain-1')
    expect(leagueBrainId('brain-1', 'skirmish')).toBe('brain-1::skirmish')
  })

  it('returns the original Training Grounds course without changing its pinned scenario', () => {
    const before = structuredClone(course)
    expect(courseForRuleset(course, baseBuild('raider'))).toBe(course)
    expect(course).toEqual(before)
  })

  it.each(['hauler', 'raider', 'scout'] as const)('applies the %s build and tags a cloned Skirmish scenario', chassis => {
    const before = structuredClone(course)
    const next = courseForRuleset(course, baseBuild(chassis), 'skirmish')
    const champion = next.scenario.entrants.find(entrant => entrant.id === 'champion')!
    const rival = next.scenario.entrants.find(entrant => entrant.id === 'rival')!
    expect(next.scenario.rulesetId).toBe('skirmish')
    expect(next.scenario.id).toBe(`${course.scenario.id}.skirmish`)
    expect(next.scenario.split).toBe(course.scenario.split)
    expect(capacityOf(champion)).toBe(chassis === 'hauler' ? 4 : 3)
    expect(champion.traits?.stealAll).toBe(chassis === 'raider' ? true : undefined)
    expect(champion.traits?.visionHops).toBe(chassis === 'scout' ? 2 : undefined)
    expect(capacityOf(rival)).toBe(3)
    expect(rival.traits?.stealAll).toBeUndefined()
    expect(course).toEqual(before)
  })

  it('round-trips the tagged preview and its entrant traits through replay', () => {
    const next = courseForRuleset(course, baseBuild('raider'), 'skirmish')
    const episode = new ArenaEpisode(next.scenario)
    for (let tick = 0; tick < 20; tick++) episode.step()
    const recording = JSON.parse(JSON.stringify(episode.recording()))
    expect(recording.scenario.rulesetId).toBe('skirmish')
    expect(replayArenaEpisode(recording).divergedAt).toBeNull()
    expect(replayArenaEpisode(recording).final).toEqual(episode.snapshot())
  })

  it('derives honest perk labels from the engine traits', () => {
    expect(chassisRuleSummary('hauler', 'skirmish')).toContain('4 cargo')
    expect(chassisRuleSummary('raider', 'skirmish')).toContain('limited by free cargo space')
    expect(chassisRuleSummary('scout', 'skirmish')).toContain('two route hops')
    for (const chassis of ['hauler', 'raider', 'scout'] as const) {
      expect(chassisRuleSummary(chassis)).toContain('3 cargo')
      expect(chassisRuleSummary(chassis)).toContain('No signature perk')
    }
  })
})
