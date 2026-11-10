import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createDecorModel, groundDecor, planArenaDecor } from '../arenaDecor'
import type { ArenaCourse } from '../arenaCourse'
import type { ArenaEdge, ArenaPosition } from '../arenaEpisode'

function courseFixture({
  nodes = [
    { id: 'champion-base', position: [10, 0, 0] as ArenaPosition },
    { id: 'rival-base', position: [-10, 0, 0] as ArenaPosition },
    { id: 'center-node', position: [0, 0, 0] as ArenaPosition },
  ],
  edges = [
    { id: 'e1', from: 'champion-base', to: 'center-node', travelTicks: 10, floodable: false, path: [[10, 0, 0], [5, 0, 0], [0, 0, 0]] as ArenaPosition[] },
    { id: 'e2', from: 'rival-base', to: 'center-node', travelTicks: 10, floodable: false, path: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0]] as ArenaPosition[] },
  ],
}: {
  nodes?: { id: string; position: ArenaPosition }[]
  edges?: ArenaEdge[]
} = {}): ArenaCourse {
  return {
    scenario: {
      nodes,
      edges,
      entrants: [
        { id: 'champion', baseNode: 'champion-base', policyVersion: 'p1' },
        { id: 'rival', baseNode: 'rival-base', policyVersion: 'p2' },
      ],
    } as ArenaCourse['scenario'],
    config: { id: 'test', name: 'test', terrain: { url: '', sha256: '' } },
    center: [0, 0, 0],
    floodZones: [],
  }
}

describe('planArenaDecor', () => {
  it('places up to six props outside both bases, away from the course centre', () => {
    const plan = planArenaDecor(courseFixture())
    expect(plan).toHaveLength(6)
    for (const candidate of plan) {
      expect(Math.abs(candidate.x)).toBeGreaterThan(10)
      expect(candidate.scale).toBeLessThanOrEqual(1)
    }
    expect(plan.map(candidate => candidate.type)).toEqual(['generator', 'dish', 'barrels', 'generator', 'dish', 'barrels'])
  })

  it('rejects candidates inside the route clearance of a polyline interior, not just endpoints', () => {
    const course = courseFixture({
      edges: [
        { id: 'e1', from: 'champion-base', to: 'center-node', travelTicks: 10, floodable: false, path: [[10, 0, 0], [0, 0, 0]] as ArenaPosition[] },
        { id: 'e2', from: 'rival-base', to: 'center-node', travelTicks: 10, floodable: false, path: [[-10, 0, 0], [0, 0, 0]] as ArenaPosition[] },
        { id: 'wall', from: 'champion-base', to: 'center-node', travelTicks: 10, floodable: false, path: [[11.8, 0, -3], [11.8, 0, 3]] as ArenaPosition[] },
      ],
    })
    const plan = planArenaDecor(course)
    expect(plan).toHaveLength(3)
    expect(plan.every(candidate => candidate.x < -10)).toBe(true)
  })

  it('falls back to node endpoints when an edge has no path', () => {
    const course = courseFixture({
      nodes: [
        { id: 'champion-base', position: [10, 0, 0] as ArenaPosition },
        { id: 'rival-base', position: [-10, 0, 0] as ArenaPosition },
        { id: 'center-node', position: [0, 0, 0] as ArenaPosition },
        { id: 'far', position: [11.8, 0, 4] as ArenaPosition },
        { id: 'below', position: [11.8, 0, -4] as ArenaPosition },
      ],
      edges: [
        { id: 'e1', from: 'champion-base', to: 'center-node', travelTicks: 10, floodable: false, path: [[10, 0, 0], [0, 0, 0]] as ArenaPosition[] },
        { id: 'e2', from: 'rival-base', to: 'center-node', travelTicks: 10, floodable: false, path: [[-10, 0, 0], [0, 0, 0]] as ArenaPosition[] },
        { id: 'e3', from: 'far', to: 'below', travelTicks: 10, floodable: false },
      ],
    })
    const plan = planArenaDecor(course)
    expect(plan.every(candidate => candidate.x < -10)).toBe(true)
  })

  it('caps lite mode at two generator props', () => {
    const plan = planArenaDecor(courseFixture(), true)
    expect(plan).toHaveLength(2)
    expect(plan.every(candidate => candidate.type === 'generator')).toBe(true)
  })

  it('does not mutate the scenario', () => {
    const course = courseFixture()
    const snapshot = JSON.stringify(course.scenario)
    planArenaDecor(course)
    planArenaDecor(course, true)
    expect(JSON.stringify(course.scenario)).toBe(snapshot)
  })
})

describe('groundDecor', () => {
  const candidates = [{ type: 'generator' as const, x: 1, z: 2, yaw: 0, scale: 1 }]

  it('drops candidates onto a flat surface', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial())
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 2
    mesh.updateMatrixWorld(true)
    const placed = groundDecor(mesh, candidates)
    expect(placed).toHaveLength(1)
    expect(placed[0].y).toBeCloseTo(2, 3)
  })

  it('skips surfaces too steep to stand on', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial())
    mesh.rotation.x = -Math.PI / 6
    mesh.updateMatrixWorld(true)
    expect(groundDecor(mesh, candidates)).toHaveLength(0)
  })

  it('skips candidates over missing surfaces', () => {
    expect(groundDecor(new THREE.Group(), candidates)).toHaveLength(0)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(50, 0, 50)
    mesh.updateMatrixWorld(true)
    expect(groundDecor(mesh, candidates)).toHaveLength(0)
  })
})

