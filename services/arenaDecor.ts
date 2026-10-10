import * as THREE from 'three'
import type { ArenaCourse } from './arenaCourse'

export type DecorPropType = 'generator' | 'dish' | 'barrels'

export interface DecorCandidate {
  type: DecorPropType
  x: number
  z: number
  yaw: number
  scale: number
}

export interface PlacedDecor extends DecorCandidate {
  y: number
}

const PROP_SCALE: Record<DecorPropType, number> = { generator: 0.6, dish: 1, barrels: 1 }

export const PROP_RADIUS: Record<DecorPropType, number> = { generator: 0.45, dish: 0.45, barrels: 0.4 }

const BASE_OFFSETS: { type: DecorPropType; outward: number; lateral: number }[] = [
  { type: 'generator', outward: 1.8, lateral: 0 },
  { type: 'dish', outward: 1.8, lateral: 1 },
  { type: 'barrels', outward: 1.8, lateral: -1 },
]

const ROUTE_CLEARANCE = 1.4
const PAIR_CLEARANCE = 0.9
const MIN_GROUND_NORMAL_Y = 0.7

function horizontalSegmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const lengthSq = dx * dx + dz * dz
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq)) : 0
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

export function planArenaDecor(course: ArenaCourse, lite = false): DecorCandidate[] {
  const scenario = course.scenario
  const nodeById = new Map(scenario.nodes.map(node => [node.id, node.position]))
  const accepted: DecorCandidate[] = []
  const limit = lite ? 2 : 6
  for (const entrant of scenario.entrants) {
    const base = nodeById.get(entrant.baseNode)
    if (!base) continue
    const outwardX = base[0] - course.center[0]
    const outwardZ = base[2] - course.center[2]
    const outwardLength = Math.hypot(outwardX, outwardZ)
    if (outwardLength < 1e-6) continue
    const dirX = outwardX / outwardLength
    const dirZ = outwardZ / outwardLength
    const lateralX = -dirZ
    const lateralZ = dirX
    for (const slot of BASE_OFFSETS) {
      if (accepted.length >= limit) return accepted
      if (lite && slot.type !== 'generator') continue
      const x = base[0] + dirX * slot.outward + lateralX * slot.lateral
      const z = base[2] + dirZ * slot.outward + lateralZ * slot.lateral
      let clear = true
      for (const node of scenario.nodes) {
        if (Math.hypot(x - node.position[0], z - node.position[2]) < ROUTE_CLEARANCE) { clear = false; break }
      }
      if (clear) {
        for (const edge of scenario.edges) {
          const points = edge.path ?? [nodeById.get(edge.from)!, nodeById.get(edge.to)!]
          for (let index = 1; index < points.length; index++) {
            const a = points[index - 1]
            const b = points[index]
            if (horizontalSegmentDistance(x, z, a[0], a[2], b[0], b[2]) < ROUTE_CLEARANCE) { clear = false; break }
          }
          if (!clear) break
        }
      }
      if (clear) {
        for (const other of accepted) {
          if (Math.hypot(x - other.x, z - other.z) < PAIR_CLEARANCE) { clear = false; break }
        }
      }
      if (!clear) continue
      accepted.push({
        type: slot.type,
        x,
        z,
        yaw: Math.atan2(dirX, dirZ),
        scale: PROP_SCALE[slot.type],
      })
    }
  }
  return accepted
}

export function createDecorModel(source: THREE.Group): THREE.Group {
  const anchor = new THREE.Group()
  anchor.add(source.clone(true))
  anchor.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(anchor)
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3())
    anchor.position.set(-center.x, -box.min.y, -center.z)
  }
  anchor.traverse(object => {
    object.raycast = () => { }
    if (object instanceof THREE.Mesh) object.castShadow = false
  })
  const root = new THREE.Group()
  root.add(anchor)
  return root
}

export function groundDecor(terrain: THREE.Object3D, candidates: DecorCandidate[]): PlacedDecor[] {
  const bounds = new THREE.Box3().setFromObject(terrain)
  if (bounds.isEmpty()) return []
  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const origin = new THREE.Vector3()
  const placed: PlacedDecor[] = []
  for (const candidate of candidates) {
    origin.set(candidate.x, bounds.max.y + 1, candidate.z)
    raycaster.set(origin, down)
    const hit = raycaster.intersectObject(terrain, true)[0]
    if (!hit || !hit.face) continue
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    if (normal.y < MIN_GROUND_NORMAL_Y) continue
    placed.push({ ...candidate, y: hit.point.y })
  }
  return placed
}
