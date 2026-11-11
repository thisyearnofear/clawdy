import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseWorldReply } from '../../app/api/world-intent/route'
import {
  ARENA_WORLD,
  generatedWorldScene,
  loadGeneratedCourse,
} from '../arenaCourse'
import { initializeArenaPhysics } from '../arenaPhysics'
import {
  canonicalWorldSpecJson,
  generatedWorldId,
  worldSpecDigest,
  type WorldSpec,
} from '../arenaWorldgen'
import {
  requestWorldSpec,
  sanitizeWorldSpec,
  skyThemeForCourse,
  WORLD_PRESETS,
  AUTHORED_SKY,
  WORLD_SKY,
} from '../arenaWorldIntent'

const VALID_SPEC: WorldSpec = {
  landform: 'basin',
  ridge: { x: 7, height: 0.9 },
  channels: { count: 3, spacing: 2.5, depth: 0.1 },
  rim: { height: 1.2, steepness: 2.4 },
  waterlineOffset: 0.1,
  palette: 'sandstone',
  rockDensity: 0.5,
  scenarioName: 'Test Basin',
}

describe('sanitizeWorldSpec', () => {
  it('accepts a contract-conforming reply unchanged', () => {
    expect(sanitizeWorldSpec(VALID_SPEC)).toEqual(VALID_SPEC)
  })

  it('clamps out-of-range numbers into the frozen contract ranges', () => {
    const spec = sanitizeWorldSpec({
      ...VALID_SPEC,
      ridge: { x: 99, height: -3 },
      channels: { count: 12, spacing: 0, depth: 9 },
      rim: { height: 8, steepness: 0.2 },
      waterlineOffset: 2,
      rockDensity: 4,
    })!
    expect(spec.ridge).toEqual({ x: 8.5, height: 0.2 })
    expect(spec.channels).toEqual({ count: 6, spacing: 1.5, depth: 0.2 })
    expect(spec.rim).toEqual({ height: 2.2, steepness: 1 })
    expect(spec.waterlineOffset).toBe(0.35)
    expect(spec.rockDensity).toBe(1)
  })

  it('rounds channel count to a whole number', () => {
    expect(sanitizeWorldSpec({ ...VALID_SPEC, channels: { count: 2.6, spacing: 2, depth: 0.1 } })!.channels.count).toBe(3)
  })

  it('rejects unknown enums and malformed shapes', () => {
    expect(sanitizeWorldSpec('a basin')).toBeNull()
    expect(sanitizeWorldSpec(null)).toBeNull()
    expect(sanitizeWorldSpec({ ...VALID_SPEC, landform: 'swamp' })).toBeNull()
    expect(sanitizeWorldSpec({ ...VALID_SPEC, palette: 'neon' })).toBeNull()
    expect(sanitizeWorldSpec({ ...VALID_SPEC, ridge: { x: 'high', height: 1 } })).toBeNull()
    expect(sanitizeWorldSpec({ ...VALID_SPEC, waterlineOffset: Number.NaN })).toBeNull()
    expect(sanitizeWorldSpec({ ...VALID_SPEC, rim: { height: 1 } })).toBeNull()
  })

  it('sanitizes the scenario name: strips controls, collapses whitespace, caps at 40 chars', () => {
    const named = sanitizeWorldSpec({ ...VALID_SPEC, scenarioName: '  My   Cool\t Basin  ' + 'x'.repeat(60) })!
    expect(named.scenarioName).toBe(('My Cool Basin ' + 'x'.repeat(60)).trim().slice(0, 40))
    expect(named.scenarioName.length).toBeLessThanOrEqual(40)
    expect(sanitizeWorldSpec({ ...VALID_SPEC, scenarioName: '   ' })!.scenarioName).toBe('Generated Basin')
    expect(sanitizeWorldSpec({ ...VALID_SPEC, scenarioName: 42 })!.scenarioName).toBe('Generated Basin')
    expect(sanitizeWorldSpec({ ...VALID_SPEC, landform: 'salt-flat', scenarioName: '' })!.scenarioName).toBe('Generated Salt-flat')
  })
})

describe('world digest + id', () => {
  it('produces a stable canonical JSON and a 64-char sha256', async () => {
    expect(canonicalWorldSpecJson(VALID_SPEC)).toBe(canonicalWorldSpecJson({ ...VALID_SPEC }))
    const digest = await worldSpecDigest(VALID_SPEC)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(generatedWorldId(digest)).toBe(`generated-${digest.slice(0, 8)}`)
    expect(await worldSpecDigest(VALID_SPEC)).toBe(digest)
  })

  it('changes the digest when any spec field changes', async () => {
    const base = await worldSpecDigest(VALID_SPEC)
    expect(await worldSpecDigest({ ...VALID_SPEC, rockDensity: 0.51 })).not.toBe(base)
    expect(await worldSpecDigest({ ...VALID_SPEC, scenarioName: 'Other' })).not.toBe(base)
  })
})

