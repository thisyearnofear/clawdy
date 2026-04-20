'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../../services/gameStore'

export function FloodWater({ bounds }: { bounds: [number, number, number] }) {
  const preset = useGameStore(s => s.cloudConfig.preset) || 'custom'
  const lightning = useGameStore(s => s.activeWeatherEffects.lightning?.intensity ?? 0)
  const round = useGameStore(s => s.round)

  const meshRef = useRef<THREE.Mesh>(null)
  const levelRef = useRef(-2) // current water level

  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.0 },
        uColorDeep: { value: new THREE.Color('#0b2a4a') },
        uColorShallow: { value: new THREE.Color('#2ea7d8') },
        uFoam: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        uniform float uTime;

        void main() {
          vUv = uv;
          vec3 p = position;
          // Tiny wave displacement (cheap; enough for shimmer)
          float w1 = sin((p.x * 0.12) + uTime * 0.9) * 0.06;
          float w2 = sin((p.z * 0.18) - uTime * 1.1) * 0.05;
          p.y += w1 + w2;
          vPos = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColorDeep;
        uniform vec3 uColorShallow;
        uniform float uFoam;

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
          col += waves * 0.10;

          // Foam near edges
          float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
          float foam = smoothstep(0.12, 0.0, edge) * (0.45 + waves * 0.25) * uFoam;
          col = mix(col, vec3(0.85, 0.92, 1.0), foam);

          gl_FragColor = vec4(col, uOpacity);
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

  useFrame((state, delta) => {
    material.uniforms.uTime.value = state.clock.getElapsedTime()

    // Trigger recommendation:
    // - Flood is a "quirky differentiator", but shouldn’t be constant.
    // - We make it appear when storms are strong, and get punchier in Final Rush.
    const stormIntensity =
      preset === 'stormy'
        ? Math.max(0.4, Math.min(1, 0.65 + lightning * 0.5))
        : Math.max(0, Math.min(1, (lightning - 0.35) * 1.6))

    const remainingSec = Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000))
    const finalRushBoost = round.isActive && remainingSec > 0 && remainingSec <= 10 ? 1 : 0

    const targetVisible = stormIntensity > 0.05
    const targetLevel = targetVisible ? (-0.8 + stormIntensity * 1.35 + finalRushBoost * 0.25) : -2
    levelRef.current = THREE.MathUtils.lerp(levelRef.current, targetLevel, 0.02 + stormIntensity * 0.03)

    // Opacity + foam ramp
    const targetOpacity = targetVisible ? (0.08 + stormIntensity * 0.22) : 0
    material.uniforms.uOpacity.value = THREE.MathUtils.lerp(material.uniforms.uOpacity.value, targetOpacity, 0.05)
    material.uniforms.uFoam.value = THREE.MathUtils.lerp(material.uniforms.uFoam.value, stormIntensity, 0.04)

    if (meshRef.current) {
      meshRef.current.position.y = levelRef.current
      meshRef.current.visible = material.uniforms.uOpacity.value > 0.01
    }
  })

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  )
}

