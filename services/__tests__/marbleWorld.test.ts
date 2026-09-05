import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMarbleWorldConfig, shouldUseMarbleWorld } from '../marbleWorld'

const keys = [
  'NEXT_PUBLIC_MARBLE_ENABLED', 'NEXT_PUBLIC_MARBLE_SPLAT_URL', 'NEXT_PUBLIC_MARBLE_COLLIDER_URL',
  'NEXT_PUBLIC_MARBLE_SPLAT_FORMAT', 'NEXT_PUBLIC_MARBLE_WORLD_ID', 'NEXT_PUBLIC_MARBLE_WORLD_NAME',
  'NEXT_PUBLIC_MARBLE_BOUNDS', 'NEXT_PUBLIC_MARBLE_SPAWN_BOUNDS', 'NEXT_PUBLIC_MARBLE_SPAWN_HEIGHT',
]

beforeEach(() => keys.forEach(key => vi.stubEnv(key, undefined)))
afterEach(() => vi.unstubAllEnvs())

describe('Marble public configuration', () => {
  it('keeps an unconfigured world disabled', () => {
    const config = getMarbleWorldConfig()
    expect(config.enabled).toBe(false)
    expect(config.configured).toBe(false)
    expect(shouldUseMarbleWorld(config)).toBe(false)
  })

  it('resolves explicit public values and trims strings', () => {
    vi.stubEnv('NEXT_PUBLIC_MARBLE_ENABLED', ' true ')
    vi.stubEnv('NEXT_PUBLIC_MARBLE_SPLAT_URL', ' /marble/arena.spz ')
    vi.stubEnv('NEXT_PUBLIC_MARBLE_COLLIDER_URL', '/marble/collider.glb')
    vi.stubEnv('NEXT_PUBLIC_MARBLE_BOUNDS', '12, 8, 15')
    vi.stubEnv('NEXT_PUBLIC_MARBLE_SPAWN_HEIGHT', '-2')
    expect(getMarbleWorldConfig()).toMatchObject({
      enabled: true, configured: true, bounds: [12, 8, 15], spawnHeight: -2,
      splat: { url: '/marble/arena.spz', format: 'spz' }, collider: { url: '/marble/collider.glb' },
    })
    expect(shouldUseMarbleWorld(getMarbleWorldConfig())).toBe(true)
  })

  it.each(['-1,2,3', '1,0,3', '1,,3', 'Infinity,2,3', '1,2', 'bad'])('rejects invalid world extents: %s', value => {
    vi.stubEnv('NEXT_PUBLIC_MARBLE_BOUNDS', value)
    expect(getMarbleWorldConfig().bounds).toEqual([50, 20, 50])
  })

  it('does not share mutable default bounds between configurations', () => {
    const config = getMarbleWorldConfig()
    config.bounds[0] = 999
    config.spawnBounds[0] = 999
    expect(getMarbleWorldConfig().bounds).toEqual([50, 20, 50])
    expect(getMarbleWorldConfig().spawnBounds).toEqual([50, 5, 50])
  })

  it('requires an asset URL even when enabled and validates optional format and height', () => {
    vi.stubEnv('NEXT_PUBLIC_MARBLE_ENABLED', '1')
    vi.stubEnv('NEXT_PUBLIC_MARBLE_SPLAT_URL', ' ')
    vi.stubEnv('NEXT_PUBLIC_MARBLE_SPAWN_HEIGHT', 'NaN')
    expect(shouldUseMarbleWorld(getMarbleWorldConfig())).toBe(false)
    expect(getMarbleWorldConfig().spawnHeight).toBe(18)
    vi.stubEnv('NEXT_PUBLIC_MARBLE_SPLAT_URL', '/world.rad')
    vi.stubEnv('NEXT_PUBLIC_MARBLE_SPLAT_FORMAT', 'rad')
    expect(getMarbleWorldConfig().splat?.format).toBe('rad')
    vi.stubEnv('NEXT_PUBLIC_MARBLE_SPLAT_FORMAT', 'invalid')
    expect(getMarbleWorldConfig().splat?.format).toBe('spz')
  })
})
