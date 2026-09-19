import {
  ARENA_RULES,
  type ArenaPosition,
  type ArenaScenario,
} from './arenaEpisode'
import {
  ARENA_WORLD,
  TEMPLATE_CONNECTIONS,
  TEMPLATE_STATIONS,
  groundPath,
  groundPoint,
  pathLength,
  travelTicksForLength,
} from './arenaCourse'
import { ArenaPhysics } from './arenaPhysics'

/**
 * Course family generator (docs: move 4 of the long-term plan).
 *
 * The Blender terrain stays the single source of truth; this module explores
 * GRAPH layouts on the pinned collider. Each layout keeps the Course 02
 * grammar (floodable valley corridor, safe ridge corridor, mid-elevation
 * cross links) while jittering station positions and sparsely dropping
 * redundant links. Candidates that violate the declared invariants are
 * REJECTED (bounded attempts, loud failure) — never rescued at runtime.
 *
 * Family scenarios share the grounded world's version (same terrain, same
 * physics) but carry distinct `sandstone-family-*` ids under the evaluation
 * split, so the held-out story becomes statistical instead of a single
 * layout. They are eval-only: `isEvaluationScenario` recognizes the prefix
 * and the training guards refuse their examples.
 */

export const FAMILY_LAYOUT_SEEDS = [20261001, 20261002, 20261003, 20261004] as const
const MAX_ATTEMPTS_PER_LAYOUT = 25
const MIN_BASE_SEPARATION_TICKS = 120
const MIN_BASE_EXITS = 2
const MIN_RIDGE_VALLEY_RISE = 0.8

/** Redundant links: safe to drop as long as the invariants still hold. */
const DROPPABLE_EDGE_IDS = [
  'cross-cn-cc', 'cross-cc-cs', 'cross-cs-s2', 'cross-s2-far',
  'shortcut-cb-cn', 'shortcut-rb-far',
  'diag-vn-rn', 'diag-vs3-rs',
  'valley-cb-vc', 'valley-rb-vs3',
  'ridge-rn-rc', 'ridge-rs-s3',
] as const

/** Deterministic RNG — no Math.random anywhere in generation. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface FamilyStation {
  id: string
  x: number
  z: number
}

export interface FamilyLayout {
  index: number
  seed: number
  attempts: number
  stations: FamilyStation[]
  droppedEdgeIds: string[]
  scenario: ArenaScenario
  center: ArenaPosition
  floodZones: { position: ArenaPosition; size: [number, number] }[]
}

function corridorOf(templateX: number): 'valley' | 'ridge' | 'cross' {
  if (templateX < 6) return 'valley'
  if (templateX > 8.5) return 'ridge'
  return 'cross'
}

function jitterStations(rng: () => number): FamilyStation[] {
  return TEMPLATE_STATIONS.map(station => {
    const corridor = corridorOf(station.x)
    const xBand = corridor === 'valley' ? [3.2, 4.8] : corridor === 'ridge' ? [9.2, 10.8] : [6.2, 7.8]
    const x = Math.min(xBand[1], Math.max(xBand[0], station.x + (rng() * 2 - 1) * 0.8))
    const z = Math.min(17.0, Math.max(-1.0, station.z + (rng() * 2 - 1) * 1.5))
    return { id: station.id, x, z }
  })
}

function dropEdges(rng: () => number): string[] {
  const count = Math.floor(rng() * 3) // 0–2 redundant links
  const pool = [...DROPPABLE_EDGE_IDS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

function shortestPathTicks(
  edges: readonly { id: string; from: string; to: string; travelTicks: number }[],
  from: string,
  to: string,
): number | null {
  const dist = new Map<string, number>([[from, 0]])
  const visited = new Set<string>()
  for (;;) {
    let current: string | null = null
    let best = Infinity
    for (const [node, cost] of dist) {
      if (!visited.has(node) && cost < best) {
        current = node
        best = cost
      }
    }
    if (current === null) return null
    if (current === to) return best
    visited.add(current)
    for (const edge of edges) {
      const neighbor = edge.from === current ? edge.to : edge.to === current ? edge.from : null
      if (neighbor === null || visited.has(neighbor)) continue
      const cost = best + edge.travelTicks
      if (cost < (dist.get(neighbor) ?? Infinity)) dist.set(neighbor, cost)
    }
  }
}

/**
 * Pure topology + economy validation (no physics needed): connectivity, base
 * exits, base separation, flood non-isolation, resource reachability and
 * reference-bounded spread. Throws a named error on the first violation.
 */
