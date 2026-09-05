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

function readString(value: string | undefined): string | undefined {
  return value?.trim() || undefined
}

function readNumber(value: string | undefined, fallback: number): number {
  const text = readString(value)
  if (!text) return fallback
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readVector(value: string | undefined, fallback: Vector3Tuple): Vector3Tuple {
  const parts = readString(value)?.split(',').map(part => Number(part.trim()))
  return parts?.length === 3 && parts.every(part => Number.isFinite(part) && part > 0)
    ? [parts[0], parts[1], parts[2]]
    : [...fallback]
}

export function getMarbleWorldConfig(): MarbleWorldConfig {
  const splatUrl = readString(process.env.NEXT_PUBLIC_MARBLE_SPLAT_URL)
  const colliderUrl = readString(process.env.NEXT_PUBLIC_MARBLE_COLLIDER_URL)
  const enabled = readString(process.env.NEXT_PUBLIC_MARBLE_ENABLED)
  const format = readString(process.env.NEXT_PUBLIC_MARBLE_SPLAT_FORMAT)

  return {
    enabled: enabled === 'true' || enabled === '1',
    configured: Boolean(splatUrl),
    id: readString(process.env.NEXT_PUBLIC_MARBLE_WORLD_ID) ?? 'clawdy-marble-arena',
    name: readString(process.env.NEXT_PUBLIC_MARBLE_WORLD_NAME) ?? 'Clawdy Marble Arena',
    splat: splatUrl ? { url: splatUrl, format: format === 'rad' || format === 'ply' ? format : 'spz' } : null,
    collider: colliderUrl ? { url: colliderUrl } : null,
    bounds: readVector(process.env.NEXT_PUBLIC_MARBLE_BOUNDS, DEFAULT_BOUNDS),
    spawnBounds: readVector(process.env.NEXT_PUBLIC_MARBLE_SPAWN_BOUNDS, DEFAULT_SPAWN_BOUNDS),
    spawnHeight: readNumber(process.env.NEXT_PUBLIC_MARBLE_SPAWN_HEIGHT, DEFAULT_SPAWN_HEIGHT),
  }
}

export function shouldUseMarbleWorld(config: MarbleWorldConfig): boolean {
  return config.enabled && config.configured
}
