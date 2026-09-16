import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ARENA_RULES, type ArenaPosition, type ArenaScenario } from './arenaEpisode'
import { ArenaPhysics, initializeArenaPhysics } from './arenaPhysics'
import { createWorldSurface } from './worldSurface'
import type { MarbleWorldConfig } from './marbleWorld'

export const ARENA_WORLD = Object.freeze({
  version: 'marble-038d084c-course-1',
  id: '038d084c-2f7c-4839-b083-84e7ebef03ca',
  name: 'Cloudbank / Course 01',
  colliderUrl: '/marble/collider.glb',
  splatUrl: '/marble/arena.spz',
  hqMeshUrl: '/marble/terrain.glb',
  colliderSha256: '25f82036f660641c1d8098e832455c38aa9531161225864079454fbd314b7747',
})

export interface ArenaCourse {
  scenario: ArenaScenario
  config: MarbleWorldConfig
  center: ArenaPosition
  floodZones: { position: ArenaPosition; size: [number, number] }[]
}

const STATIONS = [
  // Valley corridor (X=4) — floodable low route
  { id: 'champion-base', x: 4, z: 0 },
  { id: 'valley-n1', x: 4, z: 1.5 },
  { id: 'valley-center', x: 4, z: 4 },
  { id: 'valley-s1', x: 4, z: 6.5 },
  { id: 'rival-base', x: 4, z: 8 },
  // Ridge corridor (X=10) — safe high route
  { id: 'ridge-north', x: 10, z: 0 },
  { id: 'ridge-n1', x: 10, z: 1.5 },
  { id: 'ridge-center', x: 10, z: 4 },
  { id: 'ridge-s1', x: 10, z: 6.5 },
  { id: 'ridge-south', x: 10, z: 8 },
  // Cross-route junctions (X=7) — mid-elevation connections
  { id: 'cross-n', x: 7, z: 2 },
  { id: 'cross-c', x: 7, z: 4 },
  { id: 'cross-s', x: 7, z: 6 },
] as const

const CONNECTIONS = [
  // Valley corridor (floodable low route)
  { id: 'valley-cb-n1', from: 'champion-base', to: 'valley-n1', floodable: true },
  { id: 'valley-n1-vc', from: 'valley-n1', to: 'valley-center', floodable: true },
  { id: 'valley-vc-s1', from: 'valley-center', to: 'valley-s1', floodable: true },
  { id: 'valley-s1-rb', from: 'valley-s1', to: 'rival-base', floodable: true },
  // Ridge corridor (safe high route)
  { id: 'ridge-rn-r1', from: 'ridge-north', to: 'ridge-n1', floodable: false },
  { id: 'ridge-r1-rc', from: 'ridge-n1', to: 'ridge-center', floodable: false },
  { id: 'ridge-rc-r1s', from: 'ridge-center', to: 'ridge-s1', floodable: false },
  { id: 'ridge-r1s-rs', from: 'ridge-s1', to: 'ridge-south', floodable: false },
  // Base-to-ridge direct connections
  { id: 'base-cb-rn', from: 'champion-base', to: 'ridge-north', floodable: false },
  { id: 'base-rb-rs', from: 'rival-base', to: 'ridge-south', floodable: false },
  // Cross-route connections (mid-elevation)
  { id: 'cross-vn-cn', from: 'valley-n1', to: 'cross-n', floodable: false },
  { id: 'cross-cn-r1', from: 'cross-n', to: 'ridge-n1', floodable: false },
  { id: 'cross-vc-cc', from: 'valley-center', to: 'cross-c', floodable: false },
  { id: 'cross-cc-rc', from: 'cross-c', to: 'ridge-center', floodable: false },
  { id: 'cross-vs-cs', from: 'valley-s1', to: 'cross-s', floodable: false },
  { id: 'cross-cs-r1s', from: 'cross-s', to: 'ridge-s1', floodable: false },
  // Cross-route internal connections
  { id: 'cross-cn-cc', from: 'cross-n', to: 'cross-c', floodable: false },
  { id: 'cross-cc-cs', from: 'cross-c', to: 'cross-s', floodable: false },
  // Floodable shortcuts (risky but fast)
  { id: 'shortcut-cb-cn', from: 'champion-base', to: 'cross-n', floodable: true },
  { id: 'shortcut-rb-cs', from: 'rival-base', to: 'cross-s', floodable: true },
  // Long diagonal shortcuts (floodable, high risk)
  { id: 'diag-vn-rn', from: 'valley-n1', to: 'ridge-north', floodable: true },
  { id: 'diag-vs-rs', from: 'valley-s1', to: 'ridge-south', floodable: true },
  // Valley long jumps (floodable, skip intermediate nodes)
  { id: 'valley-cb-vc', from: 'champion-base', to: 'valley-center', floodable: true },
  { id: 'valley-rb-vc', from: 'rival-base', to: 'valley-center', floodable: true },
  // Ridge long jumps (dry, skip intermediate nodes)
  { id: 'ridge-rn-rc', from: 'ridge-north', to: 'ridge-center', floodable: false },
  { id: 'ridge-rs-rc', from: 'ridge-south', to: 'ridge-center', floodable: false },
] as const

