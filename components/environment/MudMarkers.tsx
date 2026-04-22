'use client'

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { getMudIntensity, getTerrainHeight } from '../terrain/terrainUtils'

const SCAN_RANGE = 55
const SCAN_STEP = 4

export function MudMarkers() {
  const markers = useMemo(() => {
    const result: { position: [number, number, number]; intensity: number }[] = []
    for (let x = -SCAN_RANGE; x <= SCAN_RANGE; x += SCAN_STEP) {
      for (let z = -SCAN_RANGE; z <= SCAN_RANGE; z += SCAN_STEP) {
        const intensity = getMudIntensity(x, z)
        if (intensity > 0.2) {
          const y = getTerrainHeight(x, z)
          result.push({ position: [x, y + 0.15, z], intensity })
        }
      }
    }
    return result
  }, [])

  return (
    <>
      {markers.map((m, i) => (
        <MudPatch key={i} position={m.position} intensity={m.intensity} />
      ))}
    </>
  )
}

function MudPatch({ position, intensity }: { position: [number, number, number]; intensity: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    if (matRef.current) {
      const t = state.clock.getElapsedTime()
      matRef.current.opacity = 0.25 + Math.sin(t * 1.5 + position[0]) * 0.08
    }
  })

  const scale = 1.5 + intensity * 2

  return (
    <mesh ref={ref} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[scale, 12]} />
      <meshBasicMaterial
        ref={matRef}
        color="#4a2800"
        transparent
        opacity={0.3}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
