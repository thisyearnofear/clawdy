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
  colliderSha256: '25f82036f660641c1d8098e832455c38aa9531161225864079454fbd314b7747',
})

export interface ArenaCourse {
  scenario: ArenaScenario
  config: MarbleWorldConfig
  center: ArenaPosition
  floodZones: { position: ArenaPosition; size: [number, number] }[]
}

const STATIONS = [
  { id: 'champion-base', x: 4, z: 0 },
  { id: 'rival-base', x: 4, z: 8 },
  { id: 'resource-bank', x: 4, z: 4 },
  { id: 'ridge-north', x: 10, z: 0 },
  { id: 'ridge-center', x: 10, z: 4 },
  { id: 'ridge-south', x: 10, z: 8 },
] as const

const CONNECTIONS = [
  { id: 'north-low', from: 'champion-base', to: 'resource-bank', floodable: true },
  { id: 'south-low', from: 'rival-base', to: 'resource-bank', floodable: true },
  { id: 'north-rise', from: 'champion-base', to: 'ridge-north', floodable: false },
  { id: 'south-rise', from: 'rival-base', to: 'ridge-south', floodable: false },
  { id: 'north-ridge', from: 'ridge-north', to: 'ridge-center', floodable: false },
  { id: 'south-ridge', from: 'ridge-south', to: 'ridge-center', floodable: false },
  { id: 'ridge-bank', from: 'ridge-center', to: 'resource-bank', floodable: false },
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
    bounds: [12, 8, 14], spawnBounds: [6, 2, 8], spawnHeight: 1,
  }
  return {
    config,
    center: [7, 1, 4],
    floodZones: [
      { position: [4, 1.02, 2], size: [1.35, 3.2] },
      { position: [4, 1.02, 6], size: [1.35, 3.2] },
    ],
    scenario: {
      id: 'cloudbank-practice-01', worldVersion: ARENA_WORLD.version, split: 'practice', seed: 20260905,
      durationTicks: 1200,
      nodes,
      edges,
      entrants: [
        { id: 'champion', baseNode: 'champion-base', policyVersion: 'baseline.safe.v2' },
        { id: 'rival', baseNode: 'rival-base', policyVersion: 'baseline.weather.v2' },
      ],
      resources: Array.from({ length: 12 }, (_, index) => ({
        id: `core-${index + 1}`, nodeId: index < 8 ? 'resource-bank' : 'ridge-center', value: 1,
      })),
      floods: [{ startTick: 100, endTick: 500 }, { startTick: 700, endTick: 1100 }],
    },
  }
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
