import { describe, expect, it } from 'vitest'
import { ARENA_RULES } from '../arenaEpisode'
import { FLOOD_RISE_TICKS, FLOOD_RECEDE_TICKS, createFloodCorridorMask, floodFillLevel, floodFootprint, floodWaterY } from '../arenaFlood'
import type { ArenaCourse } from '../arenaCourse'

const DRAIN = ARENA_RULES.drainTicks
const FLOODS = [
  { startTick: 100, endTick: 400 },
  { startTick: 600, endTick: 900 },
]

const level = (tick: number, drained = 0) => floodFillLevel(tick, FLOODS, drained, DRAIN)

describe('floodFillLevel', () => {
  it('is dry outside windows and rises over FLOOD_RISE_TICKS', () => {
    expect(level(0)).toBe(0)
    expect(level(99)).toBe(0)
    expect(level(100)).toBe(0)
    expect(level(110)).toBeCloseTo(0.5)
    expect(level(100 + FLOOD_RISE_TICKS)).toBe(1)
    expect(level(399)).toBe(1)
  })

  it('recedes over FLOOD_RECEDE_TICKS after the window ends', () => {
    expect(level(400)).toBe(1)
    expect(level(412)).toBeCloseTo(1 - 12 / FLOOD_RECEDE_TICKS)
    expect(level(400 + FLOOD_RECEDE_TICKS)).toBe(0)
    expect(level(599)).toBe(0)
  })

  it('drains mid-window: water falls during suppression and re-fills on expiry', () => {
    const drained = 250 // drain at t=200, suppresses until t=250
    expect(level(220, drained)).toBeCloseTo(1 - 20 / FLOOD_RECEDE_TICKS)
    // After expiry inside the window, water re-fills from the drain expiry
    expect(level(250, drained)).toBe(0)
    expect(level(260, drained)).toBeCloseTo(10 / FLOOD_RISE_TICKS)
    expect(level(250 + FLOOD_RISE_TICKS, drained)).toBe(1)
  })

  it('a drain before the window delays the fill start', () => {
    const drained = 150 // drain at t=100 → suppresses window start
    expect(level(140, drained)).toBe(0)
    expect(level(150, drained)).toBe(0)
    expect(level(160, drained)).toBeCloseTo(10 / FLOOD_RISE_TICKS)
  })

  it('a drain spanning two windows never activates water between them', () => {
    // Window 1 ends 400, window 2 starts 600; drain at 350 → drained until 400
    const drained = 400
    expect(level(350, drained)).toBeCloseTo(1 - 0 / FLOOD_RECEDE_TICKS) // water stopped at t=350
    expect(level(500, drained)).toBe(0)
    expect(level(600, drained)).toBe(0)
    expect(level(620, drained)).toBe(1)
  })

  it('is deterministic across arbitrary seek order', () => {
    for (const t of [137, 700, 55, 880, 421]) {
      expect(level(t)).toBe(level(t))
    }
  })
})

describe('floodFootprint', () => {
  const course = {
    floodZones: [{ position: [4, 0.5, 6] as [number, number, number], size: [1.35, 2.4] as [number, number] }],
    scenario: {
      edges: [
        { id: 'e1', from: 'a', to: 'b', travelTicks: 10, floodable: true, path: [[4, 0.4, 2], [4, 0.6, 8]] },
        { id: 'e2', from: 'b', to: 'c', travelTicks: 10, floodable: true, path: [[4, 0.6, 8], [4.4, 0.5, 14]] },
        { id: 'e3', from: 'a', to: 'd', travelTicks: 10, floodable: false, path: [[7, 1, 2], [7, 1, 8]] },
      ],
    },
  } as unknown as ArenaCourse

  it('bounds cover floodable paths + zones only', () => {
    const fp = floodFootprint(course, 1.0)!
    expect(fp.min[0]).toBeLessThan(4)
    expect(fp.min[0] + fp.size[0]).toBeGreaterThan(4.4)
    expect(fp.min[1]).toBeLessThanOrEqual(6 - 2.4 / 2 - 1.0)
    expect(fp.min[1] + fp.size[1]).toBeGreaterThan(14)
    // non-floodable edge at x=7 must not widen the bounds
    expect(fp.min[0] + fp.size[0]).toBeLessThan(7)
    expect(fp.waterY).toBeGreaterThan(0.6)
    expect(fp.dryY).toBeLessThan(0.4)
  })

  it('waterY interpolates between dry and full pool', () => {
    const fp = floodFootprint(course)!
    expect(floodWaterY(fp, 0)).toBe(fp.dryY)
    expect(floodWaterY(fp, 1)).toBe(fp.waterY)
    expect(floodWaterY(fp, 0.5)).toBeCloseTo((fp.dryY + fp.waterY) / 2)
  })

  it('keeps water on floodable paths and zones, not across the entire bounding box', () => {
    const mask = createFloodCorridorMask(course)
    expect(mask(4, 4)).toBe(1)
    expect(mask(4, 6)).toBe(1)
    expect(mask(4, 14)).toBe(1)
    expect(mask(5.2, 4)).toBeGreaterThan(0)
    expect(mask(6.5, 4)).toBe(0)
    expect(mask(12, 4)).toBe(0)
    expect(mask(12, 8)).toBe(0)
  })

  it('returns null when nothing is floodable', () => {
    const dry = { floodZones: [], scenario: { edges: [] } } as unknown as ArenaCourse
    expect(floodFootprint(dry)).toBeNull()
  })
})
