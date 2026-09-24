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

export interface BankDeltaEvent {
  id: string
  delta: number
}

export interface BankDeltaScan {
  events: BankDeltaEvent[]
  seen: Record<string, number>
}

/**
 * Pure bank-event detector for presentation effects (e.g. the bank burst).
 * Compares the current per-agent banked totals against the previously seen
 * map. Agents absent from `previous` are baselined silently — first sight is
 * never an event. Only positive deltas are reported; callers own scrub/reset
 * handling (tick regression) by discarding `seen` and re-baselining.
 */
export function detectBankDeltas(
  previous: Readonly<Record<string, number>>,
  agents: readonly { id: string; banked: number }[],
): BankDeltaScan {
  const events: BankDeltaEvent[] = []
  const seen: Record<string, number> = {}
  for (const agent of agents) {
    const before = previous[agent.id] ?? agent.banked
    seen[agent.id] = agent.banked
    const delta = agent.banked - before
    if (delta > 0) events.push({ id: agent.id, delta })
  }
  return { events, seen }
}

export interface CollectEvent {
  id: string
  by: string
}

export interface CollectScan {
  events: CollectEvent[]
  seen: Record<string, string | null>
}

/**
 * Pure collect-event detector for presentation effects. Reports resources
 * whose `collectedBy` transitioned from uncollected to an agent id.
 * Resources absent from `previous` are baselined silently — first sight is
 * never an event. Callers own scrub/reset handling by discarding `seen`.
 */
export function detectCollectEvents(
  previous: Readonly<Record<string, string | null>>,
  resources: readonly { id: string; collectedBy: string | null }[],
): CollectScan {
  const events: CollectEvent[] = []
  const seen: Record<string, string | null> = {}
  for (const resource of resources) {
    const before = resource.id in previous ? previous[resource.id] : resource.collectedBy
    seen[resource.id] = resource.collectedBy
    if (before === null && resource.collectedBy !== null) {
      events.push({ id: resource.id, by: resource.collectedBy })
    }
  }
  return { events, seen }
}
