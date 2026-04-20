'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../../services/gameStore'

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

function makeRippleTexture(size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.48

  // Transparent base
  ctx.clearRect(0, 0, size, size)

  // Soft ring (two gradients)
  const g1 = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r)
  g1.addColorStop(0.0, 'rgba(255,255,255,0.0)')
  g1.addColorStop(0.55, 'rgba(255,255,255,0.00)')
  g1.addColorStop(0.72, 'rgba(255,255,255,0.65)')
  g1.addColorStop(0.82, 'rgba(255,255,255,0.25)')
  g1.addColorStop(1.0, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = g1
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Inner ripple
  const g2 = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r * 0.55)
  g2.addColorStop(0.0, 'rgba(255,255,255,0.0)')
  g2.addColorStop(0.55, 'rgba(255,255,255,0.18)')
  g2.addColorStop(0.72, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = g2
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearMipMapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 2
  tex.needsUpdate = true
  return tex
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
    return makeRippleTexture(256)
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

    // Spawn rate: subtle, scales with intensity.
    const spawnsPerSec = 1.2 + intensity * 2.2
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

