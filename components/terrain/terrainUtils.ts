import { createNoise2D } from 'simplex-noise'

export type SurfaceType = 'road' | 'grass' | 'sand' | 'mud'

export const SURFACE_FRICTION: Record<SurfaceType, number> = {
  road: 0.995,
  grass: 0.98,
  sand: 0.93,
  mud: 0.88,
}

export const SURFACE_COLORS: Record<SurfaceType, [number, number, number]> = {
  road: [0.35, 0.35, 0.38],
  grass: [0.25, 0.6, 0.2],
  sand: [0.85, 0.75, 0.55],
  mud: [0.4, 0.3, 0.15],
}

export const TERRAIN_CONFIG = {
  SIZE: 100,
  SEGMENTS: 80,
  DEFORMATION_RADIUS: 2.5,
  DEFORMATION_STRENGTH: 0.5,
  SEED: 1337,
  FLAT_ZONE_RADIUS: 50,
  NOISE_LAYERS: [
    { frequency: 0.03, amplitude: 2 },
    { frequency: 0.1, amplitude: 0.5 },
    { frequency: 0.5, amplitude: 0.1 }
  ]
} as const

// Road spline paths radiating from center
const ROAD_PATHS: Array<{ angle: number; width: number; length: number }> = [
  { angle: 0, width: 6, length: 90 },
  { angle: Math.PI / 2, width: 6, length: 90 },
  { angle: Math.PI, width: 6, length: 90 },
  { angle: (3 * Math.PI) / 2, width: 6, length: 90 },
  { angle: Math.PI / 4, width: 4, length: 70 },
  { angle: (3 * Math.PI) / 4, width: 4, length: 70 },
  { angle: (5 * Math.PI) / 4, width: 4, length: 70 },
  { angle: (7 * Math.PI) / 4, width: 4, length: 70 },
]

// Ring road at radius ~40
const RING_ROAD_RADIUS = 40
const RING_ROAD_WIDTH = 5

const seededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const noise2D = createNoise2D(seededRandom(TERRAIN_CONFIG.SEED))

const distToRoad = (x: number, z: number): number => {
  let minDist = Infinity

  // Radial roads
  for (const road of ROAD_PATHS) {
    const dx = Math.cos(road.angle)
    const dz = Math.sin(road.angle)
    // Project point onto road line
    const t = Math.max(0, Math.min(road.length, x * dx + z * dz))
    const px = dx * t
    const pz = dz * t
    const d = Math.sqrt((x - px) ** 2 + (z - pz) ** 2)
    minDist = Math.min(minDist, d - road.width / 2)
  }

  // Ring road
  const dist = Math.sqrt(x * x + z * z)
  const ringDist = Math.abs(dist - RING_ROAD_RADIUS) - RING_ROAD_WIDTH / 2
  minDist = Math.min(minDist, ringDist)

  // Center plaza (radius 12)
  minDist = Math.min(minDist, dist - 12)

  return minDist
}

export const getSurfaceType = (x: number, z: number): SurfaceType => {
  const d = distToRoad(x, z)
  if (d <= 0) return 'road'

  const dist = Math.sqrt(x * x + z * z)
  const height = getTerrainHeight(x, z)
  const slope = Math.abs(height) / Math.max(1, dist * 0.05)

  if (slope > 2) return 'mud'
  if (dist > 60 && slope > 0.5) return 'sand'
  return 'grass'
}

export const getSurfaceColor = (x: number, z: number): [number, number, number] => {
  const surface = getSurfaceType(x, z)
  const base = SURFACE_COLORS[surface]

  // Road edge blend
  const d = distToRoad(x, z)
  if (d > 0 && d < 3) {
    const blend = d / 3
    const grassColor = SURFACE_COLORS.grass
    return [
      base[0] * (1 - blend) + grassColor[0] * blend,
      base[1] * (1 - blend) + grassColor[1] * blend,
      base[2] * (1 - blend) + grassColor[2] * blend,
    ]
  }

  return base
}

export const getTerrainHeight = (x: number, z: number) => {
  let noise = 0
  for (const layer of TERRAIN_CONFIG.NOISE_LAYERS) {
    noise += noise2D(x * layer.frequency, z * layer.frequency) * layer.amplitude
  }

  const dist = Math.sqrt(x * x + z * z)
  const flatFactor = Math.max(0, 1 - Math.min(1, dist / TERRAIN_CONFIG.FLAT_ZONE_RADIUS))

  // Roads are flat
  const roadDist = distToRoad(x, z)
  const roadFlat = roadDist <= 0 ? 1 : roadDist < 4 ? 1 - roadDist / 4 : 0

  const totalFlat = Math.max(flatFactor, roadFlat)
  return noise * (1 - totalFlat)
}

export const getTerrainNormal = (x: number, z: number): [number, number, number] => {
  const eps = 0.5
  const hL = getTerrainHeight(x - eps, z)
  const hR = getTerrainHeight(x + eps, z)
  const hD = getTerrainHeight(x, z - eps)
  const hU = getTerrainHeight(x, z + eps)
  const nx = hL - hR
  const nz = hD - hU
  const ny = 2 * eps
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
  return [nx / len, ny / len, nz / len]
}
