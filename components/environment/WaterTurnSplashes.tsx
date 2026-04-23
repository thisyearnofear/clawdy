'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import { useGameStore } from '../../services/gameStore'
import { playSound } from '../ui/SoundManager'
import { makeRingTexture } from './waterDecalTextures'
import { getSurfaceType } from '../terrain/terrainUtils'

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

type MudSplash = {
  active: boolean
  startAt: number
  durationMs: number
  x: number
  y: number
  z: number
  scale: number
  opacity: number
}

type EntrySplash = {
  active: boolean
  startAt: number
  durationMs: number
  x: number
  y: number
  z: number
  scale: number
  kind: 'entry' | 'wake'
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
  const MUD_POOL = 8
  const ENTRY_POOL = 6
  const splashesRef = useRef<Splash[]>([])
  const meshRefs = useRef<THREE.Mesh[]>([])
  const matRefs = useRef<THREE.MeshBasicMaterial[]>([])
  const mudSplashesRef = useRef<MudSplash[]>([])
  const mudMeshRefs = useRef<THREE.Mesh[]>([])
  const entrySplashesRef = useRef<EntrySplash[]>([])
  const entryMeshRefs = useRef<THREE.Mesh[]>([])
  const entryMatRefs = useRef<THREE.MeshBasicMaterial[]>([])
  const wasInWaterRef = useRef(false)
  const lastSpawnAt = useRef(0)
  const lastSoundAt = useRef(0)
  const lastMudSoundAt = useRef(0)
  const lastEntrySoundAt = useRef(0)

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
    mudSplashesRef.current = new Array(MUD_POOL).fill(0).map(() => ({
      active: false,
      startAt: 0,
      durationMs: 350,
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
      opacity: 0,
    }))
    entrySplashesRef.current = new Array(ENTRY_POOL).fill(0).map(() => ({
      active: false,
      startAt: 0,
      durationMs: 600,
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
      kind: 'entry',
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

    // --- ENTRY/EXIT SPLASH - detect when entering or leaving water ---
    if (inWater !== wasInWaterRef.current && flood.active) {
      wasInWaterRef.current = inWater
      if (inWater && speed > 2) {
        // Entering water - big splash!
        const entryIdx = entrySplashesRef.current.findIndex(s => !s.active)
        if (entryIdx !== -1) {
          const y = flood.level + 0.05
          entrySplashesRef.current[entryIdx] = {
            active: true,
            startAt: now,
            durationMs: 500 + Math.min(speed * 30, 400),
            x: vPos.x,
            y,
            z: vPos.z,
            scale: 1.5 + Math.min(speed * 0.15, 2),
            kind: 'entry',
          }
          if (now - lastEntrySoundAt.current > 200) {
            lastEntrySoundAt.current = now
            playSound('splash')
          }
        }
      }
    }

    // --- Wake trail when moving fast in water ---
    if (inWater && speed > 10 && now - lastSpawnAt.current > 150) {
      const entryIdx = entrySplashesRef.current.findIndex(s => !s.active)
      if (entryIdx !== -1) {
        entrySplashesRef.current[entryIdx] = {
          active: true,
          startAt: now,
          durationMs: 350,
          x: vPos.x + (Math.random() - 0.5) * 0.8,
          y: flood.level + 0.03,
          z: vPos.z + (Math.random() - 0.5) * 0.8,
          scale: 0.5 + Math.min(speed * 0.05, 1),
          kind: 'wake',
        }
      }
    }

    // --- MUD SPLASH EFFECTS ---
    const surfaceType = getSurfaceType(vPos.x, vPos.z)
    const onMud = surfaceType === 'mud'
    const mudCooldownMs = 280 / perfScale
    
    if (onMud && speed > 4 && now - lastSpawnAt.current > mudCooldownMs) {
      lastSpawnAt.current = now
      
      const mudIdx = mudSplashesRef.current.findIndex(s => !s.active)
      if (mudIdx !== -1) {
        const terrainHeight = 0 // Approximate ground level
        mudSplashesRef.current[mudIdx] = {
          active: true,
          startAt: now,
          durationMs: 350,
          x: vPos.x + (Math.random() - 0.5) * 1.2,
          y: terrainHeight + 0.05,
          z: vPos.z + (Math.random() - 0.5) * 1.2,
          scale: 0.8 + Math.min(1.5, speed * 0.05),
          opacity: 0.45,
        }
        
        // Mud splatter sound (cooldown)
        if (now - lastMudSoundAt.current > 180) {
          lastMudSoundAt.current = now
          playSound('splash') // Reuse splash sound for now
        }
      }
    }

    // Update water splashes
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

    // Update mud splashes
    for (let i = 0; i < MUD_POOL; i++) {
      const mud = mudSplashesRef.current[i]
      const mesh = mudMeshRefs.current[i]
      if (!mesh) continue

      if (!mud.active) {
        mesh.visible = false
        continue
      }
      const t = (now - mud.startAt) / mud.durationMs
      if (t >= 1) {
        mud.active = false
        mesh.visible = false
        continue
      }

      const opacity = (1 - t) * mud.opacity
      const scale = mud.scale * t

      mesh.visible = true
      mesh.position.set(mud.x, mud.y, mud.z)
      mesh.scale.set(scale, scale, 1)
      ;(mesh.material as THREE.MeshStandardMaterial).opacity = opacity
    }

    // Update entry/wake splashes
    for (let i = 0; i < ENTRY_POOL; i++) {
      const splash = entrySplashesRef.current[i]
      const mesh = entryMeshRefs.current[i]
      const mat = entryMatRefs.current[i]
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
      const isEntry = splash.kind === 'entry'
      const r = splash.scale * (isEntry ? ease * 1.5 : ease)
      const opacity = isEntry ? (1 - t) * 0.35 : (1 - t) * 0.2

      mesh.visible = true
      mesh.position.set(splash.x, splash.y, splash.z)
      mesh.scale.set(r, r, 1)
      mat.opacity = opacity
      mat.color.set(isEntry ? new THREE.Color(0.9, 0.95, 1.0) : new THREE.Color(0.7, 0.85, 1.0))
    }
  })

  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1, 1, 1), [])
  const mudPlane = useMemo(() => new THREE.CircleGeometry(1, 8), [])
  // Pre-defined rotations to avoid impure Math.random() during render
  const mudRotations = [0.31, 1.89, 2.54, 4.02, 5.18, 0.97, 3.45, 4.76]

  if (!enabled || !texture) return null

  return (
    <>
      {/* Water splashes */}
      <group>
        {new Array(POOL).fill(0).map((_, i) => (
          <mesh
            key={`water-${i}`}
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

      {/* Mud splatters */}
      <group>
        {new Array(MUD_POOL).fill(0).map((_, i) => (
          <mesh
            key={`mud-${i}`}
            ref={(m) => { if (m) mudMeshRefs.current[i] = m }}
            geometry={mudPlane}
            frustumCulled={false}
            visible={false}
            rotation={[-Math.PI / 2, 0, mudRotations[i]]}
            renderOrder={3}
          >
            <meshStandardMaterial
              color={new THREE.Color(0.35, 0.22, 0.1)}
              transparent
              opacity={0}
              depthWrite={false}
              roughness={1}
            />
          </mesh>
        ))}
      </group>

      {/* Entry/wake splashes */}
      <group>
        {new Array(ENTRY_POOL).fill(0).map((_, i) => (
          <mesh
            key={`entry-${i}`}
            ref={(m) => { if (m) entryMeshRefs.current[i] = m }}
            geometry={plane}
            frustumCulled={false}
            visible={false}
            renderOrder={4}
          >
            <meshBasicMaterial
              ref={(m) => { if (m) entryMatRefs.current[i] = m }}
              map={texture}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              color={new THREE.Color(0.9, 0.95, 1.0)}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </>
  )
}
