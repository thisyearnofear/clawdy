import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createWorldSurface } from '../worldSurface'
import { ArenaPhysics, initializeArenaPhysics } from '../arenaPhysics'
import { ARENA_WORLD, TEMPLATE_STATIONS } from '../arenaCourse'
import {
  FAMILY_LAYOUT_SEEDS,
  generateCourseFamily,
  validateFamilyTopology,
} from '../courseFamily'
import {
  isEvaluationScenario,
  rejectEvaluationExamples,
} from '../arenaScenarios'

let collider: { vertices: Float32Array; indices: Uint32Array }

beforeAll(async () => {
  await initializeArenaPhysics()
  const bytes = new Uint8Array(await readFile(resolve(process.cwd(), 'public/terrain/sandstone-basin.glb')))
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '')
  const surface = createWorldSurface(gltf.scene)
  collider = surface.colliderData()
  surface.dispose()
})

describe('course family generation', () => {
  it('is deterministic for fixed seeds on the pinned collider', () => {
    const first = generateCourseFamily(collider)
    const second = generateCourseFamily(collider)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first).toHaveLength(FAMILY_LAYOUT_SEEDS.length)
  })

  it('emits evaluation-split layouts on the same grounded world version', () => {
    const family = generateCourseFamily(collider)
    family.forEach((layout, i) => {
      expect(layout.index).toBe(i + 1)
      expect(layout.seed).toBe(FAMILY_LAYOUT_SEEDS[i])
      expect(layout.attempts).toBeGreaterThanOrEqual(1)
      expect(layout.scenario.id).toBe(`sandstone-family-0${i + 1}`)
      expect(layout.scenario.split).toBe('evaluation')
      expect(layout.scenario.worldVersion).toBe(ARENA_WORLD.version)
      expect(layout.scenario.durationTicks).toBe(1200)
      expect(layout.scenario.resources).toHaveLength(18)
      expect(layout.scenario.resources.reduce((sum, r) => sum + r.value, 0)).toBe(22)
      expect(layout.droppedEdgeIds.length).toBeLessThanOrEqual(2)
      const templateById = new Map<string, { x: number; z: number }>(TEMPLATE_STATIONS.map(t => [t.id, t]))
      for (const station of layout.stations) {
        const template = templateById.get(station.id)!
        expect(Math.abs(station.x - template.x)).toBeLessThanOrEqual(0.81)
        expect(Math.abs(station.z - template.z)).toBeLessThanOrEqual(1.51)
      }
    })
    const ids = family.map(layout => layout.scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('grounds every family station with rover clearance', () => {
    const physics = new ArenaPhysics(collider)
    try {
      for (const layout of generateCourseFamily(collider)) {
        for (const node of layout.scenario.nodes) {
          expect(physics.canStand(node.position), `${layout.scenario.id}/${node.id}`).toBe(true)
          const sample = physics.sample([node.position[0], node.position[1] + 1, node.position[2]], 4)
          expect(sample, `${layout.scenario.id}/${node.id} ungrounded`).not.toBeNull()
          expect(sample!.normal[1]).toBeGreaterThanOrEqual(0.7)
        }
      }
    } finally {
      physics.dispose()
    }
  })

  it('holds the topology invariants on every generated layout', () => {
    for (const layout of generateCourseFamily(collider)) {
      expect(() => validateFamilyTopology(
        layout.scenario.nodes, layout.scenario.edges, layout.scenario.resources,
      )).not.toThrow()
      const ridge = layout.scenario.nodes.find(n => n.id === 'ridge-center')!.position
      const valley = layout.scenario.nodes.find(n => n.id === 'valley-center')!.position
      expect(ridge[1] - valley[1]).toBeGreaterThanOrEqual(0.8)
    }
  })
})

describe('family invariant rejection (pure topology)', () => {
  function healthy() {
    const [layout] = generateCourseFamily(collider)
    return {
      nodes: layout.scenario.nodes.map(n => ({ id: n.id })),
      edges: layout.scenario.edges.map(e => ({ id: e.id, from: e.from, to: e.to, travelTicks: e.travelTicks, floodable: e.floodable })),
      resources: layout.scenario.resources.map(r => ({ id: r.id, nodeId: r.nodeId, value: r.value })),
    }
  }

  it('accepts the generated layouts', () => {
    const { nodes, edges, resources } = healthy()
    expect(() => validateFamilyTopology(nodes, edges, resources)).not.toThrow()
  })

  it('rejects disconnected graphs', () => {
    const { nodes, edges, resources } = healthy()
    const pruned = edges.filter(e => !(e.from === 'champion-base' || e.to === 'champion-base'))
    expect(() => validateFamilyTopology(nodes, pruned, resources)).toThrow('family-reject: disconnected')
  })

  it('rejects courses floods can isolate', () => {
    const { nodes, edges, resources } = healthy()
    const allFloodable = edges.map(e => ({ ...e, floodable: true }))
    // Champion base keeps corridor exits but the dry net collapses.
    expect(() => validateFamilyTopology(nodes, allFloodable, resources)).toThrow('family-reject: floods isolate')
  })

  it('rejects bases with fewer than two exits', () => {
    const { nodes, edges, resources } = healthy()
    // Keep only the dry base link: dry net stays whole, but exits drop to one.
    const oneExit = edges.filter(e => !(e.from === 'rival-base' || e.to === 'rival-base') || e.id === 'base-rb-rs')
    expect(oneExit.filter(e => e.from === 'rival-base' || e.to === 'rival-base')).toHaveLength(1)
    expect(() => validateFamilyTopology(nodes, oneExit, resources)).toThrow('family-reject: base rival-base')
  })

  it('rejects trivial base separation and resource drift', () => {
    const { nodes, edges, resources } = healthy()
    const instant = edges.map(e => ({ ...e, travelTicks: 1 }))
    expect(() => validateFamilyTopology(nodes, instant, resources)).toThrow('family-reject: base separation')
    const drifted = [...resources, { id: 'core-x', nodeId: 'cross-c', value: 5 }]
    expect(() => validateFamilyTopology(nodes, edges, drifted)).toThrow('family-reject: resource spread')
  })
})

describe('family held-out guards', () => {
  it('treats family scenarios as evaluation and refuses their examples', () => {
    expect(isEvaluationScenario('sandstone-family-01')).toBe(true)
    expect(isEvaluationScenario('sandstone-family-04')).toBe(true)
    expect(() => rejectEvaluationExamples([{ sourceEpisodeId: 'sandstone-family-02' }])).toThrow('held-out')
  })
})