export function buildArenaCourse(physics: ArenaPhysics): ArenaCourse {
  const groundedPoint = (x: number, z: number): ArenaPosition => {
    const sample = physics.sample([x, 8, z], 12)
    if (!sample || sample.normal[1] < 0.7) throw new Error(`Unsupported course surface at ${x.toFixed(2)}, ${z.toFixed(2)}`)
    return sample.point
  }
  const nodes = STATIONS.map(station => ({ id: station.id, position: groundedPoint(station.x, station.z) }))
  for (const node of nodes) {
    if (!physics.canStand(node.position)) throw new Error(`Course station lacks rover clearance: ${node.id}`)
  }
  const edges = CONNECTIONS.map(connection => {
    const from = nodes.find(node => node.id === connection.from)!.position
    const to = nodes.find(node => node.id === connection.to)!.position
    const divisions = Math.ceil(Math.hypot(to[0] - from[0], to[2] - from[2]) / 0.2)
    const path = Array.from({ length: divisions + 1 }, (_, index) => {
      const t = index / divisions
      return groundedPoint(from[0] + (to[0] - from[0]) * t, from[2] + (to[2] - from[2]) * t)
    })
    const length = path.slice(1).reduce((sum, point, index) => sum + Math.hypot(...point.map((value, axis) => value - path[index][axis])), 0)
    return { ...connection, path, travelTicks: Math.ceil(length / (1.8 * ARENA_RULES.stepMs / 1000)) }
  })
  const config: MarbleWorldConfig = {
    enabled: true, configured: true, id: ARENA_WORLD.id, name: ARENA_WORLD.name,
    splat: { url: ARENA_WORLD.splatUrl, format: 'spz' }, collider: { url: ARENA_WORLD.colliderUrl },
    hqMesh: { url: ARENA_WORLD.hqMeshUrl },
    bounds: [12, 8, 14], spawnBounds: [6, 2, 8], spawnHeight: 1,
  }
  return {
    config,
    center: [7, 1, 4],
    floodZones: [
      { position: [4, 1.02, 2], size: [1.35, 3.2] },
      { position: [4, 1.02, 6], size: [1.35, 3.2] },
      { position: [7, 1.02, 2], size: [1.0, 2.0] },
      { position: [7, 1.02, 6], size: [1.0, 2.0] },
    ],
    scenario: {
      id: 'cloudbank-practice-01', worldVersion: ARENA_WORLD.version, split: 'practice', seed: 20260905,
      durationTicks: 1200,
      nodes,
      edges,
      entrants: [
        { id: 'champion', baseNode: 'champion-base', policyVersion: 'baseline.safe.v2' },
        { id: 'rival', baseNode: 'rival-base', policyVersion: 'baseline.greedy.v2' },
      ],
      resources: [
        // Valley center: high-volume, floodable risk
        { id: 'core-1', nodeId: 'valley-center', value: 1 },
        { id: 'core-2', nodeId: 'valley-center', value: 1 },
        { id: 'core-3', nodeId: 'valley-center', value: 1 },
        { id: 'core-4', nodeId: 'valley-center', value: 1 },
        // Ridge center: safe, high-value
        { id: 'core-5', nodeId: 'ridge-center', value: 2 },
        { id: 'core-6', nodeId: 'ridge-center', value: 2 },
        // Cross-route junctions: medium, safe
        { id: 'core-7', nodeId: 'cross-n', value: 1 },
        { id: 'core-8', nodeId: 'cross-n', value: 1 },
        { id: 'core-9', nodeId: 'cross-s', value: 1 },
        { id: 'core-10', nodeId: 'cross-s', value: 1 },
        // Ridge junctions: safe, low-value, spread out
        { id: 'core-11', nodeId: 'ridge-n1', value: 1 },
        { id: 'core-12', nodeId: 'ridge-s1', value: 1 },
      ],
      floods: [
        { startTick: 100, endTick: 400 },
        { startTick: 600, endTick: 900 },
        { startTick: 1000, endTick: 1200 },
      ],
    },
  }
}

