import { ARENA_RULES, type ArenaPosition, type ArenaScenario } from './arenaEpisode'
import { ArenaPhysics, initializeArenaPhysics } from './arenaPhysics'
import { disposeArenaTerrain, loadArenaTerrain } from './arenaTerrain'
import { createWorldSurface } from './worldSurface'

export const ARENA_WORLD = Object.freeze({
  version: 'sandstone-basin-course-2',
  id: 'sandstone-basin',
  name: 'Sandstone Basin / Course 02',
  colliderUrl: '/terrain/sandstone-basin.glb',
  terrainUrl: '/terrain/sandstone-basin.glb',
  colliderSha256: '7633067b2624fb476f36adfb14e1a13b1325c71143fbd4d5087cfaf209c993af',
})

export interface ArenaCourse {
  scenario: ArenaScenario
  config: { id: string; name: string; terrain: { url: string; sha256: string } }
  center: ArenaPosition
  floodZones: { position: ArenaPosition; size: [number, number] }[]
}

/** Shared traversal speed (m/s) converting grounded path length to travelTicks. */
export const COURSE_TRAVEL_SPEED = 1.8

/** Sample the collider at (x, z); throws when the surface cannot carry a rover. */
export function groundPoint(physics: ArenaPhysics, x: number, z: number): ArenaPosition {
  const sample = physics.sample([x, 8, z], 12)
  if (!sample || sample.normal[1] < 0.7) throw new Error(`Unsupported course surface at ${x.toFixed(2)}, ${z.toFixed(2)}`)
  return sample.point
}

/** Grounded polyline between two ground-plane points, sampled every ~0.2 m. */
export function groundPath(
  physics: ArenaPhysics,
  fromX: number, fromZ: number, toX: number, toZ: number,
): ArenaPosition[] {
  const from = groundPoint(physics, fromX, fromZ)
  const to = groundPoint(physics, toX, toZ)
  const divisions = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[2] - from[2]) / 0.2))
  return Array.from({ length: divisions + 1 }, (_, index) => {
    const t = index / divisions
    return groundPoint(physics, fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t)
  })
}

export function pathLength(path: readonly ArenaPosition[]): number {
  return path.slice(1).reduce((sum, point, index) => sum + Math.hypot(...point.map((value, axis) => value - path[index][axis])), 0)
}

export function travelTicksForLength(length: number): number {
  return Math.ceil(length / (COURSE_TRAVEL_SPEED * ARENA_RULES.stepMs / 1000))
}
/** Template station layout (ground-plane coords) — also the family generator's grammar. */
export const TEMPLATE_STATIONS = [
  // Valley corridor (X=4) — floodable low route, champion north to rival south
  { id: 'champion-base', x: 4, z: 0 },
  { id: 'valley-n1', x: 4, z: 1.5 },
  { id: 'valley-center', x: 4, z: 4 },
  { id: 'valley-s1', x: 4, z: 6.5 },
  { id: 'valley-s2', x: 4, z: 10 },
  { id: 'valley-s3', x: 4, z: 13 },
  { id: 'rival-base', x: 4, z: 16 },
  // Ridge corridor (X=10) — safe high route
  { id: 'ridge-north', x: 10, z: 0 },
  { id: 'ridge-n1', x: 10, z: 1.5 },
  { id: 'ridge-center', x: 10, z: 4 },
  { id: 'ridge-s1', x: 10, z: 6.5 },
  { id: 'ridge-s2', x: 10, z: 10 },
  { id: 'ridge-s3', x: 10, z: 13 },
  { id: 'ridge-south', x: 10, z: 16 },
  // Cross-route junctions (X=7) — mid-elevation connections
  { id: 'cross-n', x: 7, z: 2 },
  { id: 'cross-c', x: 7, z: 4 },
  { id: 'cross-s', x: 7, z: 6 },
  { id: 'cross-s2', x: 7, z: 10 },
  { id: 'cross-far', x: 7, z: 13.5 },
] as const

/** Template edge list — corridor links are structural; cross/shortcut links are droppable. */
export const TEMPLATE_CONNECTIONS = [  // Valley corridor (floodable low route)
  { id: 'valley-cb-n1', from: 'champion-base', to: 'valley-n1', floodable: true },
  { id: 'valley-n1-vc', from: 'valley-n1', to: 'valley-center', floodable: true },
  { id: 'valley-vc-s1', from: 'valley-center', to: 'valley-s1', floodable: true },
  { id: 'valley-s1-s2', from: 'valley-s1', to: 'valley-s2', floodable: true },
  { id: 'valley-s2-s3', from: 'valley-s2', to: 'valley-s3', floodable: true },
  { id: 'valley-s3-rb', from: 'valley-s3', to: 'rival-base', floodable: true },
  // Ridge corridor (safe high route)
  { id: 'ridge-rn-r1', from: 'ridge-north', to: 'ridge-n1', floodable: false },
  { id: 'ridge-r1-rc', from: 'ridge-n1', to: 'ridge-center', floodable: false },
  { id: 'ridge-rc-r1s', from: 'ridge-center', to: 'ridge-s1', floodable: false },
  { id: 'ridge-s1-s2', from: 'ridge-s1', to: 'ridge-s2', floodable: false },
  { id: 'ridge-s2-s3', from: 'ridge-s2', to: 'ridge-s3', floodable: false },
  { id: 'ridge-s3-rs', from: 'ridge-s3', to: 'ridge-south', floodable: false },
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
  { id: 'cross-cs-s2', from: 'cross-s', to: 'cross-s2', floodable: false },
  { id: 'cross-s2-far', from: 'cross-s2', to: 'cross-far', floodable: false },
  // Southern cross-route connections (mid-elevation)
  { id: 'cross-vs2-s2', from: 'valley-s2', to: 'cross-s2', floodable: false },
  { id: 'cross-s2-rs2', from: 'cross-s2', to: 'ridge-s2', floodable: false },
  { id: 'cross-vs3-far', from: 'valley-s3', to: 'cross-far', floodable: false },
  { id: 'cross-far-rs3', from: 'cross-far', to: 'ridge-s3', floodable: false },
  // Floodable shortcuts (risky but fast)
  { id: 'shortcut-cb-cn', from: 'champion-base', to: 'cross-n', floodable: true },
  { id: 'shortcut-rb-far', from: 'rival-base', to: 'cross-far', floodable: true },
  // Long diagonal shortcuts (floodable, high risk)
  { id: 'diag-vn-rn', from: 'valley-n1', to: 'ridge-north', floodable: true },
  { id: 'diag-vs3-rs', from: 'valley-s3', to: 'ridge-south', floodable: true },
  // Valley long jumps (floodable, skip intermediate nodes)
  { id: 'valley-cb-vc', from: 'champion-base', to: 'valley-center', floodable: true },
  { id: 'valley-rb-vs3', from: 'rival-base', to: 'valley-s3', floodable: true },
  // Ridge long jumps (dry, skip intermediate nodes)
  { id: 'ridge-rn-rc', from: 'ridge-north', to: 'ridge-center', floodable: false },
  { id: 'ridge-rs-s3', from: 'ridge-south', to: 'ridge-s3', floodable: false },
] as const

