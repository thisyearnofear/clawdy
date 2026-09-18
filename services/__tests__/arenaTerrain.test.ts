import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { disposeArenaTerrain, loadArenaTerrain } from '../arenaTerrain'

let bytes: Uint8Array<ArrayBuffer>
let sha256: string
const URL = '/terrain/sandstone-basin.glb'

beforeAll(async () => {
  bytes = new Uint8Array(await readFile(resolve(process.cwd(), 'public/terrain/sandstone-basin.glb')))
  sha256 = createHash('sha256').update(bytes).digest('hex')
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function stubFetch(body: BodyInit | null, init?: ResponseInit) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, init)))
}

describe('arena terrain loader', () => {
  it('parses the pinned GLB and returns a disposable scene', async () => {
    stubFetch(bytes)
    const scene = await loadArenaTerrain(URL, sha256)
    expect(scene.children.length).toBeGreaterThan(0)
    let meshes = 0
    scene.traverse(object => { if ((object as { isMesh?: boolean }).isMesh) meshes++ })
    expect(meshes).toBeGreaterThan(1)
    expect(() => disposeArenaTerrain(scene)).not.toThrow()
  })

  it('rejects a non-ok response with the status in the message', async () => {
    stubFetch(null, { status: 503 })
    await expect(loadArenaTerrain(URL, sha256)).rejects.toThrow('503')
  })

  it('rejects a body whose hash does not match', async () => {
    const changed = bytes.slice()
    changed[changed.length - 1] ^= 1
    stubFetch(changed)
    await expect(loadArenaTerrain(URL, sha256)).rejects.toThrow('hash')
  })

  it('rejects an empty buffer and one outside the course budget', async () => {
    stubFetch(new Uint8Array(0))
    await expect(loadArenaTerrain(URL, sha256)).rejects.toThrow('size')
    stubFetch(new Uint8Array(4_000_001))
    await expect(loadArenaTerrain(URL, sha256)).rejects.toThrow('size')
  })

  it('rejects a pre-aborted signal before any fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const abort = new AbortController()
    abort.abort()
    await expect(loadArenaTerrain(URL, sha256, abort.signal)).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects an abort that lands after the fetch resolves', async () => {
    const abort = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => {
      abort.abort()
      return new Response(bytes)
    }))
    await expect(loadArenaTerrain(URL, sha256, abort.signal)).rejects.toThrow()
  })

  it('rejects a post-parse abort and disposes shared resources exactly once', async () => {
    stubFetch(bytes)
    const abort = new AbortController()
    const geometry = new THREE.BufferGeometry()
    const material = new THREE.MeshStandardMaterial()
    material.map = new THREE.Texture()
    const group = new THREE.Group()
    group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material))
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    const textureDispose = vi.spyOn(material.map, 'dispose')
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementationOnce(async () => {
      abort.abort()
      return { scene: group } as unknown as Awaited<ReturnType<GLTFLoader['parseAsync']>>
    })
    await expect(loadArenaTerrain(URL, sha256, abort.signal)).rejects.toThrow()
    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(textureDispose).toHaveBeenCalledTimes(1)
  })

  it('exports the bottom cap facing outward down, not into the landform', async () => {
    stubFetch(bytes)
    const scene = await loadArenaTerrain(URL, sha256)
    scene.updateWorldMatrix(true, true)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const ab = new THREE.Vector3()
    const ac = new THREE.Vector3()
    let bottomTriangles = 0
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      const positions = object.geometry.getAttribute('position')
      const index = object.geometry.getIndex()
      const triangles = index ? index.count / 3 : positions.count / 3
      for (let triangle = 0; triangle < triangles; triangle++) {
        const ids = [0, 1, 2].map(k => (index ? index.getX(triangle * 3 + k) : triangle * 3 + k))
        a.fromBufferAttribute(positions, ids[0]).applyMatrix4(object.matrixWorld)
        b.fromBufferAttribute(positions, ids[1]).applyMatrix4(object.matrixWorld)
        c.fromBufferAttribute(positions, ids[2]).applyMatrix4(object.matrixWorld)
        if (Math.abs(a.y + 1.2) > 1e-4 || Math.abs(b.y + 1.2) > 1e-4 || Math.abs(c.y + 1.2) > 1e-4) continue
        bottomTriangles++
        ab.subVectors(b, a)
        ac.subVectors(c, a)
        expect(ab.cross(ac).y).toBeLessThan(0)
      }
    })
    expect(bottomTriangles).toBeGreaterThan(0)
    disposeArenaTerrain(scene)
  })
})
