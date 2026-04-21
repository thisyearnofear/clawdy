'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../../services/gameStore'
import { makeSoftRippleTexture } from './waterDecalTextures'

type Ripple = {
  active: boolean
  startAt: number
  durationMs: number
  x: number
  y: number
  z: number
  rotation: number
  maxRadius: number
}

export function PuddleRipples({
  getHeightAt,
  bounds,
}: {
  getHeightAt?: (x: number, z: number) => number
  bounds: [number, number, number]
}) {
  const { camera } = useThree()
  const preset = useGameStore(s => s.cloudConfig.preset) || 'custom'
  const lightning = useGameStore(s => s.activeWeatherEffects.lightning?.intensity ?? 0)

  const isWet = preset === 'stormy' || lightning > 0.45
  const intensity = Math.min(1, preset === 'stormy' ? 1 : lightning)

  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null
    return makeSoftRippleTexture(256)
  }, [])

  // Pool of ripple meshes (cheaper than spawning/removing React nodes constantly)
  const RIPPLE_POOL = 16
  const ripplesRef = useRef<Ripple[]>([])
  const meshRefs = useRef<THREE.Mesh[]>([])
  const materialRefs = useRef<THREE.MeshBasicMaterial[]>([])
  const spawnAccumulator = useRef(0)

  useEffect(() => {
    ripplesRef.current = new Array(RIPPLE_POOL).fill(0).map(() => ({
      active: false,
      startAt: 0,
      durationMs: 900,
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      maxRadius: 2.6,
    }))
  }, [])

  useFrame((_, delta) => {
    if (!isWet || !texture) return

    // Adaptive perf: if FPS drops, emit fewer ripples.
    const perfScale = THREE.MathUtils.clamp(0.4, 1, 0.033 / Math.max(0.001, delta))

    // Spawn rate: subtle, scales with intensity.
    const spawnsPerSec = (1.2 + intensity * 2.2) * perfScale
    spawnAccumulator.current += delta * spawnsPerSec

    while (spawnAccumulator.current >= 1) {
      spawnAccumulator.current -= 1

      // Find free slot
      const idx = ripplesRef.current.findIndex(r => !r.active)
      if (idx === -1) break

      const cam = camera.position
      const spread = 14
      const x = cam.x + (Math.random() - 0.5) * spread
      const z = cam.z + (Math.random() - 0.5) * spread

      // Keep within bounds
      const clampX = THREE.MathUtils.clamp(x, -bounds[0] * 0.5, bounds[0] * 0.5)
      const clampZ = THREE.MathUtils.clamp(z, -bounds[2] * 0.5, bounds[2] * 0.5)
      const y = (getHeightAt ? getHeightAt(clampX, clampZ) : 0) + 0.05

      const maxRadius = 1.6 + Math.random() * (2.8 + intensity * 1.2)
      const durationMs = 750 + Math.random() * 650

      ripplesRef.current[idx] = {
        active: true,
        startAt: performance.now(),
        durationMs,
        x: clampX,
        y,
        z: clampZ,
        rotation: Math.random() * Math.PI * 2,
        maxRadius,
      }
    }

    // Update ripples
    const now = performance.now()
    for (let i = 0; i < RIPPLE_POOL; i++) {
      const ripple = ripplesRef.current[i]
      const mesh = meshRefs.current[i]
      const mat = materialRefs.current[i]
      if (!mesh || !mat) continue

      if (!ripple.active) {
        mesh.visible = false
        continue
      }

      const t = (now - ripple.startAt) / ripple.durationMs
      if (t >= 1) {
        ripple.active = false
        mesh.visible = false
        continue
      }

      const ease = 1 - Math.pow(1 - t, 2)
      const radius = ripple.maxRadius * ease
      const opacity = (1 - t) * (0.18 + intensity * 0.18)

      mesh.visible = true
      mesh.position.set(ripple.x, ripple.y, ripple.z)
      mesh.rotation.set(-Math.PI / 2, 0, ripple.rotation)
      mesh.scale.set(radius, radius, 1)
      mat.opacity = opacity
    }
  })

  if (!texture) return null

  const planeGeo = useMemo(() => new THREE.PlaneGeometry(1, 1, 1, 1), [])

  return (
    <group>
      {new Array(RIPPLE_POOL).fill(0).map((_, i) => (
        <mesh
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          ref={(m) => { if (m) meshRefs.current[i] = m }}
          geometry={planeGeo}
          frustumCulled={false}
          visible={false}
        >
          <meshBasicMaterial
            ref={(mat) => { if (mat) materialRefs.current[i] = mat }}
            map={texture}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            color={new THREE.Color(0.75, 0.86, 1.0)}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