export function validateFamilyTopology(
  nodes: readonly { id: string }[],
  edges: readonly { id: string; from: string; to: string; travelTicks: number; floodable: boolean }[],
  resources: readonly { id: string; nodeId: string; value: number }[],
): void {
  const nodeIds = new Set(nodes.map(n => n.id))
  const reachable = (allowed: typeof edges): Set<string> => {
    const seen = new Set<string>(['champion-base'])
    const queue = ['champion-base']
    while (queue.length > 0) {
      const current = queue.pop()!
      for (const edge of allowed) {
        const neighbor = edge.from === current ? edge.to : edge.to === current ? edge.from : null
        if (neighbor !== null && nodeIds.has(neighbor) && !seen.has(neighbor)) {
          seen.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    return seen
  }

  const all = reachable(edges)
  if (all.size !== nodeIds.size) {
    throw new Error(`family-reject: disconnected graph (${all.size}/${nodeIds.size} reachable from champion-base)`)
  }
  const dry = reachable(edges.filter(e => !e.floodable))
  if (dry.size !== nodeIds.size) {
    throw new Error(`family-reject: floods isolate the course (${dry.size}/${nodeIds.size} reachable on dry edges)`)
  }
  for (const base of ['champion-base', 'rival-base']) {
    const exits = edges.filter(e => e.from === base || e.to === base).length
    if (exits < MIN_BASE_EXITS) throw new Error(`family-reject: base ${base} has ${exits} exits (< ${MIN_BASE_EXITS})`)
  }
  const separation = shortestPathTicks(edges, 'champion-base', 'rival-base')
  if (separation === null || separation < MIN_BASE_SEPARATION_TICKS) {
    throw new Error(`family-reject: base separation ${separation} ticks (< ${MIN_BASE_SEPARATION_TICKS})`)
  }
  const totalValue = resources.reduce((sum, r) => sum + r.value, 0)
  if (resources.length !== 18 || totalValue !== 22) {
    throw new Error(`family-reject: resource spread drifted (${resources.length} cores, value ${totalValue}; want 18/22)`)
  }
  for (const resource of resources) {
    if (!all.has(resource.nodeId)) throw new Error(`family-reject: resource ${resource.id} on unreachable node ${resource.nodeId}`)
  }
}

const FAMILY_FLOODS = [
  { startTick: 80, endTick: 520 },
  { startTick: 740, endTick: 1180 },
]

const FAMILY_RESOURCES: ArenaScenario['resources'] = [
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

function tryBuildLayout(physics: ArenaPhysics, index: number, seed: number, attempt: number): FamilyLayout {
  const rng = mulberry32(seed + attempt * 7919)
  const stations = jitterStations(rng)
  const droppedEdgeIds = dropEdges(rng)
  const dropped = new Set(droppedEdgeIds)
  const stationById = new Map(stations.map(s => [s.id, s]))

  const nodes = stations.map(station => ({ id: station.id, position: groundPoint(physics, station.x, station.z) }))
  for (const node of nodes) {
    if (!physics.canStand(node.position)) throw new Error(`family-reject: station ${node.id} lacks rover clearance`)
  }
  const edges = TEMPLATE_CONNECTIONS.filter(c => !dropped.has(c.id)).map(connection => {
    const from = stationById.get(connection.from)!
    const to = stationById.get(connection.to)!
    const path = groundPath(physics, from.x, from.z, to.x, to.z)
    return { ...connection, path, travelTicks: travelTicksForLength(pathLength(path)) }
  })

  const ridge = nodes.find(n => n.id === 'ridge-center')!.position
  const valley = nodes.find(n => n.id === 'valley-center')!.position
  if (ridge[1] - valley[1] < MIN_RIDGE_VALLEY_RISE) {
    throw new Error(`family-reject: ridge/valley rise ${(ridge[1] - valley[1]).toFixed(2)} (< ${MIN_RIDGE_VALLEY_RISE})`)
  }
  validateFamilyTopology(nodes, edges, FAMILY_RESOURCES)

  const valleyX = stations.filter(s => corridorOf(TEMPLATE_STATIONS.find(t => t.id === s.id)!.x) === 'valley')
    .reduce((sum, s) => sum + s.x, 0) / stations.filter(s => corridorOf(TEMPLATE_STATIONS.find(t => t.id === s.id)!.x) === 'valley').length
  const centerY = groundPoint(physics, 7, 8)[1]
  return {
    index,
    seed,
    attempts: attempt + 1,
    stations,
    droppedEdgeIds,
    scenario: {
      id: `sandstone-family-0${index}`,
      worldVersion: ARENA_WORLD.version,
      split: 'evaluation',
      seed,
      durationTicks: 1200,
      nodes,
      edges,
      entrants: [
        { id: 'champion', baseNode: 'champion-base', policyVersion: 'baseline.safe.v2' },
        { id: 'rival', baseNode: 'rival-base', policyVersion: 'reference.greedy.v2' },
      ],
      resources: FAMILY_RESOURCES.map(r => ({ ...r })),
      floods: FAMILY_FLOODS.map(f => ({ ...f })),
    },
    center: [7, centerY, 8],
    floodZones: [2, 6, 13].map(z => {
      const [x, y, depth] = groundPoint(physics, valleyX, z)
      return { position: [x, y + 0.09, depth] as ArenaPosition, size: [1.35, 2.4] as [number, number] }
    }),
  }
}

/**
 * Generate the full family on the given collider. Creates and disposes its own
 * grounding probe; the caller owns match-time physics worlds. Deterministic:
 * same collider + same seeds → identical layouts.
 */
export function generateCourseFamily(
  collider: { vertices: Float32Array; indices: Uint32Array },
  seeds: readonly number[] = FAMILY_LAYOUT_SEEDS,
): FamilyLayout[] {
  const physics = new ArenaPhysics(collider)
  try {
    return seeds.map((seed, i) => {
      const index = i + 1
      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_LAYOUT; attempt++) {
        try {
          return tryBuildLayout(physics, index, seed, attempt)
        } catch (err) {
          const retryable = err instanceof Error && (/^family-reject:/.test(err.message) || /Unsupported course surface|rover clearance/.test(err.message))
          if (!retryable || attempt === MAX_ATTEMPTS_PER_LAYOUT - 1) throw err
        }
      }
      throw new Error(`family-reject: layout ${index} exhausted ${MAX_ATTEMPTS_PER_LAYOUT} attempts`)
    })
  } finally {
    physics.dispose()
  }
}
