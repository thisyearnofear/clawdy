import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createDecorModel, planArenaDecor, PROP_RADIUS, type DecorPropType } from '../arenaDecor'
import type { ArenaCourse } from '../arenaCourse'

const PROP_FILES: Record<DecorPropType, string> = {
  generator: 'assets/kenney/space-kit/machine_generator.glb',
  dish: 'assets/kenney/space-kit/satelliteDish.glb',
  barrels: 'assets/kenney/space-kit/barrels.glb',
}
const PROP_RADIUS_BY_FILE: Record<string, number> = {
  'assets/kenney/space-kit/machine_generator.glb': PROP_RADIUS.generator,
  'assets/kenney/space-kit/satelliteDish.glb': PROP_RADIUS.dish,
  'assets/kenney/space-kit/barrels.glb': PROP_RADIUS.barrels,
}
const SVG_SHA256: Record<string, string> = {
  'assets/game-icons/crystal-bars.svg': '52d535bfc77332f080d10ac56cae145e83f62682640b361bf11d6779c0db43e0',
  'assets/game-icons/high-tide.svg': 'd0c628596f2c15b4513da58a2c0797d23a78551bf11df2710a43db030c98f2c9',
}

const root = join(__dirname, '..', '..')
const pub = (path: string) => join(root, 'public', path)

const GLBS = [
  'assets/kenney/space-kit/machine_generator.glb',
  'assets/kenney/space-kit/satelliteDish.glb',
  'assets/kenney/space-kit/barrels.glb',
]
const WAVS = [
  'assets/kenney/sci-fi-sounds/engine.wav',
  'assets/kenney/sci-fi-sounds/collect.wav',
  'assets/kenney/sci-fi-sounds/bank.wav',
  'assets/kenney/sci-fi-sounds/drain.wav',
  'assets/kenney/sci-fi-sounds/impact.wav',
]
const SVGS = [
  'assets/game-icons/crystal-bars.svg',
  'assets/game-icons/high-tide.svg',
]

function glbJson(path: string) {
  const buffer = readFileSync(pub(path))
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67)
  const jsonLength = buffer.readUInt32LE(12)
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString())
}

describe('imported presentation assets', () => {
  it('references only local files that exist and stay under the size budget', () => {
    const files = [...GLBS, ...WAVS, ...SVGS]
    for (const file of files) expect(statSync(pub(file)).size).toBeGreaterThan(0)
    const total = files.reduce((sum, file) => sum + statSync(pub(file)).size, 0)
    expect(total).toBeLessThan(1_000_000)
  })

  it('ships self-contained GLBs with no external textures or buffers', () => {
    for (const file of GLBS) {
      const json = glbJson(file)
      for (const image of json.images ?? []) expect(image.uri ?? '').not.toMatch(/\S/)
      for (const buffer of json.buffers ?? []) expect(buffer.uri).toBeUndefined()
      for (const extension of json.extensionsUsed ?? []) expect(extension).toBe('KHR_materials_unlit')
      expect(statSync(pub(file)).size).toBeLessThan(60_000)
    }
  })

  it('transcoded WAVs are mono 24 kHz PCM16 RIFF files', () => {
    for (const file of WAVS) {
      const buffer = readFileSync(pub(file))
      expect(buffer.toString('ascii', 0, 4)).toBe('RIFF')
      expect(buffer.toString('ascii', 8, 12)).toBe('WAVE')
      expect(buffer.readUInt16LE(22)).toBe(1)
      expect(buffer.readUInt32LE(24)).toBe(24000)
      expect(buffer.readUInt16LE(34)).toBe(16)
    }
  })

  it('keeps license evidence next to every pack and credits covering each file', () => {
    expect(statSync(pub('assets/kenney/space-kit/License.txt')).size).toBeGreaterThan(0)
    expect(statSync(pub('assets/kenney/sci-fi-sounds/License.txt')).size).toBeGreaterThan(0)
    expect(statSync(pub('assets/game-icons/Attribution.txt')).size).toBeGreaterThan(0)
    expect(readFileSync(pub('assets/kenney/space-kit/License.txt'), 'utf8')).toContain('CC0')
    expect(readFileSync(pub('assets/game-icons/Attribution.txt'), 'utf8')).toContain('CC BY 3.0')
    const credits = JSON.parse(readFileSync(pub('assets/asset-credits.json'), 'utf8'))
    const listed = credits.packs.flatMap((pack: { files: string[] }) => pack.files)
    for (const file of [...GLBS, ...WAVS, ...SVGS]) expect(listed).toContain(file)
  })

  it('keeps each prop footprint inside its planned placement radius after scaling', async () => {
    const fixture = {
      scenario: {
        nodes: [
          { id: 'champion-base', position: [10, 0, 0] as [number, number, number] },
          { id: 'rival-base', position: [-10, 0, 0] as [number, number, number] },
        ],
        edges: [],
        entrants: [
          { id: 'champion', baseNode: 'champion-base', policyVersion: 'p1' },
          { id: 'rival', baseNode: 'rival-base', policyVersion: 'p2' },
        ],
      } as unknown as ArenaCourse['scenario'],
      config: { id: 'test', name: 'test', terrain: { url: '', sha256: '' } },
      center: [0, 0, 0] as [number, number, number],
      floodZones: [],
    }
    const scaleByType = new Map<DecorPropType, number>()
    for (const candidate of planArenaDecor(fixture)) {
      if (scaleByType.has(candidate.type)) expect(candidate.scale).toBe(scaleByType.get(candidate.type))
      scaleByType.set(candidate.type, candidate.scale)
    }
    for (const [type, file] of Object.entries(PROP_FILES) as [DecorPropType, string][]) {
      const scale = scaleByType.get(type)
      expect(scale, `${type} has no planned slot`).toBeGreaterThan(0)
      const gltf = await new GLTFLoader().parseAsync(readFileSync(pub(file)).buffer as ArrayBuffer, '')
      gltf.scene.updateMatrixWorld(true)
      const sourceBox = new THREE.Box3().setFromObject(gltf.scene)
      const model = createDecorModel(gltf.scene)
      model.updateMatrixWorld(true)
      const afterBox = new THREE.Box3().setFromObject(gltf.scene)
      expect(afterBox.min.x, `${file} source mutated`).toBeCloseTo(sourceBox.min.x, 6)
      expect(afterBox.min.z, `${file} source mutated`).toBeCloseTo(sourceBox.min.z, 6)
      const box = new THREE.Box3().setFromObject(model)
      expect(box.min.y, `${file} not bottom-grounded`).toBeCloseTo(0, 6)
      const center = box.getCenter(new THREE.Vector3())
      expect(Math.abs(center.x), `${file} not xz-centered`).toBeLessThan(1e-6)
      expect(Math.abs(center.z), `${file} not xz-centered`).toBeLessThan(1e-6)
      const radius = Math.hypot(
        Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
        Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
      ) * scale!
      expect(radius, file).toBeLessThanOrEqual(PROP_RADIUS_BY_FILE[file] + 1e-6)
      expect(scale!).toBeLessThanOrEqual(1)
    }
  })

  it('ships the two approved game-icons SVGs byte-identical to the verified downloads', () => {
    for (const [file, sha256] of Object.entries(SVG_SHA256)) {
      const svg = readFileSync(pub(file))
      expect(createHash('sha256').update(svg).digest('hex'), file).toBe(sha256)
    }
  })
})
