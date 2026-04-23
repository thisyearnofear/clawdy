'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../../services/gameStore'
import { makeRingTexture } from './waterDecalTextures'

export function FloodWater({ bounds }: { bounds: [number, number, number] }) {
  const preset = useGameStore(s => s.cloudConfig.preset) || 'custom'
  const lightning = useGameStore(s => s.activeWeatherEffects.lightning?.intensity ?? 0)
  const round = useGameStore(s => s.round)
  const setFlood = useGameStore(s => s.setFlood)
  const floodControl = useGameStore(s => s.floodControl)

  const meshRef = useRef<THREE.Mesh>(null)
  const drainMeshRef = useRef<THREE.Mesh>(null)
  const drainMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const levelRef = useRef(-2) // current water level
  const phaseRef = useRef<'idle' | 'rising' | 'peak' | 'draining'>('idle')
  const peakUntilRef = useRef(0)
  const lastPublishRef = useRef<{
    active: boolean
    intensity: number
    level: number
    phase: 'idle' | 'rising' | 'peak' | 'draining'
  }>({ active: false, intensity: 0, level: -2, phase: 'idle' })

  const drainTexture = useMemo(() => {
    if (typeof document === 'undefined') return null
    return makeRingTexture(256)
  }, [])

  const drainGeo = useMemo(() => new THREE.PlaneGeometry(1, 1, 1, 1), [])

  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.0 },
        uColorDeep: { value: new THREE.Color('#0b2a4a') },
        uColorShallow: { value: new THREE.Color('#2ea7d8') },
        uFoam: { value: 0.0 },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        varying vec3 vNormal;
        varying float vWaveHeight;
        varying vec3 vWorldPos;
        uniform float uTime;

        void main() {
          vUv = uv;
          vec3 p = position;
          
          // Gerstner-style wave displacement with increased amplitude
          float w1 = sin((p.x * 0.12) + uTime * 0.9) * 0.25;
          float w2 = sin((p.z * 0.18) - uTime * 1.1) * 0.20;
          float w3 = sin((p.x * 0.25 + p.z * 0.15) + uTime * 1.4) * 0.12;
          float w4 = sin((p.x * 0.08 - p.z * 0.22) + uTime * 0.6) * 0.15;
          // Add Gerstner-style sharp crest
          float w5 = sin((p.x * 0.05 + p.z * 0.07) + uTime * 0.5) * 0.08;
          p.y += w1 + w2 + w3 + w4 + w5;
          vWaveHeight = w1 + w2 + w3 + w4 + w5;
          
          // Calculate wave normal for lighting
          float dx = 0.12 * cos((p.x * 0.12) + uTime * 0.9) * 0.25 
                   + 0.25 * cos((p.x * 0.25 + p.z * 0.15) + uTime * 1.4) * 0.12
                   + 0.08 * cos((p.x * 0.05 + p.z * 0.07) + uTime * 0.5) * 0.08;
          float dz = -0.18 * cos((p.z * 0.18) - uTime * 1.1) * 0.20 
                    + 0.15 * cos((p.x * 0.25 + p.z * 0.15) + uTime * 1.4) * 0.12
                    - 0.22 * cos((p.x * 0.08 - p.z * 0.22) + uTime * 0.6) * 0.15
                    + 0.07 * cos((p.x * 0.05 + p.z * 0.07) + uTime * 0.5) * 0.08;
          vNormal = normalize(vec3(-dx, 1.0, -dz));
          
          vec4 worldPos = modelMatrix * vec4(p, 1.0);
          vWorldPos = worldPos.xyz;
          vPos = p;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        varying vec3 vNormal;
        varying float vWaveHeight;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColorDeep;
        uniform vec3 uColorShallow;
        uniform float uFoam;
        uniform vec3 uCameraPos;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        // Simplex-like noise for caustics
        float caustics(vec2 uv, float time) {
          float n1 = noise(uv * 8.0 + vec2(time * 0.15, -time * 0.1));
          float n2 = noise(uv * 12.0 - vec2(time * 0.2, time * 0.18));
          float n3 = noise(uv * 6.0 + vec2(-time * 0.08, time * 0.12));
          return (n1 * 0.5 + n2 * 0.3 + n3 * 0.2);
        }

        void main() {
          // Moving surface pattern
          vec2 uv = vUv;
          vec2 p = uv * vec2(6.0, 6.0);
          float n = noise(p + vec2(uTime * 0.08, -uTime * 0.06));
          float n2 = noise(p * 1.8 + vec2(-uTime * 0.12, uTime * 0.10));
          float waves = (n * 0.6 + n2 * 0.4);

          // Depth-ish gradient (purely aesthetic)
          float depth = clamp(uv.y, 0.0, 1.0);
          vec3 col = mix(uColorShallow, uColorDeep, depth);
          
          // Add caustics effect when water is visible
          float causticsIntensity = caustics(uv, uTime) * 0.15;
          col += vec3(causticsIntensity * 0.8, causticsIntensity * 0.9, causticsIntensity);
          
          // Add subtle specular highlight from wave normals
          vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
          float specular = pow(max(dot(vNormal, lightDir), 0.0), 32.0) * 0.4;
          col += vec3(specular);
          
          // Add ripple shimmer
          col += waves * 0.10;
          col += vWaveHeight * 0.15;

          // Foam near edges
          float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
          float foam = smoothstep(0.12, 0.0, edge) * (0.45 + waves * 0.25) * uFoam;
          col = mix(col, vec3(0.85, 0.92, 1.0), foam);

          // Fresnel-based opacity: more opaque at glancing angles, transparent when looking down
          vec3 viewDir = normalize(uCameraPos - vWorldPos);
          float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
          float finalOpacity = mix(0.25, 0.75, fresnel) * uOpacity;

          gl_FragColor = vec4(col, finalOpacity);
        }
      `,
    })
    return mat
  }, [])

  const geometry = useMemo(() => {
    // Large plane spanning the play area
    const w = bounds[0] * 1.05
    const h = bounds[2] * 1.05
    return new THREE.PlaneGeometry(w, h, 64, 64)
  }, [bounds])

  useEffect(() => {
    if (!meshRef.current) return
    meshRef.current.rotation.x = -Math.PI / 2
    meshRef.current.renderOrder = 3
  }, [])

  useFrame((state) => {
    // eslint-disable-next-line react-hooks/immutability
    material.uniforms.uTime.value = state.clock.getElapsedTime()
    material.uniforms.uCameraPos.value.copy(state.camera.position)

    // Trigger recommendation:
    // - Flood is a "quirky differentiator", but shouldn’t be constant.
    // - We make it appear when storms are strong, and get punchier in Final Rush.
    const stormIntensity =
      preset === 'stormy'
        ? Math.max(0.4, Math.min(1, 0.65 + lightning * 0.5))
        : Math.max(0, Math.min(1, (lightning - 0.35) * 1.6))

    const remainingSec = Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000))
    const finalRushBoost = round.isActive && remainingSec > 0 && remainingSec <= 10 ? 1 : 0

    // Drain plug control (decays over time)
    const nowMs = Date.now()
    const drainActive = nowMs < floodControl.drainUntil
    const drainT = drainActive
      ? Math.max(0, Math.min(1, (nowMs - floodControl.drainStartedAt) / Math.max(1, (floodControl.drainUntil - floodControl.drainStartedAt))))
      : 1
    const drainStrength = drainActive ? floodControl.drainStrength * (1 - drainT) : 0

    // Beat-based pacing: rise → peak → drain (with hysteresis)
    const riseOn = stormIntensity > 0.22
    const keepOn = stormIntensity > 0.12
    const now = performance.now()

    if (phaseRef.current === 'idle') {
      if (riseOn) {
        phaseRef.current = 'rising'
        peakUntilRef.current = 0
      }
    } else if (phaseRef.current === 'rising') {
      // Reach peak when close to target
      if (!keepOn) phaseRef.current = 'draining'
      if (levelRef.current > 0.25) {
        phaseRef.current = 'peak'
        // Hold peak a bit so it feels intentional; longer during Final Rush.
        peakUntilRef.current = now + (finalRushBoost ? 8000 : 5500)
      }
    } else if (phaseRef.current === 'peak') {
      if (now >= peakUntilRef.current && !keepOn) phaseRef.current = 'draining'
      // If storm stays strong, refresh peak hold slightly.
      if (stormIntensity > 0.55) peakUntilRef.current = Math.max(peakUntilRef.current, now + 2500)
    } else if (phaseRef.current === 'draining') {
      if (riseOn) phaseRef.current = 'rising'
      // Don't snap back too early; let it fully drain.
      if (levelRef.current < -1.95) phaseRef.current = 'idle'
    }

    // Drain plug forces draining (even if storm continues)
    if (drainStrength > 0.02 && phaseRef.current !== 'idle') {
      phaseRef.current = 'draining'
    }

    const targetVisible = phaseRef.current !== 'idle'
    const baseTargetLevel = -0.95 + stormIntensity * 1.55
    const peakTargetLevel = 0.55 + stormIntensity * 0.85 + finalRushBoost * 0.25
    const drainTargetLevel = -2

    const targetLevel =
      phaseRef.current === 'rising'
        ? baseTargetLevel
        : phaseRef.current === 'peak'
          ? peakTargetLevel
          : phaseRef.current === 'draining'
            ? (drainTargetLevel - drainStrength * 0.8)
            : drainTargetLevel

    const lerpSpeed =
      phaseRef.current === 'rising'
        ? 0.03 + stormIntensity * 0.04 + finalRushBoost * 0.03
        : phaseRef.current === 'peak'
          ? 0.02
          : 0.02 + stormIntensity * 0.015

    levelRef.current = THREE.MathUtils.lerp(levelRef.current, targetLevel, lerpSpeed)

    // Opacity + foam ramp
    // While draining (esp. due to plug), fade faster to "normal".
    const drainFade = phaseRef.current === 'draining' ? (0.85 - drainStrength * 0.35) : 1
    const targetOpacity = targetVisible ? (0.06 + stormIntensity * 0.26 + finalRushBoost * 0.04) * drainFade : 0
    material.uniforms.uOpacity.value = THREE.MathUtils.lerp(material.uniforms.uOpacity.value, targetOpacity, 0.05)
    material.uniforms.uFoam.value = THREE.MathUtils.lerp(material.uniforms.uFoam.value, stormIntensity * drainFade, 0.04)

    if (meshRef.current) {
      meshRef.current.position.y = levelRef.current
      meshRef.current.visible = material.uniforms.uOpacity.value > 0.01
    }

    // Drain swirl decal: localized visual telegraph when Drain Plug triggers.
    if (drainMeshRef.current && drainMatRef.current) {
      const drainAgeMs = Date.now() - floodControl.drainStartedAt
      const show = floodControl.drainStartedAt > 0 && drainAgeMs >= 0 && drainAgeMs < 1400
      if (!show || !drainTexture) {
        drainMeshRef.current.visible = false
      } else {
        const t = THREE.MathUtils.clamp(drainAgeMs / 1400, 0, 1)
        const ease = 1 - Math.pow(1 - t, 2)
        const radius = 2.0 + ease * 9.0
        const opacity = (1 - t) * (0.35 + floodControl.drainStrength * 0.35)

        drainMeshRef.current.visible = true
        drainMeshRef.current.position.set(floodControl.drainCenter[0], levelRef.current + 0.03, floodControl.drainCenter[2])
        drainMeshRef.current.rotation.set(-Math.PI / 2, 0, state.clock.getElapsedTime() * 1.4)
        drainMeshRef.current.scale.set(radius, radius, 1)
        drainMatRef.current.opacity = opacity
      }
    }

    // Store update (lightweight; only when meaningful values change)
    const active = targetVisible
    const intensity = stormIntensity
    const level = levelRef.current
    const phase = phaseRef.current

    const prev = lastPublishRef.current
    const phaseChanged = prev.phase !== phase
    const shouldPublish =
      phaseChanged ||
      prev.active !== active ||
      Math.abs(prev.intensity - intensity) > 0.03 ||
      Math.abs(prev.level - level) > 0.08

    if (shouldPublish) {
      lastPublishRef.current = { active, intensity, level, phase }
      const update: Partial<{
        active: boolean
        intensity: number
        level: number
        phase: 'idle' | 'rising' | 'peak' | 'draining'
        phaseChangedAt: number
      }> = {
        active,
        intensity,
        level,
        phase,
      }
      if (phaseChanged) update.phaseChangedAt = Date.now()
      setFlood(update)
    }
  })

  return (
    <>
      <mesh ref={meshRef} geometry={geometry} material={material} />
      {/* Localized drain swirl decal */}
      {drainTexture && (
        <mesh ref={drainMeshRef} geometry={drainGeo} frustumCulled={false} visible={false} renderOrder={4}>
          <meshBasicMaterial
            ref={drainMatRef}
            map={drainTexture}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            color={new THREE.Color(0.9, 0.95, 1.0)}
            toneMapped={false}
          />
        </mesh>
      )}
    </>
  )
}
