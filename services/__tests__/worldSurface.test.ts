import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createWorldSurface } from '../worldSurface'

function ground(x = 0, y = 0, size = 4) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial())
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, y, 0)
  return mesh
}

describe('shared generated-world surface queries', () => {
  it('includes every mesh, applies parent transforms, and does not mutate the source', () => {
    const root = new THREE.Group()
    root.position.set(10, 3, 0)
    root.scale.setScalar(2)
    const first = ground()
    const second = ground(5, 2)
    second.visible = false
    root.add(first, second)
    const original = first.geometry.getAttribute('position').array.slice()
    const world = createWorldSurface(root)
    try {
      expect(world.meshCount).toBe(2)
      expect(world.triangleCount).toBe(4)
      expect(world.sample([10, 20, 0])?.point[1]).toBeCloseTo(3)
      expect(world.sample([20, 20, 0])?.point[1]).toBeCloseTo(7)
      expect(world.sample([20, 20, 0])?.normal[1]).toBeCloseTo(1)
      expect(first.geometry.getAttribute('position').array).toEqual(original)
    } finally {
      world.dispose()
    }
  })

  it('returns null outside the collider rather than inventing ground at zero', () => {
    const world = createWorldSurface(ground())
    try {
      expect(world.sample([100, 5, 100])).toBeNull()
      expect(world.sample([0, -5, 0])).toBeNull()
      expect(world.sample([0, 10, 0], 5)).toBeNull()
      expect(() => world.sample([NaN, 1, 0])).toThrow()
    } finally {
      world.dispose()
    }
  })

  it('provides detached samples and immutable world-space geometry for physics consumers', () => {
    const world = createWorldSurface(ground())
    const first = world.sample([0, 5, 0])!
    first.point[1] = 100
    expect(world.sample([0, 5, 0])?.point[1]).toBeCloseTo(0)
    const vertices = world.colliderData().vertices
    vertices[0] = 10000
    expect(world.colliderData().vertices[0]).not.toBe(10000)
    world.dispose()
    expect(() => world.sample([0, 5, 0])).toThrow('disposed')
  })

  it('detects unsupported surface gaps and excessive slope along candidate routes', () => {
    const root = new THREE.Group()
    root.add(ground(-3, 0, 2), ground(3, 0, 2))
    const world = createWorldSurface(root)
    expect(world.checkRouteGrounding([[-3, 0, 0], [3, 0, 0]], { spacing: 0.25, clearance: 2, maxDrop: 3 }).valid).toBe(false)
    world.dispose()

    const tilted = ground()
    tilted.rotation.x = -Math.PI / 6
    const slope = createWorldSurface(tilted)
    expect(slope.checkRouteGrounding([[-0.2, 0, 0], [0.2, 0, 0]], { spacing: 0.1, clearance: 3, maxDrop: 6, minNormalY: 0.8 }).valid).toBe(false)
    slope.dispose()
  })

  it('validates a supported route and rejects invalid validation budgets', () => {
    const world = createWorldSurface(ground(0, 0, 10))
    const result = world.checkRouteGrounding([[-2, 0, 0], [2, 0, 0]], { spacing: 0.25, clearance: 1, maxDrop: 2 })
    expect(result.valid).toBe(true)
    expect(result.samples).toBeGreaterThan(2)
    expect(() => world.checkRouteGrounding([[0, 0, 0]], { spacing: 0, clearance: 1, maxDrop: 2 })).toThrow()
    expect(() => world.checkRouteGrounding([[-2, 0, 0], [2, 0, 0]], { spacing: 0.00001, clearance: 1, maxDrop: 2 })).toThrow('sample budget')
    world.dispose()
  })

  it('rejects empty collider scenes and disposes owned resources exactly once', () => {
    expect(() => createWorldSurface(new THREE.Group())).toThrow('mesh')
    const source = ground()
    const disposeSource = vi.spyOn(source.geometry, 'dispose')
    const world = createWorldSurface(source)
    world.dispose()
    world.dispose()
    expect(disposeSource).not.toHaveBeenCalled()
  })

  it('loads the committed collider as geometry without starting a browser', async () => {
    const bytes = await readFile(resolve(process.cwd(), 'public/marble/collider.glb'))
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const gltf = await new GLTFLoader().parseAsync(buffer, '')
    const world = createWorldSurface(gltf.scene)
    try {
      expect(world.meshCount).toBeGreaterThan(0)
      expect(world.triangleCount).toBeGreaterThan(0)
      expect(world.bounds.min.every(Number.isFinite)).toBe(true)
      expect(world.bounds.max.every(Number.isFinite)).toBe(true)
      const geometry = world.colliderData()
      expect(geometry.vertices.length % 3).toBe(0)
      expect(geometry.indices.length % 3).toBe(0)
    } finally {
      world.dispose()
    }
  })
})
