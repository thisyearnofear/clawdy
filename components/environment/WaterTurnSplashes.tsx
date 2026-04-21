'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import { useGameStore } from '../../services/gameStore'
import { playSound } from '../ui/SoundManager'
import { makeRingTexture } from './waterDecalTextures'

type Splash = {
  active: boolean
  startAt: number
  durationMs: number
  x: number
  y: number
  z: number
  rotation: number
  maxRadius: number
  kind: 'ring' | 'foam'
}

export function WaterTurnSplashes({
  chassisRef,
  enabled,
  turnInput,
  brake,
}: {
  chassisRef: React.RefObject<RapierRigidBody | null>
  enabled: boolean
  turnInput: number
  brake: boolean
}) {
  const flood = useGameStore(s => s.flood)
  const texture = useMemo(() => (typeof document === 'undefined' ? null : makeRingTexture(256)), [])

  const POOL = 10
  const splashesRef = useRef<Splash[]>([])
  const meshRefs = useRef<THREE.Mesh[]>([])
  const matRefs = useRef<THREE.MeshBasicMaterial[]>([])
  const lastSpawnAt = useRef(0)
  const lastSoundAt = useRef(0)

  useEffect(() => {
    splashesRef.current = new Array(POOL).fill(0).map(() => ({
      active: false,
      startAt: 0,
      durationMs: 420,
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      maxRadius: 2.0,
      kind: 'ring',
    }))
  }, [])

  useFrame((_, delta) => {
    if (!enabled || !texture || !chassisRef.current) return

    const vPos = chassisRef.current.translation()
    const vVel = chassisRef.current.linvel()
    const speed = Math.sqrt(vVel.x * vVel.x + vVel.z * vVel.z)
    // Perf scaling (reduce effect spam on low FPS)
    const perfScale = THREE.MathUtils.clamp(0.5, 1, 0.033 / Math.max(0.001, delta))

    const submergeDepth = flood.active
      ? THREE.MathUtils.clamp((flood.level - (vPos.y - 0.35)) / 1.0, 0, 1)
      : 0

    const inWater = submergeDepth > 0.15 && flood.intensity > 0.2
    const hardTurn = Math.abs(turnInput) > 0.65
    const isDrifting = hardTurn && brake

    // Spawn conditions: in water + hard turn + some speed, with cooldown.
    const now = performance.now()
    const cooldownMs = 220 / perfScale
    if (inWater && hardTurn && speed > 6 && now - lastSpawnAt.current > cooldownMs) {
      lastSpawnAt.current = now
      // Place on water surface for readability
      const y = flood.level + 0.02

      const spawnOne = (kind: Splash['kind']) => {
        const idx = splashesRef.current.findIndex(s => !s.active)
        if (idx === -1) return
        splashesRef.current[idx] = {
          active: true,
          startAt: now,
          durationMs: kind === 'foam' ? (220 + flood.intensity * 140) : (360 + flood.intensity * 180),
          x: vPos.x + (Math.random() - 0.5) * 1.6,
          y,
          z: vPos.z + (Math.random() - 0.5) * 1.6,
          rotation: Math.random() * Math.PI * 2,
          maxRadius:
            kind === 'foam'
              ? (0.9 + Math.min(1.8, speed * 0.04) + flood.intensity * 0.7)
              : (1.4 + Math.min(2.4, speed * 0.06) + flood.intensity * 0.8),
          kind,
        }
      }

      spawnOne('ring')
      if (isDrifting && perfScale > 0.7) spawnOne('foam')

      // Splash audio (cooldown to avoid spam)
      if (now - lastSoundAt.current > 140) {
        lastSoundAt.current = now
        playSound('splash')
      }
    }

    // Update
    for (let i = 0; i < POOL; i++) {
      const splash = splashesRef.current[i]
      const mesh = meshRefs.current[i]
      const mat = matRefs.current[i]
      if (!mesh || !mat) continue

      if (!splash.active) {
        mesh.visible = false
        continue
      }
      const t = (now - splash.startAt) / splash.durationMs
      if (t >= 1) {
        splash.active = false
        mesh.visible = false
        continue
      }

      const ease = 1 - Math.pow(1 - t, 2)
      const r = splash.maxRadius * ease
      const opacityBase = splash.kind === 'foam' ? 0.28 : 0.18
      const opacity = (1 - t) * (opacityBase + flood.intensity * 0.18)

      mesh.visible = true
      mesh.position.set(splash.x, splash.y, splash.z)
      mesh.rotation.set(-Math.PI / 2, 0, splash.rotation)
      mesh.scale.set(r, r, 1)
      mat.opacity = opacity
      mat.color.set(splash.kind === 'foam' ? new THREE.Color(0.92, 0.98, 1.0) : new THREE.Color(0.85, 0.93, 1.0))
    }
  })

  if (!enabled || !texture) return null
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1, 1, 1), [])

  return (
    <group>
      {new Array(POOL).fill(0).map((_, i) => (
        <mesh
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          ref={(m) => { if (m) meshRefs.current[i] = m }}
          geometry={plane}
          frustumCulled={false}
          visible={false}
          renderOrder={4}
        >
          <meshBasicMaterial
            ref={(m) => { if (m) matRefs.current[i] = m }}
            map={texture}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            color={new THREE.Color(0.85, 0.93, 1.0)}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
