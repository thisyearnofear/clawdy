import { describe, expect, it } from 'vitest'
import { ROVER_PHYSICS } from '../arenaPhysics'
import { ARENA_RULES, DEFAULT_RUSH_RULES, type ArenaScenario } from '../arenaEpisode'
import { ArenaRunner, runArenaEpisode } from '../arenaPolicy'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'
import {
  ACTIVE_AXES, CHASSIS_BASE, CHASSIS_IDS, CHASSIS_TOTAL, DEFAULT_BUILD, STAT_AXES, STAT_BUDGET,
  MAX_TRAVEL_SPEED, baseBuild, budgetSpent, buildToObservation, buildToTraits, describeBuild, validateBuild,
} from '../chassis'

const base = PRACTICE_SCENARIOS[0]

function withTraits(scenario: ArenaScenario, traits: ArenaScenario['entrants'][number]['traits'][]): ArenaScenario {
  return { ...scenario, entrants: scenario.entrants.map((entrant, index) => ({ ...entrant, traits: traits[index] })) }
}

function stripTraits<T extends { agents: { traits?: unknown }[] }>(snapshot: T) {
  return JSON.parse(JSON.stringify({ ...snapshot, agents: snapshot.agents.map(agent => { const copy: Record<string, unknown> = { ...agent }; delete copy.traits; return copy }) }))
}

describe('chassis builds', () => {
  it('gives every chassis the same base total', () => {
    for (const id of CHASSIS_IDS) {
      expect(STAT_AXES.reduce((sum, axis) => sum + CHASSIS_BASE[id][axis], 0)).toBe(CHASSIS_TOTAL)
      expect(validateBuild(baseBuild(id))).toEqual([])
    }
  })

  it('resolves the default build to the pinned rules', () => {
    expect(buildToTraits(DEFAULT_BUILD as never)).toEqual({
      travelSpeed: 1, maxEnergy: ARENA_RULES.initialEnergy, contactStrength: 0,
    })
  })

  it('rejects over-budget, out-of-range and malformed builds', () => {
    const over = baseBuild('hauler')
    over.points.speed += STAT_BUDGET + 1
    expect(validateBuild(over).join()).toMatch(/budget/)
    expect(() => buildToTraits(over)).toThrow(/Invalid build/)
    expect(validateBuild({ ...baseBuild('scout'), points: { ...baseBuild('scout').points, speed: 7 } }).join()).toMatch(/speed/)
    expect(validateBuild({ ...baseBuild('scout'), modules: ['armour', 'ram-plate', 'wide-sensor'] }).join()).toMatch(/at most/)
    expect(validateBuild({ ...baseBuild('scout'), modules: ['armour', 'armour'] }).join()).toMatch(/duplicate/)
  })

  it('charges escalating cost per axis and refunds points taken below base', () => {
    const cheap = baseBuild('hauler')
    cheap.points.speed += 1
    cheap.points.attack += 1
    cheap.points.defence += 1
    expect(budgetSpent(cheap)).toBe(3)
    expect(validateBuild(cheap)).toEqual([])
    const concentrated = baseBuild('hauler')
    concentrated.points.speed += 3 // costs 6, not 3
    expect(budgetSpent(concentrated)).toBe(6)
    // Flat cap is the only thing validateBuild enforces; the escalating curve
    // is the match authority's budgetSpent gate (league publish/race paths).
    expect(validateBuild(concentrated)).toEqual([])
    expect(budgetSpent(concentrated)).toBeGreaterThan(STAT_BUDGET)
    concentrated.points.navigation -= 2 // refund 2 -> net 4, still over
    expect(budgetSpent(concentrated)).toBe(4)
    expect(budgetSpent(concentrated)).toBeGreaterThan(STAT_BUDGET)
    concentrated.points.hardiness -= 1 // refund 1 -> net 3
    expect(budgetSpent(concentrated)).toBe(3)
    expect(validateBuild(concentrated)).toEqual([])
  })

  it('makes the chassis genuinely different, with no strictly dominant one', () => {
    const scout = buildToTraits(baseBuild('scout'))
    const hauler = buildToTraits(baseBuild('hauler'))
    const raider = buildToTraits(baseBuild('raider'))
    expect(scout.travelSpeed).toBeGreaterThan(hauler.travelSpeed)
    expect(scout.maxEnergy).toBeLessThan(hauler.maxEnergy)
    expect(raider.contactStrength).toBeGreaterThan(hauler.contactStrength)
    expect(hauler.maxEnergy).toBeGreaterThan(raider.maxEnergy)
    expect(scout.contactStrength).toBeLessThan(0)
  })

  it('exposes a normalised observation vector and a readable summary', () => {
    const vector = buildToObservation(baseBuild('scout'))
    expect(vector).toHaveLength(STAT_AXES.length)
    expect(vector.every(value => value >= 0 && value <= 1)).toBe(true)
    expect(describeBuild(baseBuild('scout'))).toMatch(/faster/)
    expect(describeBuild(DEFAULT_BUILD as never)).toBe('balanced hauler baseline')
    expect(ACTIVE_AXES).not.toContain('navigation')
  })
})

