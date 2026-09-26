import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { advancePoseHistory, createRouteRibbonGeometry, detectBankDeltas, detectCollectEvents, samplePoseHistory } from '../arenaPresentation'
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

describe('pose history interpolation', () => {
  const agentAt = (x: number, z: number) => ({ position: [x, 0, z] as ArenaPosition, rotation: [0, 0, 0, 1] as [number, number, number, number] })
  const sample = (history: Parameters<typeof samplePoseHistory>[0], alpha: number) => {
    const pos = new THREE.Vector3()
    const rot = new THREE.Quaternion()
    samplePoseHistory(history, alpha, pos, rot)
    return { pos, rot }
  }

  it('baselines a new agent at its committed pose', () => {
    const history = advancePoseHistory(null, {}, 0, agentAt(1, 2))
    expect(history.tick).toBe(0)
    expect(history.span).toBe(1)
    expect(sample(history, 0.5).pos.x).toBeCloseTo(1, 6)
  })

  it('renders one tick behind the authority on forward ticks', () => {
    const source = {}
    let history = advancePoseHistory(null, source, 0, agentAt(0, 0))
    history = advancePoseHistory(history, source, 1, agentAt(2, 0))
    expect(history.span).toBe(1)
    expect(sample(history, 0).pos.x).toBeCloseTo(0, 6)
    expect(sample(history, 0.5).pos.x).toBeCloseTo(1, 6)
    expect(sample(history, 1).pos.x).toBeCloseTo(2, 6)
  })

  it('is idempotent within a tick so concurrent consumers agree', () => {
    const source = {}
    let history = advancePoseHistory(null, source, 0, agentAt(0, 0))
    history = advancePoseHistory(history, source, 1, agentAt(2, 0))
    const before = { span: history.span, tick: history.tick }
    history = advancePoseHistory(history, source, 1, agentAt(2, 0))
    expect(history.span).toBe(before.span)
    expect(history.tick).toBe(before.tick)
  })

  it('linearizes multi-tick frames instead of replaying skipped commits', () => {
    const source = {}
    let history = advancePoseHistory(null, source, 0, agentAt(0, 0))
    history = advancePoseHistory(history, source, 3, agentAt(6, 0))
    expect(history.span).toBe(3)
    // Render time T−1+α: α=0 → position at T−1 (=4), α=1 → committed T (=6).
    expect(sample(history, 0).pos.x).toBeCloseTo(4, 6)
    expect(sample(history, 1).pos.x).toBeCloseTo(6, 6)
  })

  it('snaps on backward ticks (reset / scrub)', () => {
    const source = {}
    let history = advancePoseHistory(null, source, 5, agentAt(9, 9))
    history = advancePoseHistory(history, source, 0, agentAt(0, 0))
    expect(history.span).toBe(1)
    expect(history.tick).toBe(0)
    expect(sample(history, 1).pos.x).toBeCloseTo(0, 6)
  })

  it('snaps when the episode source changes at an unchanged tick', () => {
    let history = advancePoseHistory(null, {}, 0, agentAt(1, 1))
    // A rebuilt runner or a fresh recording presents tick 0 again — same
    // tick, different snapshot object. The stale pose must not survive.
    history = advancePoseHistory(history, {}, 0, agentAt(7, 7))
    expect(history.span).toBe(1)
    const { pos } = sample(history, 1)
    expect(pos.x).toBeCloseTo(7, 6)
    expect(pos.z).toBeCloseTo(7, 6)
  })

  it('falls back to identity rotation when the agent has none', () => {
    const history = advancePoseHistory(null, {}, 0, { position: [1, 0, 1] as ArenaPosition })
    const { rot } = sample(history, 1)
    expect(rot.w).toBeCloseTo(1, 6)
  })

  it('slews the displayed rotation instead of snapping to committed flips', () => {
    const source = {}
    const flat = agentAt(0, 0)
    const spun = { position: [0, 0, 0] as ArenaPosition, rotation: [0, 1, 0, 0] as [number, number, number, number] } // 180° yaw
    let history = advancePoseHistory(null, source, 0, flat)
    history = advancePoseHistory(history, source, 1, spun)
    // The controller can commit an instant 180° flip; the display must slew.
    const pos = new THREE.Vector3()
    const rot = new THREE.Quaternion()
    samplePoseHistory(history, 0.5, pos, rot, 0.1) // 0.4 rad budget
    const yawAfter = 2 * Math.asin(Math.min(1, Math.abs(rot.y)))
    expect(yawAfter).toBeLessThanOrEqual(0.45)
    // Same frame → second consumer gets the identical display (no double advance).
    const rot2 = new THREE.Quaternion()
    samplePoseHistory(history, 0.5, pos, rot2, 0.1)
    expect(rot2.angleTo(rot)).toBeCloseTo(0, 6)
    // More frame time → display keeps converging on the committed pose.
    samplePoseHistory(history, 0.5, pos, rot2, 0.6) // +0.4*4 = 2.0 rad cumulative budget
    expect(rot2.angleTo(rot)).toBeGreaterThan(0)
  })

  it('snaps the display to the committed pose when alpha is 1', () => {
    const source = {}
    const spun = { position: [0, 0, 0] as ArenaPosition, rotation: [0, 1, 0, 0] as [number, number, number, number] }
    let history = advancePoseHistory(null, source, 0, agentAt(0, 0))
    history = advancePoseHistory(history, source, 1, spun)
    const { rot } = sample(history, 1)
    expect(rot.y).toBeCloseTo(1, 6)
    expect(rot.w).toBeCloseTo(0, 6)
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