export function buildArenaCourse(physics: ArenaPhysics): ArenaCourse {
  const stationById = new Map(TEMPLATE_STATIONS.map(station => [station.id, station]))
  const nodes = TEMPLATE_STATIONS.map(station => ({ id: station.id, position: groundPoint(physics, station.x, station.z) }))
  for (const node of nodes) {
    if (!physics.canStand(node.position)) throw new Error(`Course station lacks rover clearance: ${node.id}`)
  }
  const edges = TEMPLATE_CONNECTIONS.map(connection => {
    const from = stationById.get(connection.from)!
    const to = stationById.get(connection.to)!
    const path = groundPath(physics, from.x, from.z, to.x, to.z)
    return { ...connection, path, travelTicks: travelTicksForLength(pathLength(path)) }
  })
  const config: ArenaCourse['config'] = {
    id: ARENA_WORLD.id,
    name: ARENA_WORLD.name,
    terrain: { url: ARENA_WORLD.terrainUrl, sha256: ARENA_WORLD.colliderSha256 },
  }
  return {
    config,
    center: [7, 0.55, 8],
    floodZones: [2, 6, 13].map(z => {
      const [x, y, depth] = groundPoint(physics, 4, z)
      return { position: [x, y + 0.09, depth] as ArenaPosition, size: [1.35, 2.4] as [number, number] }
    }),
    scenario: {
      id: 'sandstone-practice-01', worldVersion: ARENA_WORLD.version, split: 'practice', seed: 20260905,
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
        // Southern extension: reward long runs into new territory
        { id: 'core-13', nodeId: 'valley-s2', value: 1 },
        { id: 'core-14', nodeId: 'valley-s3', value: 1 },
        { id: 'core-15', nodeId: 'ridge-s2', value: 1 },
        { id: 'core-16', nodeId: 'ridge-s3', value: 2 },
        { id: 'core-17', nodeId: 'cross-far', value: 2 },
        { id: 'core-18', nodeId: 'cross-s2', value: 1 },
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
    next.scenario.id = 'sandstone-practice-01'
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
      { id: 'core-13', nodeId: 'valley-s2', value: 1 },
      { id: 'core-14', nodeId: 'valley-s3', value: 1 },
      { id: 'core-15', nodeId: 'ridge-s2', value: 1 },
      { id: 'core-16', nodeId: 'ridge-s3', value: 2 },
      { id: 'core-17', nodeId: 'cross-far', value: 2 },
      { id: 'core-18', nodeId: 'cross-s2', value: 1 },
    ]
    return next
  }
  next.scenario.id = 'sandstone-compete-01'
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
    { id: 'core-13', nodeId: 'valley-s2', value: 1 },
    { id: 'core-14', nodeId: 'ridge-s2', value: 1 },
    { id: 'core-15', nodeId: 'cross-s2', value: 1 },
    { id: 'core-16', nodeId: 'valley-s3', value: 1 },
    { id: 'core-17', nodeId: 'ridge-s3', value: 2 },
    { id: 'core-18', nodeId: 'cross-far', value: 2 },
  ]
  return next
}

export async function loadArenaCourse(signal?: AbortSignal) {
  const scene = await loadArenaTerrain(ARENA_WORLD.colliderUrl, ARENA_WORLD.colliderSha256, signal)
  let physics: ArenaPhysics | undefined
  try {
    signal?.throwIfAborted()
    await initializeArenaPhysics()
    signal?.throwIfAborted()
    const surface = createWorldSurface(scene)
    try {
      const collider = surface.colliderData()
      physics = new ArenaPhysics(collider)
      const course = buildArenaCourse(physics)
      const loadedPhysics = physics
      // Tournament matches each get an isolated physics world built from the
      // same pinned collider; callers dispose the returned motion themselves.
      const createMotion = () => new ArenaPhysics(collider)
      return { course, physics: loadedPhysics, createMotion, dispose: () => loadedPhysics.dispose() }
    } finally {
      surface.dispose()
    }
  } catch (error) {
    physics?.dispose()
    throw error
  } finally {
    disposeArenaTerrain(scene)
  }
}

export type LoadedArenaCourse = Awaited<ReturnType<typeof loadArenaCourse>>