describe('createDecorModel', () => {
  function offsetSource(): { source: THREE.Group; mesh: THREE.Mesh } {
    const source = new THREE.Group()
    const child = new THREE.Group()
    child.position.set(2, 0.5, 1.5)
    child.rotation.y = Math.PI / 4
    child.scale.setScalar(1.5)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), new THREE.MeshBasicMaterial())
    mesh.castShadow = true
    mesh.position.set(0.3, 0.3, 0.1)
    child.add(mesh)
    source.add(child)
    source.updateMatrixWorld(true)
    return { source, mesh }
  }

  it('anchors a shifted source to xz center and ground level without mutating it', () => {
    const { source, mesh } = offsetSource()
    const sourceBox = new THREE.Box3().setFromObject(source)
    const model = createDecorModel(source)
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    expect(box.min.y).toBeCloseTo(0, 6)
    expect(Math.abs(center.x)).toBeLessThan(1e-6)
    expect(Math.abs(center.z)).toBeLessThan(1e-6)
    const after = new THREE.Box3().setFromObject(source)
    expect(after.min.toArray()).toEqual(sourceBox.min.toArray())
    expect(after.max.toArray()).toEqual(sourceBox.max.toArray())
    expect(source.children).toHaveLength(1)
    const cloneMesh = model.children[0].children[0].children[0].children[0] as THREE.Mesh
    expect(cloneMesh.geometry).toBe(mesh.geometry)
    expect(cloneMesh.material).toBe(mesh.material)
    expect(cloneMesh.castShadow).toBe(false)
    expect(cloneMesh.raycast.length).toBe(0)
  })

  it('keeps anchoring under outer rotation and scale', () => {
    const { source } = offsetSource()
    const model = createDecorModel(source)
    model.position.set(3, 0.25, -2)
    model.rotation.y = Math.PI / 3
    model.scale.setScalar(2)
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    expect(box.min.y).toBeCloseTo(0.25, 6)
    expect(center.x).toBeCloseTo(3, 6)
    expect(center.z).toBeCloseTo(-2, 6)
  })
})

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll } from 'vitest'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createWorldSurface } from '../worldSurface'
import { ArenaPhysics, initializeArenaPhysics } from '../arenaPhysics'
import { buildArenaCourse } from '../arenaCourse'

describe('decor on the pinned Sandstone Basin terrain', () => {
  let terrain: THREE.Group
  let course: ArenaCourse

  beforeAll(async () => {
    await initializeArenaPhysics()
    const bytes = new Uint8Array(await readFile(resolve(process.cwd(), 'public/terrain/sandstone-basin.glb')))
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '')
    terrain = gltf.scene
    const surface = createWorldSurface(gltf.scene)
    const physics = new ArenaPhysics(surface.colliderData())
    surface.dispose()
    try {
      course = buildArenaCourse(physics)
    } finally {
      physics.dispose()
    }
  })

  it('places and grounds props at both bases with route clearance respected', () => {
    const plan = planArenaDecor(course)
    expect(plan.length).toBeGreaterThan(0)
    const nodeById = new Map(course.scenario.nodes.map(node => [node.id, node.position]))
    for (const entrant of course.scenario.entrants) {
      const base = nodeById.get(entrant.baseNode)!
      const near = plan.filter(candidate => Math.hypot(candidate.x - base[0], candidate.z - base[2]) < 4.5)
      expect(near.length, `no ${entrant.id} props planned`).toBeGreaterThan(0)
    }
    const placed = groundDecor(terrain, plan)
    expect(placed.length).toBeGreaterThan(0)
    for (const prop of placed) {
      expect(Number.isFinite(prop.y)).toBe(true)
      expect(prop.y).toBeGreaterThan(-2)
      expect(prop.y).toBeLessThan(10)
      expect(prop.scale).toBeLessThanOrEqual(1)
    }
    for (const edge of course.scenario.edges) {
      const points = edge.path!
      for (const prop of placed) {
        for (let index = 1; index < points.length; index++) {
          const a = points[index - 1]
          const b = points[index]
          const dx = b[0] - a[0]
          const dz = b[2] - a[2]
          const t = dx * dx + dz * dz > 0
            ? Math.max(0, Math.min(1, ((prop.x - a[0]) * dx + (prop.z - a[2]) * dz) / (dx * dx + dz * dz)))
            : 0
          expect(Math.hypot(prop.x - (a[0] + dx * t), prop.z - (a[2] + dz * t)), `${edge.id} clearance`).toBeGreaterThanOrEqual(1.4)
        }
      }
    }
    expect(planArenaDecor(course, true).length).toBeLessThanOrEqual(2)
    expect(placed.length).toBeLessThanOrEqual(6)
  })
})
