import { describe, expect, it } from 'vitest'
import { ARENA_RULES, type ArenaScenario, type EntrantTraits } from '../arenaEpisode'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'
import { baseBuild, buildToTraits } from '../chassis'
import { cargoSlots, hasRulesetPerk, MAX_SLOTS_SHOWN, slotOffset, visionNodes } from '../ruleLegibility'

// a - b - c - d in a line, plus a spur b - e.
const chain: ArenaScenario = {
  ...PRACTICE_SCENARIOS[0],
  nodes: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, position: [0, 0, 0] as [number, number, number] })),
  edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['b', 'e']].map(([from, to], index) => ({ id: `e${index}`, from, to }) as ScenarioEdge),
}
type ScenarioEdge = ArenaScenario['edges'][number]

// Traits always carry the three base fields; a perk test only varies the extras.
const T = (extra: Partial<EntrantTraits>): EntrantTraits => ({ travelSpeed: 1, maxEnergy: 12, contactStrength: 0, ...extra })

describe('cargo slots', () => {
  it('draws only carried cores under the pinned rules, as before', () => {
    expect(cargoSlots({ cargo: 0 })).toEqual({ capacity: ARENA_RULES.capacity, filled: 0, drawn: 0 })
    expect(cargoSlots({ cargo: 2 })).toEqual({ capacity: ARENA_RULES.capacity, filled: 2, drawn: 2 })
    // Season 0 build traits (speed, battery, contact) are not perks.
    expect(cargoSlots({ cargo: 1, traits: buildToTraits(baseBuild('raider')) }).drawn).toBe(1)
  })

  it('draws every slot for a rover with a ruleset perk', () => {
    const hauler = buildToTraits(baseBuild('hauler'), 'skirmish')
    expect(cargoSlots({ cargo: 1, traits: hauler })).toEqual({ capacity: hauler.capacity, filled: 1, drawn: hauler.capacity })
    // A Skirmish Raider keeps the default capacity but still shows its slots.
    expect(cargoSlots({ cargo: 0, traits: buildToTraits(baseBuild('raider'), 'skirmish') })).toEqual({ capacity: ARENA_RULES.capacity, filled: 0, drawn: ARENA_RULES.capacity })
  })

  it('never draws more than the stack holds, or a negative stack', () => {
    expect(cargoSlots({ cargo: 99, traits: T({ capacity: 8 }) }).filled).toBe(8)
    expect(cargoSlots({ cargo: 99, traits: T({ capacity: 8 }) }).drawn).toBeLessThanOrEqual(MAX_SLOTS_SHOWN)
    expect(cargoSlots({ cargo: -2 }).filled).toBe(0)
  })

  it('detects perks from the traits, not from the ruleset name', () => {
    expect(hasRulesetPerk(undefined)).toBe(false)
    expect(hasRulesetPerk(T({ travelSpeed: 1.2 }))).toBe(false)
    expect(hasRulesetPerk(T({ capacity: 4 }))).toBe(true)
    expect(hasRulesetPerk(T({ stealAll: true }))).toBe(true)
    expect(hasRulesetPerk(T({ visionHops: 2 }))).toBe(true)
  })

  it('lays slots out in two columns, rows going up', () => {
    expect(slotOffset(0)).toEqual([-0.08, 0])
    expect(slotOffset(1)[0]).toBeCloseTo(0.08)
    expect(slotOffset(2)[1]).toBeCloseTo(0.13)
    expect(new Set(Array.from({ length: MAX_SLOTS_SHOWN }, (_, index) => slotOffset(index).join())).size).toBe(MAX_SLOTS_SHOWN)
  })
})

describe('vision nodes', () => {
  it('is empty on the default one-hop view, so only a perk draws a ring', () => {
    expect(visionNodes(chain, { nodeId: 'a' })).toEqual([])
    expect(visionNodes(chain, { nodeId: 'a', traits: T({ visionHops: 1 }) })).toEqual([])
  })

  it('reaches two hops for the Scout and excludes the rover\'s own node', () => {
    expect(visionNodes(chain, { nodeId: 'a', traits: T({ visionHops: 2 }) })).toEqual(['b', 'c', 'e'])
    expect(visionNodes(chain, { nodeId: 'b', traits: T({ visionHops: 2 }) })).toEqual(['a', 'c', 'd', 'e'])
  })

  it('grows with hops and agrees with the Scout perk from the chassis table', () => {
    expect(visionNodes(chain, { nodeId: 'a', traits: T({ visionHops: 3 }) })).toEqual(['b', 'c', 'd', 'e'])
    const scout = buildToTraits(baseBuild('scout'), 'skirmish')
    expect(visionNodes(chain, { nodeId: 'a', traits: scout }).length).toBeGreaterThan(1)
    expect(visionNodes(chain, { nodeId: 'a', traits: buildToTraits(baseBuild('hauler'), 'skirmish') })).toEqual([])
  })
})
