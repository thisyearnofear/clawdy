import * as THREE from 'three'
import type { ArenaPosition } from './arenaEpisode'

export function createRouteRibbonGeometry(
  points: readonly ArenaPosition[],
  width: number,
  lift: number,
): THREE.BufferGeometry | null {
  if (points.length < 2) return null
  const positions = new Float32Array(points.length * 2 * 3)
  const indices = new Uint32Array((points.length - 1) * 6)
  const half = width / 2
  for (let index = 0; index < points.length; index++) {
    const previous = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    let tx = next[0] - previous[0]
    let tz = next[2] - previous[2]
    const length = Math.hypot(tx, tz)
    if (length === 0) {
      tx = 1
      tz = 0
    } else {
      tx /= length
      tz /= length
    }
    const point = points[index]
    const offset = index * 6
    positions[offset] = point[0] - tz * half
    positions[offset + 1] = point[1] + lift
    positions[offset + 2] = point[2] + tx * half
    positions[offset + 3] = point[0] + tz * half
    positions[offset + 4] = point[1] + lift
    positions[offset + 5] = point[2] - tx * half
  }
  for (let index = 0; index < points.length - 1; index++) {
    const a = index * 2
    const offset = index * 6
    indices[offset] = a
    indices[offset + 1] = a + 1
    indices[offset + 2] = a + 2
    indices[offset + 3] = a + 1
    indices[offset + 4] = a + 3
    indices[offset + 5] = a + 2
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometry
}
