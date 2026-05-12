export type Vector3Tuple = [number, number, number]

export type MarbleSplatFormat = 'spz' | 'rad' | 'ply'

export interface MarbleWorldConfig {
  enabled: boolean
  configured: boolean
  id: string
  name: string
  splat: {
    url: string
    format: MarbleSplatFormat
  } | null
  collider: {
    url: string
  } | null
  bounds: Vector3Tuple
  spawnBounds: Vector3Tuple
  spawnHeight: number
}

const DEFAULT_BOUNDS: Vector3Tuple = [50, 20, 50]
const DEFAULT_SPAWN_BOUNDS: Vector3Tuple = [50, 5, 50]
const DEFAULT_SPAWN_HEIGHT = 18

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readBooleanEnv(name: string): boolean {
  const value = readEnv(name)
  return value === 'true' || value === '1'
}

function readNumberEnv(name: string, fallback: number): number {
  const value = readEnv(name)
  if (!value) return fallback

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readVectorEnv(name: string, fallback: Vector3Tuple): Vector3Tuple {
  const value = readEnv(name)
  if (!value) return fallback

  const parts = value.split(',').map((part) => Number(part.trim()))
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return fallback
  }

  return [parts[0], parts[1], parts[2]]
}

function readSplatFormat(): MarbleSplatFormat {
  const value = readEnv('NEXT_PUBLIC_MARBLE_SPLAT_FORMAT')
  if (value === 'rad' || value === 'ply' || value === 'spz') return value
  return 'spz'
}

export function getMarbleWorldConfig(): MarbleWorldConfig {
  const splatUrl = readEnv('NEXT_PUBLIC_MARBLE_SPLAT_URL')
  const colliderUrl = readEnv('NEXT_PUBLIC_MARBLE_COLLIDER_URL')
  const enabled = readBooleanEnv('NEXT_PUBLIC_MARBLE_ENABLED')

  return {
    enabled,
    configured: Boolean(splatUrl),
    id: readEnv('NEXT_PUBLIC_MARBLE_WORLD_ID') ?? 'clawdy-marble-arena',
    name: readEnv('NEXT_PUBLIC_MARBLE_WORLD_NAME') ?? 'Clawdy Marble Arena',
    splat: splatUrl ? { url: splatUrl, format: readSplatFormat() } : null,
    collider: colliderUrl ? { url: colliderUrl } : null,
    bounds: readVectorEnv('NEXT_PUBLIC_MARBLE_BOUNDS', DEFAULT_BOUNDS),
    spawnBounds: readVectorEnv('NEXT_PUBLIC_MARBLE_SPAWN_BOUNDS', DEFAULT_SPAWN_BOUNDS),
    spawnHeight: readNumberEnv('NEXT_PUBLIC_MARBLE_SPAWN_HEIGHT', DEFAULT_SPAWN_HEIGHT),
  }
}

export function shouldUseMarbleWorld(config: MarbleWorldConfig): boolean {
  return config.enabled && config.configured
}