describe('speed headroom', () => {
  it('never asks the physics controller for more than it can deliver', () => {
    expect(ROVER_PHYSICS.maxSpeed).toBe(2.4)
    expect(MAX_TRAVEL_SPEED * 1.8).toBeLessThanOrEqual(ROVER_PHYSICS.maxSpeed)
    for (const id of CHASSIS_IDS) {
      const maxed = baseBuild(id)
      maxed.points.speed = 6
      expect(buildToTraits({ ...maxed, points: { ...maxed.points, speed: 6, navigation: 0, hardiness: 0 } }).travelSpeed).toBeLessThanOrEqual(MAX_TRAVEL_SPEED)
    }
  })
})

describe('entrant traits in the episode', () => {
  const ids = base.entrants.map(entrant => entrant.id)
  const strat = Object.fromEntries(ids.map((id, index) => [id, index === 0 ? 'safe' : 'greedy'])) as Record<string, 'safe' | 'greedy'>

  it('is byte-identical when the traits are the default build', () => {
    const plain = runArenaEpisode(base, strat)
    const identity = buildToTraits(DEFAULT_BUILD as never)
    const traited = runArenaEpisode(withTraits(base, [identity, identity]), strat)
    expect(stripTraits(traited.final)).toEqual(stripTraits(plain.final))
  })

  it('is byte-identical in Rush contact when the traits are the default build', () => {
    const rush = { ...base, rush: DEFAULT_RUSH_RULES }
    const plain = runArenaEpisode(rush, strat)
    const identity = buildToTraits(DEFAULT_BUILD as never)
    const traited = runArenaEpisode(withTraits(rush, [identity, identity]), strat)
    expect(stripTraits(traited.final)).toEqual(stripTraits(plain.final))
  })

  it('starts with the chassis battery and never regenerates above it', () => {
    const scoutTraits = buildToTraits(baseBuild('scout'))
    const scenario = withTraits(base, [scoutTraits, undefined])
    const { final } = runArenaEpisode(scenario, strat)
    const first = final.agents.find(agent => agent.id === ids[0])!
    expect(first.energy).toBeLessThanOrEqual(scoutTraits.maxEnergy)
    expect(scoutTraits.maxEnergy).toBeLessThan(ARENA_RULES.initialEnergy)
  })

  it('moves a faster chassis farther in the same number of ticks', () => {
    const fast = buildToTraits(baseBuild('scout'))
    const distanceAfter = (scenario: ArenaScenario, ticks: number) => {
      const runner = new ArenaRunner(scenario, strat)
      runner.advanceTicks(ticks)
      const agent = runner.snapshot().agents[0]
      const start = scenario.nodes.find(node => node.id === scenario.entrants[0].baseNode)!.position
      return Math.hypot(agent.position[0] - start[0], agent.position[2] - start[2])
    }
    const slow = distanceAfter(base, 40)
    const quick = distanceAfter(withTraits(base, [fast, undefined]), 40)
    expect(slow).toBeGreaterThan(0)
    expect(quick).toBeGreaterThan(slow)
    expect(runArenaEpisode(withTraits(base, [fast, fast]), strat).replay.scenario.entrants[0].traits).toEqual(fast)
  })

  it('rejects out-of-range traits at scenario validation', () => {
    const bad = withTraits(base, [{ travelSpeed: 9, maxEnergy: 12, contactStrength: 0 }, undefined])
    expect(() => runArenaEpisode(bad, strat)).toThrow(/entrant traits/)
  })
})

describe('skirmish travel lead', () => {
  it('applies Hauler speed cost and Raider speed buff only under skirmish', () => {
    const hauler = buildToTraits(baseBuild('hauler'))
    const raider = buildToTraits(baseBuild('raider'))
    expect(buildToTraits(baseBuild('hauler'), 'skirmish').travelSpeed).toBeCloseTo(hauler.travelSpeed - 0.08, 5)
    expect(buildToTraits(baseBuild('raider'), 'skirmish').travelSpeed).toBeCloseTo(raider.travelSpeed + 0.04, 5)
    expect(buildToTraits(baseBuild('scout'), 'skirmish').travelSpeed).toBe(buildToTraits(baseBuild('scout')).travelSpeed)
  })
})
