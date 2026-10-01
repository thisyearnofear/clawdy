/**
 * arenaFlood — pure flood presentation helpers shared by the 3D water
 * surface and tests. The fill level is a pure function of simulation tick,
 * so replay scrubbing, fast-forward, and headless traces all agree on the
 * waterline: it cannot drift or depend on wall-clock rendering.
 */
import type { ArenaCourse } from './arenaCourse'
import type { ArenaSnapshot } from './arenaEpisode'

/** Ticks for the waterline to climb from dry to full once flooding starts (1s). */
export const FLOOD_RISE_TICKS = 20
/** Ticks for the waterline to fall back to dry after flooding stops (1.25s). */
export const FLOOD_RECEDE_TICKS = 25

/**
 * Water fill level 0..1 at `tick`, matching `ArenaEpisode`'s flood rules:
 * flooding is active inside a scheduled window unless `drainedUntilTick`
 * suppresses it. The level ramps up from the last activation (window start,
 * or drain expiry inside the window) and ramps down from the last
 * deactivation (window end, or the drain tick that truncated the window).
 */
export function floodFillLevel(
  tick: number,
  floods: readonly { startTick: number; endTick: number }[],
  drainedUntilTick: number,
  drainTicks: number,
): number {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  const windowAt = floods.find(f => f.startTick <= tick && tick < f.endTick)
  const flooded = windowAt !== undefined && drainedUntilTick <= tick
  if (flooded) {
    // Drain pushed the effective start later — re-fill begins when it expires.
    const activation = Math.max(windowAt.startTick, drainedUntilTick > windowAt.startTick ? drainedUntilTick : windowAt.startTick)
    return clamp01((tick - activation) / FLOOD_RISE_TICKS)
  }
  // Last deactivation: for each window, the moment water actually stopped —
  // the window end, or a drain tick that truncated the window.
  const drainTick = drainedUntilTick - drainTicks
  let deactivation = -Infinity
  let deactWindow: { startTick: number; endTick: number } | null = null
  for (const f of floods) {
    const drainCut = f.startTick <= drainTick && drainTick < f.endTick
    const effectiveEnd = drainCut ? drainTick : f.endTick
    if (effectiveEnd <= tick && effectiveEnd > deactivation) {
      deactivation = effectiveEnd
      deactWindow = f
    }
  }
  if (windowAt && drainedUntilTick > tick && drainTick > deactivation) {
    deactivation = drainTick
    deactWindow = windowAt
  }
  if (!deactWindow) return 0
  // Level at the moment water stopped — a mid-rise drain falls from partial
  // fill rather than snapping to full. The drain expiry only counts as the
  // activation if it preceded the stop (a later expiry can't restart water
  // that already stopped).
  const activation = drainedUntilTick > deactWindow.startTick && drainedUntilTick <= deactivation
    ? drainedUntilTick
    : deactWindow.startTick
  const fillAtStop = clamp01((deactivation - activation) / FLOOD_RISE_TICKS)
  return clamp01(fillAtStop - (tick - deactivation) / FLOOD_RECEDE_TICKS)
}

export type FloodFootprint = {
  /** XZ bounds over all floodable corridor paths plus flood zones. */
  min: [number, number]
  size: [number, number]
  /** Full-pool waterline: above every floodable path point. */
  waterY: number
  /** Below-terrain level used for the empty state. */
  dryY: number
}

/**
 * Corridor footprint for the water surface: the XZ bounding box of every
 * floodable edge's grounded path (plus each authored flood zone), padded so
 * the shoreline crawls onto the banks. `waterY` sits just above the highest
 * floodable path point so the whole corridor submerges while higher banks
 * stay dry via the shore-height texture.
 */
