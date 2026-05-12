'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'

interface VehicleTrailProps {
  chassisRef: React.RefObject<RapierRigidBody | null>
  color?: string
  isPlayer?: boolean
}

const TRAIL_COUNT = 24
const TRAIL_LIFETIME = 0.8

/**
 * Lightweight particle trail that follows a vehicle.
 * Uses a single InstancedMesh with small spheres that fade out over time.
 */
export function VehicleTrail({ chassisRef, color = '#88aaff', isPlayer = false }: VehicleTrailProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const particles = useRef<Array<{ x: number; y: number; z: number; age: number; vx: number; vy: number; vz: number }>>(
    Array.from({ length: TRAIL_COUNT }, () => ({ x: 0, y: -100, z: 0, age: TRAIL_LIFETIME + 1, vx: 0, vy: 0, vz: 0 }))
  )
  const spawnIndex = useRef(0)
  const lastSpawnTime = useRef(0)

  useFrame((_, delta) => {
    if (!meshRef.current || !chassisRef.current) return

    const pos = chassisRef.current.translation()
    const vel = chassisRef.current.linvel()
    const speed = Math.sqrt(vel.x ** 2 + vel.z ** 2)

    // Only emit when moving
    const now = performance.now()
    const spawnInterval = speed > 2 ? 40 : 80
    if (speed > 0.5 && now - lastSpawnTime.current > spawnInterval) {
      lastSpawnTime.current = now
      const idx = spawnIndex.current % TRAIL_COUNT
      spawnIndex.current++

      // Spawn behind the vehicle with slight randomness
      particles.current[idx] = {
        x: pos.x + (Math.random() - 0.5) * 0.8,
        y: pos.y - 0.2,
        z: pos.z + (Math.random() - 0.5) * 0.8,
        age: 0,
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.5 + Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 0.5,
      }
    }

    // Update particles
    const trailColor = new THREE.Color(color)
    const playerGlow = isPlayer ? new THREE.Color('#00ff88') : trailColor

    for (let i = 0; i < TRAIL_COUNT; i++) {
      const p = particles.current[i]
      p.age += delta

      if (p.age > TRAIL_LIFETIME) {
        dummy.position.set(0, -100, 0)
        dummy.scale.setScalar(0)
      } else {
        const t = p.age / TRAIL_LIFETIME
        p.x += p.vx * delta
        p.y += p.vy * delta
        p.z += p.vz * delta
        p.vy -= 1.5 * delta // gravity

        dummy.position.set(p.x, p.y, p.z)
        const scale = (1 - t) * (isPlayer ? 0.18 : 0.12)
        dummy.scale.setScalar(scale)

        // Color fade
        const fadeColor = isPlayer
          ? playerGlow.clone().lerp(new THREE.Color('#ffffff'), t * 0.5)
          : trailColor.clone().lerp(new THREE.Color('#333333'), t)
        meshRef.current!.setColorAt(i, fadeColor)
      }

      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TRAIL_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial transparent opacity={0.6} depthWrite={false} />
    </instancedMesh>
  )
}
