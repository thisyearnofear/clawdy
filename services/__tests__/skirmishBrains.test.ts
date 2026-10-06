import { describe, expect, it } from 'vitest'
import { baseBuild, buildToTraits, CHASSIS_IDS } from '../chassis'
import { ArenaRunner } from '../arenaPolicy'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'
import { SKIRMISH_HOUSE_BRAINS, brainForRuleset, isSkirmishHouseBrain } from '../skirmishBrains'
import { SEASON_0_STARTER_CHECKPOINT, isBundledStarter } from '../starterCheckpoint'

describe('skirmish house brains', () => {
  it('swaps house brains by ruleset and chassis, never a player brain', () => {
    for (const id of CHASSIS_IDS) {
      const brain = brainForRuleset(SEASON_0_STARTER_CHECKPOINT, id, 'skirmish')
      expect(brain).toBe(SKIRMISH_HOUSE_BRAINS[id])
      expect(isSkirmishHouseBrain(brain)).toBe(true)
      expect(isBundledStarter(brain)).toBe(true)
      expect(brainForRuleset(brain, id, undefined)).toBe(SEASON_0_STARTER_CHECKPOINT)
    }
    const own = { ...SEASON_0_STARTER_CHECKPOINT, id: 'player-brain' }
    expect(brainForRuleset(own, 'raider', 'skirmish')).toBe(own)
  })

  it('plays a full Skirmish match with each brain and its own build', () => {
    for (const id of CHASSIS_IDS) {
      const base = PRACTICE_SCENARIOS[0]
      const scenario = { ...base, rulesetId: 'skirmish', entrants: base.entrants.map((e, i) => ({ ...e, traits: i === 0 ? buildToTraits(baseBuild(id), 'skirmish') : undefined })) }
      const runner = new ArenaRunner(scenario, { champion: { strategy: 'learned', checkpoint: SKIRMISH_HOUSE_BRAINS[id] }, rival: 'safe' }, undefined, { record: false })
      runner.advanceTicks(scenario.durationTicks)
      expect(runner.snapshot().status).toBe('finished')
    }
  })
})
