import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export async function loadArenaTerrain(url: string, expectedHash: string, signal?: AbortSignal): Promise<THREE.Group> {
  signal?.throwIfAborted()
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Collider request failed (${response.status})`)
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength === 0 || buffer.byteLength > 4_000_000) throw new Error('Collider size is outside the course budget')
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
  if (hash !== expectedHash) throw new Error('Collider hash does not match the versioned course')
  signal?.throwIfAborted()
  const gltf = await new GLTFLoader().parseAsync(buffer, '')
  try {
    signal?.throwIfAborted()
  } catch (error) {
    disposeArenaTerrain(gltf.scene)
    throw error
  }
  return gltf.scene
}

export function disposeArenaTerrain(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value)
      }
    }
  })
  for (const texture of textures) texture.dispose()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
}
