import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ARENA_WORLD } from '../arenaCourse'

const COLLIDER_PATH = resolve(process.cwd(), 'public/terrain/sandstone-basin.glb')
const VISUAL_PATH = resolve(process.cwd(), 'public/terrain/sandstone-basin-visual.glb')

async function loadMeshes(path: string) {
  const bytes = await readFile(path)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const gltf = await new GLTFLoader().parseAsync(buffer, '')
  const meshes: THREE.Mesh[] = []
  gltf.scene.traverse(object => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })
  return { bytes, meshes }
}

function uniquePositions(meshes: THREE.Mesh[]) {
  const seen = new Set<string>()
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      seen.add(`${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`)
    }
  }
  return seen
}

function triangleCount(meshes: THREE.Mesh[]) {
  return meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0)
}

describe('render-only visual terrain twin', () => {
  it('is pinned exactly when the visual GLB has been built', () => {
    expect(ARENA_WORLD.visualUrl).toBe('/terrain/sandstone-basin-visual.glb')
    expect(ARENA_WORLD.visualUrl).not.toBe(ARENA_WORLD.colliderUrl)
    expect(existsSync(VISUAL_PATH)).toBe(ARENA_WORLD.visualSha256 !== null)
  })

  it.skipIf(!existsSync(VISUAL_PATH))('matches its pinned hash, carries UVs, and has the collider geometry', async () => {
    const visual = await loadMeshes(VISUAL_PATH)
    const collider = await loadMeshes(COLLIDER_PATH)
    expect(createHash('sha256').update(visual.bytes).digest('hex')).toBe(ARENA_WORLD.visualSha256)
    expect(visual.bytes.byteLength).toBeLessThan(4_000_000)
    for (const mesh of visual.meshes.filter(mesh => mesh.name.startsWith('Terrain'))) {
      expect(mesh.geometry.getAttribute('uv')).toBeDefined()
    }
    expect(triangleCount(visual.meshes)).toBe(triangleCount(collider.meshes))
    expect(uniquePositions(visual.meshes)).toEqual(uniquePositions(collider.meshes))
  })
})
