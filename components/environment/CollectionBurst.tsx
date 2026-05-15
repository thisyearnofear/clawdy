'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface BurstParticle {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  age: number
  color: THREE.Color
}

interface BurstEvent {
  id: number
  position: [number, number, number]
  color: string
  startTime: number
}

const BURST_PARTICLE_COUNT = 64
const BURST_LIFETIME = 0.6
const BURST_SPEED = 8

let burstId = 0
const pendingBursts: BurstEvent[] = []

/**
 * Emit a collection burst at a world position.
 * Call this from anywhere — the CollectionBurst component will pick it up.
 */
export function emitCollectionBurst(position: [number, number, number], color: string = '#f1c40f') {
  pendingBursts.push({
    id: burstId++,
    position,
    color,
    startTime: performance.now(),
  })
  // Keep queue bounded
  if (pendingBursts.length > 8) pendingBursts.shift()
}

/**
 * Renders collection burst particles using a single InstancedMesh.
 * Place once in the scene — it handles all bursts globally.
 */
export function CollectionBurst() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useRef(new THREE.Object3D()).current
  const particles = useRef<BurstParticle[]>(
    Array.from({ length: BURST_PARTICLE_COUNT }, () => ({
      x: 0, y: -200, z: 0, vx: 0, vy: 0, vz: 0, age: BURST_LIFETIME + 1, color: new THREE.Color()
    }))
  )
  const nextSlot = useRef(0)

  useFrame((_, delta) => {
    if (!meshRef.current) return

    // Process pending bursts
    while (pendingBursts.length > 0) {
      const burst = pendingBursts.shift()!
      const burstColor = new THREE.Color(burst.color)
      const particlesPerBurst = 8

      for (let i = 0; i < particlesPerBurst; i++) {
        const idx = nextSlot.current % BURST_PARTICLE_COUNT
        nextSlot.current++

        // Random direction on a sphere
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const speed = BURST_SPEED * (0.5 + Math.random() * 0.5)

        particles.current[idx] = {
          x: burst.position[0],
          y: burst.position[1],
          z: burst.position[2],
          vx: Math.sin(phi) * Math.cos(theta) * speed,
          vy: Math.sin(phi) * Math.sin(theta) * speed * 0.8 + 3, // bias upward
          vz: Math.cos(phi) * speed,
          age: 0,
          color: burstColor.clone().offsetHSL(Math.random() * 0.1 - 0.05, 0, Math.random() * 0.2),
        }
      }
    }

    // Update all particles
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const p = particles.current[i]
      p.age += delta

      if (p.age > BURST_LIFETIME) {
        dummy.position.set(0, -200, 0)
        dummy.scale.setScalar(0)
      } else {
        const t = p.age / BURST_LIFETIME
        // Physics
        p.x += p.vx * delta
        p.y += p.vy * delta
        p.z += p.vz * delta
        p.vy -= 15 * delta // gravity

        dummy.position.set(p.x, p.y, p.z)
        // Shrink over lifetime with a pop at start
        const scale = (1 - t * t) * 0.25
        dummy.scale.setScalar(scale)

        meshRef.current!.setColorAt(i, p.color)
      }

      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, BURST_PARTICLE_COUNT]} frustumCulled={false}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshBasicMaterial transparent opacity={0.9} depthWrite={false} />
    </instancedMesh>
  )
}
