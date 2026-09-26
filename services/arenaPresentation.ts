import * as THREE from 'three'
import type { ArenaPosition } from './arenaEpisode'

export interface PoseAgentLike {
  position: ArenaPosition
  rotation?: readonly number[] | null
}

export interface PoseSample {
  pos: THREE.Vector3
  rot: THREE.Quaternion
}

export interface PoseHistory {
  /** Episode snapshot object identity — detects a swapped episode source at an unchanged tick. */
  source: unknown
  tick: number
  span: number
  prev: PoseSample
  curr: PoseSample
  /** Rate-limited rendered rotation — see MAX_POSE_TURN_RAD_PER_SEC. */
  display: THREE.Quaternion
  /** Last frame clock (seconds) that advanced `display`; idempotent per frame. */
  displayTime: number
}

/**
 * Rendered yaw turn cap. The kinematic controller declares `turnRate: 4.0`
 * but snaps yaw instantaneously when the direction to its target flips —
 * e.g. while pinned by terrain, or parked on a node with sub-millimetre
 * offsets — producing committed 180° rotation flips on consecutive ticks.
 * Committed poses are authority and stay untouched; the render layer holds
 * the displayed rotation to a plausible slew instead.
 */
export const MAX_POSE_TURN_RAD_PER_SEC = 4.0

const IDENTITY_ROTATION: readonly [number, number, number, number] = [0, 0, 0, 1]

function writePoseSample(target: PoseSample, agent: PoseAgentLike) {
  target.pos.fromArray(agent.position)
  const rotation = agent.rotation ?? IDENTITY_ROTATION
  target.rot.set(rotation[0], rotation[1], rotation[2], rotation[3])
}

/**
 * Advances a render-layer pose history by one committed episode state.
 * The sim commits on a 50 ms grid; the renderer keeps the two most recent
 * observed poses and samples one tick behind the authority.
 *
 * Three cases:
 * - forward tick on the same snapshot object → shift curr→prev, record the
 *   span so a multi-tick frame still renders exactly one tick behind.
 * - same tick on the same object → idempotent no-op (several consumers may
 *   sample within one frame).
 * - anything else (new runner/episode object, review clone, reset, backward
 *   scrub) → snap both samples to the committed pose. Tick alone cannot
 *   distinguish sources: a rebuilt runner and a fresh recording both start
 *   at tick 0, so identity is checked alongside the tick.
 */
export function advancePoseHistory(
  history: PoseHistory | null,
  source: unknown,
  tick: number,
  agent: PoseAgentLike,
): PoseHistory {
  if (!history) {
    const next: PoseHistory = {
      source,
      tick,
      span: 1,
      prev: { pos: new THREE.Vector3(), rot: new THREE.Quaternion() },
      curr: { pos: new THREE.Vector3(), rot: new THREE.Quaternion() },
      display: new THREE.Quaternion(),
      displayTime: -1,
    }
    writePoseSample(next.prev, agent)
    writePoseSample(next.curr, agent)
    next.display.copy(next.curr.rot)
    return next
  }
  if (source !== history.source || tick < history.tick) {
    history.source = source
    history.tick = tick
    history.span = 1
    writePoseSample(history.prev, agent)
    writePoseSample(history.curr, agent)
    history.display.copy(history.curr.rot)
    return history
  }
  if (tick === history.tick) return history
  history.prev.pos.copy(history.curr.pos)
  history.prev.rot.copy(history.curr.rot)
  history.span = tick - history.tick
  writePoseSample(history.curr, agent)
  history.tick = tick
  return history
}

const scratchRot = new THREE.Quaternion()

/**
 * Samples a pose history one tick behind the authority, lerped by the
 * tick-fraction `alpha` (0..1). With span=1 the render time is T−1+α;
 * multi-tick spans linearize across the skipped commits.
 *
 * Rotation is additionally rate-limited: the controller can commit 180°
 * yaw flips on consecutive ticks (blocked against terrain, parked on a
 * node), so the displayed quaternion slews toward the interpolated target
 * at `maxTurnRate` rad/s, advanced once per rendered frame (`nowSeconds`
 * shared by all consumers). alpha=1 (paused/review/finished) bypasses both
 * mechanisms and yields the exact committed pose.
 */
export function samplePoseHistory(
  history: PoseHistory,
  alpha: number,
  outPos: THREE.Vector3,
  outRot: THREE.Quaternion,
  nowSeconds = 0,
  maxTurnRate = MAX_POSE_TURN_RAD_PER_SEC,
) {
  const f = Math.min(1, Math.max(0, (history.span - 1 + alpha) / Math.max(history.span, 1)))
  outPos.lerpVectors(history.prev.pos, history.curr.pos, f)
  scratchRot.slerpQuaternions(history.prev.rot, history.curr.rot, f)
  if (alpha >= 1) {
    history.display.copy(scratchRot)
  } else if (nowSeconds > history.displayTime) {
    const step = Math.max(0, nowSeconds - Math.max(history.displayTime, 0)) * maxTurnRate
    history.display.rotateTowards(scratchRot, step)
  }
  history.displayTime = nowSeconds
  outRot.copy(history.display)
}

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
