'use client'

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { getMudIntensity, getTerrainHeight } from '../terrain/terrainUtils'

const SCAN_RANGE = 55
const SCAN_STEP = 4
const MAX_MARKERS = 400

const tempMatrix = new THREE.Matrix4()
const tempColor = new THREE.Color()

export function MudMarkers() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  const markers = useMemo(() => {
    const result: { position: [number, number, number]; intensity: number; scale: number }[] = []
    for (let x = -SCAN_RANGE; x <= SCAN_RANGE; x += SCAN_STEP) {
      for (let z = -SCAN_RANGE; z <= SCAN_RANGE; z += SCAN_STEP) {
        const intensity = getMudIntensity(x, z)
        if (intensity > 0.2) {
          const y = getTerrainHeight(x, z)
          const scale = 1.5 + intensity * 2
          result.push({ position: [x, y + 0.15, z], intensity, scale })
        }
      }
    }
    return result
  }, [])

  // Set up instances once
  useMemo(() => {
    if (!meshRef.current) return
    const mesh = meshRef.current
    const dummy = new THREE.Object3D()
    const baseColor = new THREE.Color('#4a2800')

    markers.forEach((m, i) => {
      dummy.position.set(...m.position)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.setScalar(m.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, baseColor)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [markers])

  // Animate opacity
  useFrame((state) => {
    if (matRef.current) {
      const t = state.clock.getElapsedTime()
      matRef.current.opacity = 0.25 + Math.sin(t * 1.5) * 0.08
    }
  })

  if (markers.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_MARKERS]}
      frustumCulled
    >
      <circleGeometry args={[1, 12]} />
      <meshBasicMaterial
        ref={matRef}
        color="#4a2800"
        transparent
        opacity={0.3}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}
