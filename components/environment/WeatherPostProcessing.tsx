'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import type { CloudConfig } from './CloudManager'
import { useGameStore } from '../../services/gameStore'

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function WeatherPostProcessing({ config }: { config: CloudConfig }) {
  const preset = config.preset || 'custom'
  const flood = useGameStore(s => s.flood)
  const playerWater = useGameStore(s => s.playerWater)

  const target = useMemo(() => {
    // Base values from preset
    let base
    switch (preset) {
      case 'stormy':
        base = {
          bloomIntensity: 0.6,
          bloomThreshold: 0.7,
          bloomRadius: 0.8,
          vignetteOffset: 0.3,
          vignetteDarkness: 0.7,
          chromaticOffset: new THREE.Vector2(0.003, 0.003),
        }
        break
      case 'sunset':
        base = {
          bloomIntensity: 1.2,
          bloomThreshold: 0.4,
          bloomRadius: 1.0,
          vignetteOffset: 0.2,
          vignetteDarkness: 0.4,
          chromaticOffset: new THREE.Vector2(0.001, 0.001),
        }
        break
      case 'candy':
        base = {
          bloomIntensity: 0.9,
          bloomThreshold: 0.5,
          bloomRadius: 0.9,
          vignetteOffset: 0.15,
          vignetteDarkness: 0.3,
          chromaticOffset: new THREE.Vector2(0.002, 0.002),
        }
        break
      default:
        base = {
          bloomIntensity: 0.3,
          bloomThreshold: 0.8,
          bloomRadius: 0.6,
          vignetteOffset: 0.1,
          vignetteDarkness: 0.2,
          chromaticOffset: new THREE.Vector2(0.0005, 0.0005),
        }
    }

    // Flood-aware adjustments: blue vignette, chromatic aberration, bloom
    if (flood.active && flood.intensity > 0.15) {
      const fi = flood.intensity
      const submergedBoost = playerWater.inWater ? playerWater.depth * 0.3 : 0
      base.vignetteDarkness = Math.min(0.85, base.vignetteDarkness + fi * 0.2 + submergedBoost * 0.15)
      base.chromaticOffset = new THREE.Vector2(
        Math.min(0.006, base.chromaticOffset.x + fi * 0.002 + submergedBoost * 0.001),
        Math.min(0.006, base.chromaticOffset.y + fi * 0.002 + submergedBoost * 0.001),
      )
      base.bloomIntensity += fi * 0.2
    }

    return base
  }, [preset, flood.active, flood.intensity, playerWater.inWater, playerWater.depth])

  const [settings, setSettings] = useState(() => target)
  const lastRef = useRef(0)

  useEffect(() => {
    lastRef.current = performance.now()
  }, [])

  // Smoothly blend effect parameters to avoid hard cuts between presets.
  useEffect(() => {
    let raf = 0
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - lastRef.current) / 1000)
      lastRef.current = t
      const speed = preset === 'stormy' ? 4.5 : 3.0
      const k = Math.min(1, dt * speed)
      setSettings(prev => ({
        bloomIntensity: lerp(prev.bloomIntensity, target.bloomIntensity, k),
        bloomThreshold: lerp(prev.bloomThreshold, target.bloomThreshold, k),
        bloomRadius: lerp(prev.bloomRadius, target.bloomRadius, k),
        vignetteOffset: lerp(prev.vignetteOffset, target.vignetteOffset, k),
        vignetteDarkness: lerp(prev.vignetteDarkness, target.vignetteDarkness, k),
        chromaticOffset: new THREE.Vector2(
          lerp(prev.chromaticOffset.x, target.chromaticOffset.x, k),
          lerp(prev.chromaticOffset.y, target.chromaticOffset.y, k)
        ),
      }))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [preset, target])

  return (
    <EffectComposer>
      <Bloom
        intensity={settings.bloomIntensity}
        luminanceThreshold={settings.bloomThreshold}
        luminanceSmoothing={0.3}
        radius={settings.bloomRadius}
        blendFunction={BlendFunction.ADD}
      />
      <Vignette
        offset={settings.vignetteOffset}
        darkness={settings.vignetteDarkness}
        blendFunction={BlendFunction.NORMAL}
      />
      <ChromaticAberration
        offset={settings.chromaticOffset}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0.5}
      />
    </EffectComposer>
  )
}
