import {
  WORLD_LANDFORMS,
  WORLD_PALETTES,
  type WorldSpec,
} from './arenaWorldgen'

/**
 * Plain-language → WorldSpec, the prompt-to-world path. Mirrors the
 * resolveCoachIntent discipline: the translator only *proposes* a spec, and
 * this module is the last thing that touches it before the resolver — wrong
 * types and unknown enums reject the reply, out-of-range numbers clamp into
 * the frozen contract ranges (the ranges are the contract; a slightly eager
 * number is a taste error, not a malformed reply).
 *
 * Nothing here builds geometry or touches the match authority — the sanitized
 * spec feeds `loadGeneratedCourse`, whose output is always `split: 'practice'`.
 */

const LANDFORM_SET = new Set<string>(WORLD_LANDFORMS)
const PALETTE_SET = new Set<string>(WORLD_PALETTES)

function finiteNumber(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function sanitizeName(raw: unknown, landform: WorldSpec['landform']): string {
  const fallback = `Generated ${landform[0].toUpperCase()}${landform.slice(1)}`
  if (typeof raw !== 'string') return fallback
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  return clean.length > 0 ? clean : fallback
}

/**
 * Validates and clamps an untrusted translator reply into a WorldSpec.
 * Returns null when the reply is not an object, names an unknown
 * landform/palette, or carries non-numeric values where the contract needs
 * numbers — the caller then falls back to the preset gallery.
 */
export function sanitizeWorldSpec(raw: unknown): WorldSpec | null {
  if (typeof raw !== 'object' || raw === null) return null
  const input = raw as Record<string, unknown>
  if (typeof input.landform !== 'string' || !LANDFORM_SET.has(input.landform)) return null
  if (typeof input.palette !== 'string' || !PALETTE_SET.has(input.palette)) return null
  const landform = input.landform as WorldSpec['landform']
  const palette = input.palette as WorldSpec['palette']

  const ridge = input.ridge as Record<string, unknown> | null
  const channels = input.channels as Record<string, unknown> | null
  const rim = input.rim as Record<string, unknown> | null
  const ridgeX = finiteNumber(ridge?.x)
  const ridgeHeight = finiteNumber(ridge?.height)
  const channelCount = finiteNumber(channels?.count)
  const channelSpacing = finiteNumber(channels?.spacing)
  const channelDepth = finiteNumber(channels?.depth)
  const rimHeight = finiteNumber(rim?.height)
  const rimSteepness = finiteNumber(rim?.steepness)
  const waterlineOffset = finiteNumber(input.waterlineOffset)
  const rockDensity = finiteNumber(input.rockDensity)
  if (
    ridgeX === null || ridgeHeight === null ||
    channelCount === null || channelSpacing === null || channelDepth === null ||
    rimHeight === null || rimSteepness === null ||
    waterlineOffset === null || rockDensity === null
  ) return null

  return {
    landform,
    ridge: { x: clamp(ridgeX, 5.5, 8.5), height: clamp(ridgeHeight, 0.2, 1.6) },
    channels: {
      count: Math.round(clamp(channelCount, 0, 6)),
      spacing: clamp(channelSpacing, 1.5, 4),
      depth: clamp(channelDepth, 0.02, 0.2),
    },
    rim: { height: clamp(rimHeight, 0, 2.2), steepness: clamp(rimSteepness, 1, 4) },
    waterlineOffset: clamp(waterlineOffset, -0.2, 0.35),
    palette,
    rockDensity: clamp(rockDensity, 0, 1),
    scenarioName: sanitizeName(input.scenarioName, landform),
  }
}

/**
 * The three preset worlds — instant impact for a judge who will not type, and
 * the gallery the client falls back to when the translator is unconfigured or
 * unreachable. Presets are written inside contract ranges; the test suite
 * asserts each one round-trips through `sanitizeWorldSpec` unchanged.
 */
export const WORLD_PRESETS: readonly { description: string; spec: WorldSpec }[] = [
  {
    description: 'a flooded salt flat under a copper sky',
    spec: {
      landform: 'salt-flat',
      ridge: { x: 8, height: 0.4 },
      channels: { count: 5, spacing: 2.2, depth: 0.18 },
      rim: { height: 0.6, steepness: 2 },
      waterlineOffset: 0.3,
      palette: 'oxide',
      rockDensity: 0.15,
      scenarioName: 'Copper Flood Flat',
    },
  },
  {
    description: 'a rugged basalt canyon with a narrow safe ledge',
    spec: {
      landform: 'canyon',
      ridge: { x: 6.5, height: 1.4 },
      channels: { count: 3, spacing: 2.6, depth: 0.1 },
      rim: { height: 1.8, steepness: 3.2 },
      waterlineOffset: -0.1,
      palette: 'basalt',
      rockDensity: 0.8,
      scenarioName: 'Basalt Ledge Run',
    },
  },
  {
    description: 'rolling dunes under a pale evening sky',
    spec: {
      landform: 'dune-field',
      ridge: { x: 7.5, height: 0.9 },
      channels: { count: 1, spacing: 3.4, depth: 0.04 },
      rim: { height: 1.1, steepness: 1.4 },
      waterlineOffset: -0.15,
      palette: 'gypsum',
      rockDensity: 0.35,
      scenarioName: 'Pale Dune Traverse',
    },
  },
]

export type WorldIntentResult =
  | { kind: 'ok'; spec: WorldSpec }
  | { kind: 'fallback'; reason: string }

/**
 * Asks the world-intent translator for a spec, then validates it the same way
 * the route's other surfaces are validated — never trust the wire. Any
 * failure (unconfigured 503, upstream 502, unparseable 422, network, or a
 * reply the sanitizer rejects) returns `fallback` with an honest reason so
 * the caller can swap to a preset instead of a dead surface.
 */
export async function requestWorldSpec(description: string, signal?: AbortSignal): Promise<WorldIntentResult> {
  let response: Response
  try {
    response = await fetch('/api/world-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    return { kind: 'fallback', reason: 'translator unreachable' }
  }
  if (response.status === 503) return { kind: 'fallback', reason: 'translator not configured' }
  if (response.status === 502) return { kind: 'fallback', reason: 'translator upstream error' }
  if (!response.ok) return { kind: 'fallback', reason: `translator rejected the description (${response.status})` }
  let body: { spec?: unknown }
  try {
    body = await response.json()
  } catch {
    return { kind: 'fallback', reason: 'translator reply was not JSON' }
  }
  const spec = sanitizeWorldSpec(body.spec)
  if (!spec) return { kind: 'fallback', reason: 'translator reply failed validation' }
  return { kind: 'ok', spec }
}

/**
 * Presentation palette for a generated world — sky gradient, backdrop, fog
 * and the tint multiplied into the terrain detail texture. Hex strings only;
 * the render layer converts to THREE.Color so this module stays
 * dependency-free. `AUTHORED_SKY` is the pinned basin's current look.
 */
export interface WorldSkyTheme {
  background: string
  fog: string
  horizon: string
  zenith: string
  terrainTint: string
}

export const AUTHORED_SKY: WorldSkyTheme = {
  background: '#d4baa0',
  fog: '#c7b19b',
  horizon: '#d4ba96',
  zenith: '#6e9ebd',
  terrainTint: '#ffffff',
}

export const WORLD_SKY: Record<WorldSpec['palette'], WorldSkyTheme> = {
  sandstone: AUTHORED_SKY,
  basalt: { background: '#8f9aa4', fog: '#7e8894', horizon: '#9aa3ab', zenith: '#3f4c5c', terrainTint: '#9fb2c4' },
  slate: { background: '#a8b2bd', fog: '#97a1ad', horizon: '#b5bcc4', zenith: '#58687a', terrainTint: '#b7c3cf' },
  oxide: { background: '#d9a06a', fog: '#c68d5e', horizon: '#e0a86e', zenith: '#7a5a78', terrainTint: '#e0a878' },
  gypsum: { background: '#e8ded2', fog: '#dbcec0', horizon: '#efe4d4', zenith: '#8fa4b8', terrainTint: '#f2e9dc' },
}

/** Sky theme for the course being rendered — generated palette or the authored look. */
export function skyThemeForCourse(course: { generated?: { spec: WorldSpec } }): WorldSkyTheme {
  return course.generated ? WORLD_SKY[course.generated.spec.palette] : AUTHORED_SKY
}
