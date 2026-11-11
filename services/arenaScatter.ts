import * as THREE from 'three'
import type { ArenaCourse } from './arenaCourse'
import { WORLDGEN_BOUNDS } from './arenaWorldgen'
import { horizontalSegmentDistance } from './arenaDecor'

/**
 * Ground scatter for generated worlds only. Props are decoration: they are
 * never added to the collider, so a certified world stays certified however
 * they are placed — the clearance rules below exist so they cannot sit on a
 * route the rover has to drive, not to protect the certificate.
 */

export type ScatterPropType = 'boulder' | 'scrub'

export interface ScatterCandidate {
  type: ScatterPropType
  x: number
  z: number
  yaw: number
  /** Footprint across, in metres; the renderer scales the model to fit. */
  size: number
}

export interface PlacedScatter extends ScatterCandidate {
  y: number
}

export const SCATTER_ROUTE_CLEARANCE = 1.6
const PAIR_CLEARANCE = 1.6
const MIN_GROUND_NORMAL_Y = 0.5
/** Scrub only establishes on the low ground; boulders are found anywhere. */
const SCRUB_MAX_HEIGHT_FRACTION = 0.45
const COUNT_BY_MODE = { normal: 18, lite: 5 } as const
const PROPOSAL_BUDGET = 80

function seedFrom(worldId: string): number {
  const hex = Number.parseInt(worldId.slice(-8), 16)
  return Number.isFinite(hex) ? hex >>> 0 : 1
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function insideFloodZone(course: ArenaCourse, x: number, z: number, margin: number): boolean {
  return course.floodZones.some(zone => {
    const [width, depth] = zone.size
    return Math.abs(x - zone.position[0]) < width / 2 + margin && Math.abs(z - zone.position[2]) < depth / 2 + margin
  })
}

/**
 * Deterministic scatter: the world id is the spec digest, so the same prompt
 * always grows the same rocks — a receipt quoted on camera cannot drift
 * between takes.
 */
export function planScatter(course: ArenaCourse, options: { lite?: boolean } = {}): ScatterCandidate[] {
  const generated = course.generated
  if (!generated) return []
  const random = mulberry32(seedFrom(generated.worldId))
  const density = Math.min(1, Math.max(0, generated.spec.rockDensity))
  const target = Math.round(COUNT_BY_MODE[options.lite ? 'lite' : 'normal'] * density)
  if (target <= 0) return []

  const scenario = course.scenario
  const nodeById = new Map(scenario.nodes.map(node => [node.id, node.position]))
  const spanX = WORLDGEN_BOUNDS.maxX - WORLDGEN_BOUNDS.minX
  const spanZ = WORLDGEN_BOUNDS.maxZ - WORLDGEN_BOUNDS.minZ
  const accepted: ScatterCandidate[] = []

  for (let attempt = 0; attempt < target * PROPOSAL_BUDGET && accepted.length < target; attempt++) {
    const x = WORLDGEN_BOUNDS.minX + random() * spanX
    const z = WORLDGEN_BOUNDS.minZ + random() * spanZ
    const type: ScatterPropType = random() < 0.6 ? 'boulder' : 'scrub'
    const size = type === 'boulder' ? 1.2 + random() * 1.2 : 0.5 + random() * 0.5
    if (insideFloodZone(course, x, z, size / 2)) continue
    if (scenario.nodes.some(node => Math.hypot(x - node.position[0], z - node.position[2]) < SCATTER_ROUTE_CLEARANCE)) continue
    if (scenario.edges.some(edge => {
      const points = edge.path ?? [nodeById.get(edge.from)!, nodeById.get(edge.to)!]
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1]
        const b = points[index]
        if (horizontalSegmentDistance(x, z, a[0], a[2], b[0], b[2]) < SCATTER_ROUTE_CLEARANCE) return true
      }
      return false
    })) continue
    if (accepted.some(other => Math.hypot(x - other.x, z - other.z) < PAIR_CLEARANCE + size / 2)) continue
    accepted.push({ type, x, z, yaw: random() * Math.PI * 2, size })
  }
  return accepted
}

/**
 * Drop each candidate onto the terrain mesh: rejected when it misses the
 * ground, lands on a wall-steep flank, or puts scrub on high ground. The scrub
 * cut is taken from the surface the props actually land on, not the mesh's
 * bounding box, which also contains the skirt that closes the collider.
 */
export function placeScatter(terrain: THREE.Object3D, candidates: ScatterCandidate[]): PlacedScatter[] {
  const bounds = new THREE.Box3().setFromObject(terrain)
  if (bounds.isEmpty()) return []
  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const origin = new THREE.Vector3()
  const hits: { candidate: ScatterCandidate; y: number }[] = []
  for (const candidate of candidates) {
    origin.set(candidate.x, bounds.max.y + 1, candidate.z)
    raycaster.set(origin, down)
    const hit = raycaster.intersectObject(terrain, true)[0]
    if (!hit || !hit.face) continue
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    if (normal.y < MIN_GROUND_NORMAL_Y) continue
    hits.push({ candidate, y: hit.point.y })
  }
  let floorY = Infinity
  let crestY = -Infinity
  for (const hit of hits) {
    if (hit.y < floorY) floorY = hit.y
    if (hit.y > crestY) crestY = hit.y
  }
  const ceiling = floorY + SCRUB_MAX_HEIGHT_FRACTION * Math.max(1e-6, crestY - floorY)
  return hits
    .filter(hit => hit.candidate.type !== 'scrub' || hit.y <= ceiling)
    .map(hit => ({ ...hit.candidate, y: hit.y }))
}
