import * as THREE from 'three'

const SIZE = 256
const CELLS = [16, 32, 64, 128]

function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Value noise on a wrapping lattice, so the texture tiles without seams.
function tileableNoise(x: number, y: number, cells: number, seed: number): number {
  const fx = x * cells
  const fy = y * cells
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const at = (ix: number, iy: number) => hash(((ix % cells) + cells) % cells, ((iy % cells) + cells) % cells, seed)
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
  return top + (bottom - top) * sy
}

/** Grayscale values in [0, 1], SIZE x SIZE, deterministic and tileable. */
export function buildTerrainDetail(): Float32Array {
  const values = new Float32Array(SIZE * SIZE)
  const weights = [0.45, 0.3, 0.17, 0.08]
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let sum = 0
      CELLS.forEach((cells, octave) => {
        sum += tileableNoise(x / SIZE, y / SIZE, cells, 17 + octave) * weights[octave]
      })
      values[y * SIZE + x] = sum
    }
  }
  return values
}

/**
 * Multiplies onto the glTF base colour: mostly near-white with darker pits, so
 * the authored sand/road palette keeps its hue and gains grain and relief.
 */
export function createTerrainDetailTextures(): { map: THREE.DataTexture; bump: THREE.DataTexture } {
  const values = buildTerrainDetail()
  const albedo = new Uint8Array(SIZE * SIZE * 4)
  const relief = new Uint8Array(SIZE * SIZE * 4)
  values.forEach((value, index) => {
    const shade = Math.round(255 * (0.78 + 0.22 * value))
    const height = Math.round(255 * value)
    albedo.set([shade, shade, shade, 255], index * 4)
    relief.set([height, height, height, 255], index * 4)
  })
  const make = (data: Uint8Array, colorSpace: string) => {
    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 4
    texture.colorSpace = colorSpace
    texture.needsUpdate = true
    return texture
  }
  return { map: make(albedo, THREE.SRGBColorSpace), bump: make(relief, THREE.NoColorSpace) }
}
