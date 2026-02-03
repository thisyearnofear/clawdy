import { createNoise2D } from 'simplex-noise'

export const TERRAIN_CONFIG = {
  SIZE: 100,
  SEGMENTS: 48,
  DEFORMATION_RADIUS: 2.5,
  DEFORMATION_STRENGTH: 0.5,
  SEED: 1337,
  NOISE_LAYERS: [
    { frequency: 0.03, amplitude: 4 },
    { frequency: 0.1, amplitude: 1 },
    { frequency: 0.5, amplitude: 0.2 }
  ]
} as const

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

export const getTerrainHeight = (x: number, z: number) => {
  let noise = 0
  for (const layer of TERRAIN_CONFIG.NOISE_LAYERS) {
    noise += noise2D(x * layer.frequency, z * layer.frequency) * layer.amplitude
  }

  const dist = Math.sqrt(x * x + z * z)
  const flatFactor = Math.max(0, 1 - Math.min(1, dist / 20))
  return noise * (1 - flatFactor)
}