export function floodFootprint(course: ArenaCourse, pad = 1.2): FloodFootprint | null {
  const xs: number[] = []
  const zs: number[] = []
  const pathHeights: number[] = []
  for (const edge of course.scenario.edges) {
    if (!edge.floodable || !edge.path) continue
    for (const point of edge.path) {
      xs.push(point[0])
      zs.push(point[2])
      pathHeights.push(point[1])
    }
  }
  for (const zone of course.floodZones) {
    xs.push(zone.position[0] - zone.size[0] / 2, zone.position[0] + zone.size[0] / 2)
    zs.push(zone.position[2] - zone.size[1] / 2, zone.position[2] + zone.size[1] / 2)
  }
  if (xs.length === 0) return null
  const minX = Math.min(...xs) - pad
  const maxX = Math.max(...xs) + pad
  const minZ = Math.min(...zs) - pad
  const maxZ = Math.max(...zs) + pad
  const high = Math.max(...pathHeights)
  const low = Math.min(...pathHeights)
  return {
    min: [minX, minZ],
    size: [maxX - minX, maxZ - minZ],
    waterY: high + 0.16,
    dryY: low - 0.5,
  }
}

/** A soft-edged corridor mask prevents the flood plane's bounding box from looking like a lake. */
export function createFloodCorridorMask(course: ArenaCourse): (x: number, z: number) => number {
  const segments: [number, number, number, number][] = []
  for (const edge of course.scenario.edges) {
    if (!edge.floodable || !edge.path) continue
    // Grounded paths are densely sampled; a segment every five samples
    // follows the same route without testing hundreds of points per texel.
    for (let i = 0; i < edge.path.length - 1; i += 5) {
      const a = edge.path[i]
      const b = edge.path[Math.min(i + 5, edge.path.length - 1)]
      // Diagonal shortcuts remain floodable for gameplay, but their upper
      // slopes must not turn the visible low-valley flood into a giant sheet.
      if (course.floodZones.length && !course.floodZones.some(zone =>
        Math.abs(a[0] - zone.position[0]) <= zone.size[0] &&
        Math.abs(b[0] - zone.position[0]) <= zone.size[0]
      )) continue
      segments.push([a[0], a[2], b[0], b[2]])
    }
  }
  return (x, z) => {
    let distance = Infinity
    for (const [ax, az, bx, bz] of segments) {
      const dx = bx - ax
      const dz = bz - az
      const lengthSq = dx * dx + dz * dz
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq)) : 0
      distance = Math.min(distance, Math.hypot(x - ax - t * dx, z - az - t * dz))
    }
    for (const zone of course.floodZones) {
      const dx = Math.max(0, Math.abs(x - zone.position[0]) - zone.size[0] / 2)
      const dz = Math.max(0, Math.abs(z - zone.position[2]) - zone.size[1] / 2)
      distance = Math.min(distance, Math.hypot(dx, dz))
    }
    // A narrow, translucent channel with a soft edge instead of a lake.
    return Math.max(0, Math.min(1, (1.65 - distance) / 0.85))
  }
}

/** Moving rovers on flooded, submerged routes create subtle directional wakes. */
export function floodWakes(
  snapshot: ArenaSnapshot, course: ArenaCourse, waterY: number,
  corridorMask = createFloodCorridorMask(course),
): [number, number, number, number][] {
  if (!snapshot.weather.flooded) return []
  const wakes: [number, number, number, number][] = []
  for (const agent of snapshot.agents) {
    if (!agent.transit || agent.position[1] > waterY + 0.2 ||
        corridorMask(agent.position[0], agent.position[2]) < 0.5) continue
    const edge = course.scenario.edges.find(candidate => candidate.id === agent.transit!.edgeId)
    if (!edge?.floodable) continue
    const from = course.scenario.nodes.find(node => node.id === agent.transit!.from)
    const to = course.scenario.nodes.find(node => node.id === agent.transit!.to)
    if (!from || !to) continue
    const dx = to.position[0] - from.position[0]
    const dz = to.position[2] - from.position[2]
    const length = Math.hypot(dx, dz)
    if (length < 0.01) continue
    wakes.push([agent.position[0], agent.position[2], dx / length, dz / length])
    if (wakes.length === 2) break
  }
  return wakes
}

/** Linear waterline for a fill level — drives both mesh y and shore depth. */
export function floodWaterY(footprint: FloodFootprint, level: number): number {
  return footprint.dryY + (footprint.waterY - footprint.dryY) * level
}
