import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { ArenaCourse } from '../arenaCourse'
import { SCATTER_ROUTE_CLEARANCE, planScatter, placeScatter, type ScatterCandidate } from '../arenaScatter'
import type { WorldSpec } from '../arenaWorldgen'

const SPEC: WorldSpec = {
  landform: 'canyon',
  ridge: { x: 7.2, height: 1.1 },
  channels: { count: 3, spacing: 2.5, depth: 0.12 },
  rim: { height: 1.4, steepness: 2.2 },
  waterlineOffset: 0.1,
  palette: 'basalt',
  rockDensity: 0.6,
  scenarioName: 'Scatter Test',
}

function courseWith(overrides: Partial<ArenaCourse> = {}): ArenaCourse {
  const base: ArenaCourse = {
    config: { id: 'generated-test', name: 'Scatter Test', terrain: { url: 'generated:test', sha256: 'test' } },
    center: [7, 0.5, 8],
    floodZones: [],
    scenario: {
      id: 'scatter-test', worldVersion: 'test.v1', split: 'practice', seed: 1, durationTicks: 600,
      nodes: [
        { id: 'valley-c', position: [7, 0, 8] },
        { id: 'ridge-c', position: [7, 1, 2] },
        { id: 'champion-base', position: [1, 0, 20] },
        { id: 'rival-base', position: [13, 0, 20] },
      ],
      edges: [
        { id: 'e1', from: 'valley-c', to: 'ridge-c', travelTicks: 20, floodable: false },
        { id: 'e2', from: 'valley-c', to: 'champion-base', travelTicks: 20, floodable: false },
        { id: 'e3', from: 'valley-c', to: 'rival-base', travelTicks: 20, floodable: false },
      ],
      entrants: [
        { id: 'champion', baseNode: 'champion-base', policyVersion: 'test' },
        { id: 'rival', baseNode: 'rival-base', policyVersion: 'test' },
      ],
      resources: [], floods: [],
    },
    generated: { worldId: 'generated-deadbeef', spec: SPEC, certificate: null },
  }
  return { ...base, ...overrides }
}

function flatGround(y = 0, width = 40, depth = 40): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial())
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(7, y, 8)
  return mesh
}

describe('planScatter', () => {
  it('leaves authored worlds alone', () => {
    const authored = courseWith()
    delete (authored as { generated?: unknown }).generated
    expect(planScatter(authored)).toEqual([])
  })

  it('is deterministic for one world id and different for another', () => {
    const first = planScatter(courseWith())
    expect(planScatter(courseWith())).toEqual(first)
    expect(planScatter(courseWith({ generated: { worldId: 'generated-0badc0de', spec: SPEC, certificate: null } }))).not.toEqual(first)
  })

  it('scales with the spec density', () => {
    const none = planScatter(courseWith({ generated: { worldId: 'generated-deadbeef', spec: { ...SPEC, rockDensity: 0 }, certificate: null } }))
    const sparse = planScatter(courseWith({ generated: { worldId: 'generated-deadbeef', spec: { ...SPEC, rockDensity: 0.2 }, certificate: null } }))
    const dense = planScatter(courseWith({ generated: { worldId: 'generated-deadbeef', spec: { ...SPEC, rockDensity: 1 }, certificate: null } }))
    expect(none).toEqual([])
    expect(sparse.length).toBeGreaterThan(0)
    expect(dense.length).toBeGreaterThan(sparse.length)
    expect(planScatter(courseWith({ generated: { worldId: 'generated-deadbeef', spec: { ...SPEC, rockDensity: 1 }, certificate: null } }), { lite: true }).length)
      .toBeLessThan(dense.length)
  })

  it('keeps every prop off the stations and the routes', () => {
    const course = courseWith({ generated: { worldId: 'generated-12345678', spec: { ...SPEC, rockDensity: 1 }, certificate: null } })
    const props = planScatter(course)
    expect(props.length).toBeGreaterThan(4)
    for (const prop of props) {
      for (const node of course.scenario.nodes) {
        expect(Math.hypot(prop.x - node.position[0], prop.z - node.position[2])).toBeGreaterThanOrEqual(SCATTER_ROUTE_CLEARANCE)
      }
    }
  })

  it('does not drop props into the water', () => {
    const course = courseWith({
      floodZones: [{ position: [7, 0, 8], size: [12, 12] }],
      generated: { worldId: 'generated-abcdef01', spec: { ...SPEC, rockDensity: 1 }, certificate: null },
    })
    for (const prop of planScatter(course)) {
      const margin = prop.size / 2
      const inside = Math.abs(prop.x - 7) < 6 + margin && Math.abs(prop.z - 8) < 6 + margin
      expect(inside).toBe(false)
    }
  })
})

describe('placeScatter', () => {
  const candidate = (over: Partial<ScatterCandidate>): ScatterCandidate => ({
    type: 'boulder', x: 4, z: 6, yaw: 0, size: 1.4, ...over,
  })

  it('grounds props on the surface and keeps the plan order', () => {
    const placed = placeScatter(flatGround(), [candidate({}), candidate({ type: 'scrub', x: 5, z: 7 }), candidate({ x: 6, z: 5 })])
    expect(placed).toHaveLength(3)
    for (const prop of placed) expect(prop.y).toBeCloseTo(0, 5)
  })

  it('refuses a prop that misses the ground', () => {
    const small = flatGround(0, 2, 2)
    expect(placeScatter(small, [candidate({})])).toEqual([])
  })

  it('refuses a prop on a wall-steep flank', () => {
    // 70° from horizontal: normal.y = cos 70° ≈ 0.34, below the stand limit.
    const flank = flatGround(0, 20, 20)
    flank.rotation.x = -Math.PI / 2 + (70 * Math.PI) / 180
    flank.position.set(7, 0, 8)
    expect(placeScatter(flank, [candidate({})])).toEqual([])
  })

  it('keeps scrub on the low ground and lets boulders climb', () => {
    const group = new THREE.Group()
    group.add(flatGround(0))
    group.add(flatGround(4, 4, 4))
    group.children[1].position.set(14, 4, 8)
    const placed = placeScatter(group, [
      candidate({ type: 'scrub', x: 4, z: 6 }),
      candidate({ type: 'scrub', x: 14, z: 8 }),
      candidate({ type: 'boulder', x: 14, z: 8 }),
    ])
    expect(placed.map(prop => `${prop.type}@${prop.y.toFixed(0)}`).sort()).toEqual(['boulder@4', 'scrub@0'])
  })
})
