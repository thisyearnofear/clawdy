import { describe, expect, it } from 'vitest'
import { ArenaEpisode, capacityOf, type ArenaScenario, type EntrantTraits } from '../arenaEpisode'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'

const base = PRACTICE_SCENARIOS[0]
const T = (extra: Partial<EntrantTraits>): EntrantTraits => ({ travelSpeed: 1, maxEnergy: 12, contactStrength: 0, ...extra })
const withTraits = (traits: (EntrantTraits | undefined)[]): ArenaScenario => ({
  ...base, entrants: base.entrants.map((e, i) => ({ ...e, traits: traits[i] })),
})

describe('skirmish traits', () => {
  it('defaults capacity to the pinned rules', () => {
    expect(capacityOf({})).toBe(3)
    expect(capacityOf({ traits: T({ capacity: 5 }) })).toBe(5)
  })

  it('rejects out-of-range capacity and vision', () => {
    expect(() => new ArenaEpisode(withTraits([T({ capacity: 0 }), undefined]))).toThrow()
    expect(() => new ArenaEpisode(withTraits([T({ visionHops: 4 }), undefined]))).toThrow()
  })

  it('two-hop vision reveals strictly more nodes than one hop', () => {
    const one = new ArenaEpisode(withTraits([undefined, undefined]))
    const two = new ArenaEpisode(withTraits([T({ visionHops: 2 }), undefined]))
    const id = base.entrants[0].id
    const v1 = one.observe(id).fog.visible
    const v2 = two.observe(id).fog.visible
    expect(v2.length).toBeGreaterThan(v1.length)
    for (const n of v1) expect(v2).toContain(n)
  })

  it('exposes capacity to the observing agent via self.traits', () => {
    const ep = new ArenaEpisode(withTraits([T({ capacity: 5 }), undefined]))
    expect(ep.observe(base.entrants[0].id).self.traits?.capacity).toBe(5)
  })
})

describe('skirmish perks', () => {
  it('leaves Training Grounds traits untouched', async () => {
    const { buildToTraits, baseBuild } = await import('../chassis')
    for (const id of ['scout', 'hauler', 'raider'] as const) {
      const t = buildToTraits(baseBuild(id))
      expect(t.capacity).toBeUndefined()
      expect(t.stealAll).toBeUndefined()
      expect(t.visionHops).toBeUndefined()
    }
  })

  it('applies Hauler capacity tax and Raider/Scout skirmish leads', async () => {
    const { buildToTraits, baseBuild } = await import('../chassis')
    const hauler = buildToTraits(baseBuild('hauler'), 'skirmish')
    expect(hauler.capacity).toBe(4)
    expect(hauler.cargoTravelTax).toBe(0.22)
    expect(buildToTraits(baseBuild('scout'), 'skirmish').cargoTravelTax).toBeUndefined()
    expect(buildToTraits(baseBuild('raider'), 'skirmish').contactStrength).toBeGreaterThan(
      buildToTraits(baseBuild('raider')).contactStrength,
    )
    expect(buildToTraits(baseBuild('raider'), 'skirmish').travelSpeed).toBeGreaterThan(
      buildToTraits(baseBuild('raider')).travelSpeed,
    )
    expect(buildToTraits(baseBuild('scout'), 'skirmish').travelSpeed).toBeGreaterThan(
      buildToTraits(baseBuild('scout')).travelSpeed,
    )
  })

  it('gives each chassis its signature rule', async () => {
    const { buildToTraits, baseBuild } = await import('../chassis')
    expect(buildToTraits(baseBuild('hauler'), 'skirmish').capacity).toBe(4)
    expect(buildToTraits(baseBuild('raider'), 'skirmish').stealAll).toBe(true)
    expect(buildToTraits(baseBuild('raider'), 'skirmish').contactRadiusBonus).toBe(0.75)
    expect(buildToTraits(baseBuild('scout'), 'skirmish').visionHops).toBe(2)
    expect(buildToTraits(baseBuild('scout'), 'skirmish').contactRadiusBonus).toBeUndefined()
  })
})


describe('skirmish capacity tax', () => {
  it('slows travel only for cargo above the pinned base capacity', () => {
    // Mirrors the loadFactor in ArenaEpisode move step. PvP bench confirms
    // Hauler vs Scout is near-even once the tax is live.
    const tax = 0.22
    const factor = (cargo: number) => Math.max(0.5, 1 - tax * Math.max(0, cargo - 3))
    expect(factor(0)).toBe(1)
    expect(factor(3)).toBe(1)
    expect(factor(4)).toBeCloseTo(0.78)
  })
})

describe('skirmish contact radius bonus', () => {
  it('accepts a Raider-range contactRadiusBonus and rejects above the cap', () => {
    expect(() => new ArenaEpisode(withTraits([T({ contactRadiusBonus: 0.75 }), undefined]))).not.toThrow()
    expect(() => new ArenaEpisode(withTraits([T({ contactRadiusBonus: 2 }), undefined]))).toThrow()
  })
})