export type CoursePlayMode = 'practice' | 'compete'

/**
 * Same grounded world, different match. Compete keeps the collider and routes
 * but shifts floods and cores so the player cannot coach on the scored layout.
 */
export function applyCourseMode(base: ArenaCourse, mode: CoursePlayMode): ArenaCourse {
  const next = structuredClone(base)
  if (mode === 'practice') {
    next.scenario.id = 'cloudbank-practice-01'
    next.scenario.split = 'practice'
    next.scenario.seed = 20260905
    next.scenario.floods = [
      { startTick: 100, endTick: 400 },
      { startTick: 600, endTick: 900 },
      { startTick: 1000, endTick: 1200 },
    ]
    next.scenario.resources = [
      { id: 'core-1', nodeId: 'valley-center', value: 1 },
      { id: 'core-2', nodeId: 'valley-center', value: 1 },
      { id: 'core-3', nodeId: 'valley-center', value: 1 },
      { id: 'core-4', nodeId: 'valley-center', value: 1 },
      { id: 'core-5', nodeId: 'ridge-center', value: 2 },
      { id: 'core-6', nodeId: 'ridge-center', value: 2 },
      { id: 'core-7', nodeId: 'cross-n', value: 1 },
      { id: 'core-8', nodeId: 'cross-n', value: 1 },
      { id: 'core-9', nodeId: 'cross-s', value: 1 },
      { id: 'core-10', nodeId: 'cross-s', value: 1 },
      { id: 'core-11', nodeId: 'ridge-n1', value: 1 },
      { id: 'core-12', nodeId: 'ridge-s1', value: 1 },
    ]
    return next
  }
  next.scenario.id = 'cloudbank-compete-01'
  next.scenario.split = 'evaluation'
  next.scenario.seed = 20260916
  next.scenario.floods = [
    { startTick: 80, endTick: 520 },
    { startTick: 740, endTick: 1180 },
  ]
  next.scenario.resources = [
    { id: 'core-1', nodeId: 'ridge-north', value: 2 },
    { id: 'core-2', nodeId: 'ridge-south', value: 2 },
    { id: 'core-3', nodeId: 'ridge-n1', value: 1 },
    { id: 'core-4', nodeId: 'ridge-s1', value: 1 },
    { id: 'core-5', nodeId: 'cross-n', value: 1 },
    { id: 'core-6', nodeId: 'cross-s', value: 1 },
    { id: 'core-7', nodeId: 'valley-center', value: 1 },
    { id: 'core-8', nodeId: 'valley-center', value: 1 },
    { id: 'core-9', nodeId: 'cross-c', value: 1 },
    { id: 'core-10', nodeId: 'valley-n1', value: 1 },
    { id: 'core-11', nodeId: 'valley-s1', value: 1 },
    { id: 'core-12', nodeId: 'ridge-center', value: 2 },
  ]
  return next
}

export async function loadArenaCourse(signal?: AbortSignal) {
  signal?.throwIfAborted()
  const response = await fetch(ARENA_WORLD.colliderUrl, { signal })
  if (!response.ok) throw new Error(`Collider request failed (${response.status})`)
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength === 0 || buffer.byteLength > 4_000_000) throw new Error('Collider size is outside the course budget')
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
  if (hash !== ARENA_WORLD.colliderSha256) throw new Error('Collider hash does not match the versioned course')
  signal?.throwIfAborted()
  await initializeArenaPhysics()
  const gltf = await new GLTFLoader().parseAsync(buffer, '')
  let physics: ArenaPhysics | undefined
  try {
    signal?.throwIfAborted()
    const surface = createWorldSurface(gltf.scene)
    try {
      physics = new ArenaPhysics(surface.colliderData())
    } finally {
      surface.dispose()
    }
    const course = buildArenaCourse(physics)
    const loadedPhysics = physics
    return { course, physics: loadedPhysics, dispose: () => loadedPhysics.dispose() }
  } catch (error) {
    physics?.dispose()
    throw error
  } finally {
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
    })
  }
}

export type LoadedArenaCourse = Awaited<ReturnType<typeof loadArenaCourse>>
