import { describe, expect, it } from 'vitest'
import { createRouteRibbonGeometry, detectBankDeltas, detectCollectEvents } from '../arenaPresentation'
import type { ArenaPosition } from '../arenaEpisode'

const path: ArenaPosition[] = [[0, 0.1, 0], [1, 0.2, 0], [2, 0.3, 1]]

describe('route ribbon geometry', () => {
  it('returns null for paths shorter than two points', () => {
    expect(createRouteRibbonGeometry([], 0.1, 0.02)).toBeNull()
    expect(createRouteRibbonGeometry([[0, 0, 0]], 0.1, 0.02)).toBeNull()
  })

  it('centers each vertex pair on the sampled point at the lifted height', () => {
    const lift = 0.025
    const geometry = createRouteRibbonGeometry(path, 0.09, lift)!
    const positions = geometry.getAttribute('position')
    expect(positions.count).toBe(path.length * 2)
    for (let index = 0; index < path.length; index++) {
      const a = [positions.getX(index * 2), positions.getY(index * 2), positions.getZ(index * 2)]
      const b = [positions.getX(index * 2 + 1), positions.getY(index * 2 + 1), positions.getZ(index * 2 + 1)]
      const midpoint = a.map((value, axis) => (value + b[axis]) / 2)
      expect(midpoint[0]).toBeCloseTo(path[index][0], 6)
      expect(midpoint[1]).toBeCloseTo(path[index][1] + lift, 6)
      expect(midpoint[2]).toBeCloseTo(path[index][2], 6)
      const width = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
      expect(width).toBeCloseTo(0.09, 6)
    }
    geometry.dispose()
  })

  it('emits finite in-range indices and does not mutate the input path', () => {
    const frozen = path.map(point => Object.freeze([...point]))
    const geometry = createRouteRibbonGeometry(frozen as ArenaPosition[], 0.1, 0.03)!
    const index = geometry.getIndex()!
    expect(index.count).toBe((path.length - 1) * 6)
    const vertexCount = geometry.getAttribute('position').count
    for (let i = 0; i < index.count; i++) {
      const value = index.getX(i)
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(vertexCount)
    }
    geometry.dispose()
  })
})

describe('bank delta detection', () => {
  it('baselines unseen agents without emitting events', () => {
    const scan = detectBankDeltas({}, [
      { id: 'champion', banked: 3 },
      { id: 'rival', banked: 1 },
    ])
    expect(scan.events).toEqual([])
    expect(scan.seen).toEqual({ champion: 3, rival: 1 })
  })

  it('reports positive deltas per agent', () => {
    const scan = detectBankDeltas({ champion: 3, rival: 1 }, [
      { id: 'champion', banked: 6 },
      { id: 'rival', banked: 1 },
    ])
    expect(scan.events).toEqual([{ id: 'champion', delta: 3 }])
    expect(scan.seen).toEqual({ champion: 6, rival: 1 })
  })

  it('ignores unchanged and regressed totals', () => {
    const scan = detectBankDeltas({ champion: 6, rival: 4 }, [
      { id: 'champion', banked: 6 },
      { id: 'rival', banked: 2 },
    ])
    expect(scan.events).toEqual([])
    expect(scan.seen).toEqual({ champion: 6, rival: 2 })
  })
})

describe('collect event detection', () => {
  it('baselines unseen resources without emitting events', () => {
    const scan = detectCollectEvents({}, [{ id: 'core-1', collectedBy: 'champion' }])
    expect(scan.events).toEqual([])
    expect(scan.seen).toEqual({ 'core-1': 'champion' })
  })

  it('reports uncollected-to-collected transitions', () => {
    const scan = detectCollectEvents({ 'core-1': null, 'core-2': null }, [
      { id: 'core-1', collectedBy: 'rival' },
      { id: 'core-2', collectedBy: null },
    ])
    expect(scan.events).toEqual([{ id: 'core-1', by: 'rival' }])
    expect(scan.seen).toEqual({ 'core-1': 'rival', 'core-2': null })
  })

  it('ignores already-collected resources and steals', () => {
    const scan = detectCollectEvents({ 'core-1': 'champion' }, [{ id: 'core-1', collectedBy: 'champion' }])
    expect(scan.events).toEqual([])
  })
})
