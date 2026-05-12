'use client'

import { useEffect, useState } from 'react'
import { RigidBody } from '@react-three/rapier'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import type { MarbleWorldConfig } from '../../services/marbleWorld'

/**
 * MarbleCollider loads a GLB mesh and creates a Rapier trimesh collider from it.
 * This gives the Marble-generated world physical surfaces for vehicles to drive on.
 *
 * The collider mesh is invisible — the visual layer is handled by MarbleWorldLayer.
 */
interface MarbleColliderProps {
  config: MarbleWorldConfig
  onReady?: (sampler: (x: number, z: number) => number) => void
}

export function MarbleCollider({ config, onReady }: MarbleColliderProps) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)

  useEffect(() => {
    if (!config.collider?.url) return

    let cancelled = false
    const loader = new GLTFLoader()

    loader.load(
      config.collider.url,
      (gltf) => {
        if (cancelled) return

        // Find the first mesh in the loaded GLTF
        let colliderGeometry: THREE.BufferGeometry | null = null
        gltf.scene.traverse((child) => {
          if (!colliderGeometry && (child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            // Apply world transforms to the geometry so collider matches visual
            mesh.updateWorldMatrix(true, false)
            const geo = mesh.geometry.clone()
            geo.applyMatrix4(mesh.matrixWorld)
            colliderGeometry = geo
          }
        })

        if (colliderGeometry) {
          setGeometry(colliderGeometry)

          // Provide a height sampler based on raycasting the collider mesh
          if (onReady) {
            const tempMesh = new THREE.Mesh(colliderGeometry, new THREE.MeshBasicMaterial())
            const raycaster = new THREE.Raycaster()
            const origin = new THREE.Vector3()
            const direction = new THREE.Vector3(0, -1, 0)

            const sampler = (x: number, z: number): number => {
              origin.set(x, 200, z)
              raycaster.set(origin, direction)
              const hits = raycaster.intersectObject(tempMesh)
              return hits.length > 0 ? hits[0].point.y : 0
            }

            onReady(sampler)
          }
        }
      },
      undefined,
      (error) => {
        if (!cancelled) {
          console.error('[MarbleCollider] Failed to load collider mesh:', error)
        }
      }
    )

    return () => {
      cancelled = true
    }
  }, [config.collider?.url, onReady])

  if (!geometry) return null

  return (
    <RigidBody type="fixed" colliders="trimesh" ccd={true}>
      <mesh geometry={geometry} visible={false}>
        <meshBasicMaterial visible={false} />
      </mesh>
    </RigidBody>
  )
}
