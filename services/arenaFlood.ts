/**
 * arenaFlood — pure flood presentation helpers shared by the 3D water
 * surface and tests. The fill level is a pure function of simulation tick,
 * so replay scrubbing, fast-forward, and headless traces all agree on the
 * waterline: it cannot drift or depend on wall-clock rendering.
 */
import type { ArenaCourse } from './arenaCourse'

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

/** Linear waterline for a fill level — drives both mesh y and shore depth. */
export function floodWaterY(footprint: FloodFootprint, level: number): number {
  return footprint.dryY + (footprint.waterY - footprint.dryY) * level
}
