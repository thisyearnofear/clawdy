'use client'

import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { CloudConfig } from './CloudManager'

const PARTICLE_COUNT = 800

function buildParticleData(preset: string, bounds: [number, number, number]) {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const vel = new Float32Array(PARTICLE_COUNT * 3)
  const sz = new Float32Array(PARTICLE_COUNT)

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * bounds[0] * 4
    pos[i * 3 + 1] = Math.random() * 25
    pos[i * 3 + 2] = (Math.random() - 0.5) * bounds[2] * 4
    vel[i * 3] = 0
    vel[i * 3 + 1] = -4
    vel[i * 3 + 2] = 0
    sz[i] = 0.15
  }

  let color = '#aabbcc'
  let alpha = 0.6

  if (preset === 'stormy') {
    color = '#8899aa'
    alpha = 0.8
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      vel[i * 3] = (Math.random() - 0.5) * 2
      vel[i * 3 + 1] = -(6 + Math.random() * 4)
      vel[i * 3 + 2] = (Math.random() - 0.5) * 2
      sz[i] = 0.08 + Math.random() * 0.12
    }
  } else if (preset === 'sunset') {
    color = '#ffcc88'
    alpha = 0.4
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      vel[i * 3] = (Math.random() - 0.5) * 0.5
      vel[i * 3 + 1] = -(0.3 + Math.random() * 0.5)
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5
      sz[i] = 0.2 + Math.random() * 0.3
    }
  } else if (preset === 'candy') {
    color = '#ffaaee'
    alpha = 0.5
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      vel[i * 3] = (Math.random() - 0.5) * 1
      vel[i * 3 + 1] = -(1 + Math.random() * 2)
      vel[i * 3 + 2] = (Math.random() - 0.5) * 1
      sz[i] = 0.12 + Math.random() * 0.2
    }
  } else if (preset === 'cosmic') {
    color = '#aa66ff'
    alpha = 0.6
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      vel[i * 3] = (Math.random() - 0.5) * 0.3
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.2 // float in all directions
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3
      sz[i] = 0.05 + Math.random() * 0.15
    }
  } else {
    alpha = 0.3
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      vel[i * 3 + 1] = -(1 + Math.random() * 2)
      sz[i] = 0.1 + Math.random() * 0.1
    }
  }

  return { positions: pos, velocities: vel, sizes: sz, particleColor: color, opacity: alpha }
}

// Particle data and material are created once at module level per mount
// and updated via the points ref — this avoids React compiler ref/state issues
export function WeatherParticles({ config }: { config: CloudConfig }) {
  const meshRef = useRef<THREE.Points>(null)
  const velocitiesRef = useRef<Float32Array | null>(null)
  const preset = config.preset || 'custom'

  // Initialize on first render via effect
  useEffect(() => {
    if (!meshRef.current) return
    const data = buildParticleData(preset, config.bounds)
    velocitiesRef.current = data.velocities

    const geo = meshRef.current.geometry
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(data.sizes, 1))

    const mat = meshRef.current.material as THREE.PointsMaterial
    mat.color.set(data.particleColor)
    mat.opacity = data.opacity
  }, [preset, config.bounds])

  useFrame((_, delta) => {
    if (!meshRef.current || !velocitiesRef.current) return
    const geo = meshRef.current.geometry
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
    if (!posAttr) return
    const arr = posAttr.array as Float32Array
    const velocities = velocitiesRef.current
    const boundsX = config.bounds[0] * 4
    const boundsZ = config.bounds[2] * 4

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3] += velocities[i * 3] * delta
      arr[i * 3 + 1] += velocities[i * 3 + 1] * delta
      arr[i * 3 + 2] += velocities[i * 3 + 2] * delta

      if (arr[i * 3 + 1] < -1) {
        arr[i * 3] = (Math.random() - 0.5) * boundsX
        arr[i * 3 + 1] = 20 + Math.random() * 5
        arr[i * 3 + 2] = (Math.random() - 0.5) * boundsZ
      }
    }
    posAttr.needsUpdate = true
  })

  return (
    <points ref={meshRef} frustumCulled={false}>
      <bufferGeometry />
      <pointsMaterial
        size={0.2}
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}