describe('preset gallery', () => {
  it('ships three presets that round-trip through the sanitizer', () => {
    expect(WORLD_PRESETS).toHaveLength(3)
    for (const preset of WORLD_PRESETS) {
      expect(preset.description.length).toBeGreaterThan(0)
      expect(sanitizeWorldSpec(preset.spec)).toEqual(preset.spec)
      expect(preset.spec.scenarioName.length).toBeLessThanOrEqual(40)
    }
  })
})

describe('world-intent API reply parsing', () => {
  it('parses a JSON object and one wrapped in fences', () => {
    expect(parseWorldReply('{"landform":"basin"}')).toEqual({ landform: 'basin' })
    expect(parseWorldReply('```json\n{"landform":"basin"}\n```')).toEqual({ landform: 'basin' })
    expect(parseWorldReply('"just a string"')).toBeNull()
    expect(parseWorldReply('nope')).toBeNull()
    expect(parseWorldReply('[1,2]')).toEqual([1, 2])
  })
})

describe('requestWorldSpec', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns a sanitized spec when the route answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ spec: VALID_SPEC }), { status: 200 })))
    const result = await requestWorldSpec('a quiet basin')
    expect(result).toEqual({ kind: 'ok', spec: VALID_SPEC })
  })

  it('falls back with an honest reason on 503, upstream errors, and unsanitizable replies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
    expect(await requestWorldSpec('x')).toEqual({ kind: 'fallback', reason: 'translator not configured' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 502 })))
    expect(await requestWorldSpec('x')).toEqual({ kind: 'fallback', reason: 'translator upstream error' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ spec: { landform: 'swamp' } }), { status: 200 })))
    expect(await requestWorldSpec('x')).toEqual({ kind: 'fallback', reason: 'translator reply failed validation' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await requestWorldSpec('x')).toEqual({ kind: 'fallback', reason: 'translator unreachable' })
  })
})

describe('sky themes', () => {
  it('keeps the authored look for the pinned course and follows the spec palette otherwise', () => {
    expect(skyThemeForCourse({})).toBe(AUTHORED_SKY)
    expect(skyThemeForCourse({ generated: { spec: { ...VALID_SPEC, palette: 'oxide' } } })).toBe(WORLD_SKY.oxide)
    for (const palette of Object.keys(WORLD_SKY)) {
      const theme = WORLD_SKY[palette as keyof typeof WORLD_SKY]
      for (const value of Object.values(theme)) expect(value).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('loadGeneratedCourse', () => {
  let bytes: Uint8Array<ArrayBuffer>
  beforeAll(async () => {
    await initializeArenaPhysics()
    const file = await readFile(resolve(process.cwd(), 'public/terrain/sandstone-basin.glb'))
    bytes = new Uint8Array(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('loads a certified generated world and registers its scene for the renderer', async () => {
    const worldId = generatedWorldId(await worldSpecDigest(VALID_SPEC))
    const loaded = await loadGeneratedCourse(VALID_SPEC)
    try {
      expect(loaded.generated.fellBackToAuthored).toBe(false)
      expect(loaded.generated.failure).toBeNull()
      expect(loaded.generated.worldId).toBe(worldId)
      expect(loaded.generated.certificate).toMatchObject({
        stationsGrounded: loaded.generated.certificate!.stationsTotal,
        routesCleared: loaded.generated.certificate!.routesTotal,
      })
      // Practice-only, digest-derived provenance on both course variants.
      for (const course of [loaded.course, loaded.rushCourse]) {
        expect(course.generated?.worldId).toBe(worldId)
        expect(course.scenario.split).toBe('practice')
        expect(course.scenario.worldVersion).toBe(worldId)
        expect(course.config.terrain.url).toBe(`generated:${worldId}`)
      }
      // TerrainMesh resolves the scene through this registry, so an unlisted
      // world would render an empty arena instead of the generated ground.
      expect(generatedWorldScene(worldId)).toBeDefined()
    } finally {
      loaded.dispose()
      expect(generatedWorldScene(worldId)).toBeUndefined()
    }
  }, 120000)

  it('falls back to the pinned authored course — honestly — when no rung can certify', async () => {
    // A spec that skipped `sanitizeWorldSpec` and asks for relief the resolver
    // forbids: generation must refuse, and the loader must still arrive with
    // the authored course rather than a broken arena.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)))
    const loaded = await loadGeneratedCourse({
      ...VALID_SPEC,
      landform: 'canyon',
      ridge: { x: 6.9, height: 9 },
      channels: { count: 6, spacing: 1.5, depth: 3 },
    })
    try {
      expect(loaded.generated.fellBackToAuthored).toBe(true)
      expect(loaded.generated.worldId).toBe(ARENA_WORLD.id)
      expect(loaded.generated.failure).toContain('could not certify a playable course')
      expect(loaded.generated.certificate).toBeNull()
      expect(loaded.course.generated).toBeUndefined()
      expect(loaded.course.scenario.worldVersion).toBe(ARENA_WORLD.version)
      expect(generatedWorldScene('generated-anything')).toBeUndefined()
    } finally {
      loaded.dispose()
    }
  }, 120000)
})
