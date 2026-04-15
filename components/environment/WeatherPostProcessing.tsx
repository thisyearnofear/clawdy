'use client'

import { useMemo } from 'react'
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import type { CloudConfig } from './CloudManager'

export function WeatherPostProcessing({ config }: { config: CloudConfig }) {
  const preset = config.preset || 'custom'

  const settings = useMemo(() => {
    switch (preset) {
      case 'stormy':
        return {
          bloomIntensity: 0.6,
          bloomThreshold: 0.7,
          bloomRadius: 0.8,
          vignetteOffset: 0.3,
          vignetteDarkness: 0.7,
          chromaticOffset: new THREE.Vector2(0.003, 0.003),
        }
      case 'sunset':
        return {
          bloomIntensity: 1.2,
          bloomThreshold: 0.4,
          bloomRadius: 1.0,
          vignetteOffset: 0.2,
          vignetteDarkness: 0.4,
          chromaticOffset: new THREE.Vector2(0.001, 0.001),
        }
      case 'candy':
        return {
          bloomIntensity: 0.9,
          bloomThreshold: 0.5,
          bloomRadius: 0.9,
          vignetteOffset: 0.15,
          vignetteDarkness: 0.3,
          chromaticOffset: new THREE.Vector2(0.002, 0.002),
        }
      default:
        return {
          bloomIntensity: 0.3,
          bloomThreshold: 0.8,
          bloomRadius: 0.6,
          vignetteOffset: 0.1,
          vignetteDarkness: 0.2,
          chromaticOffset: new THREE.Vector2(0.0005, 0.0005),
        }
    }
  }, [preset])

  return (
    <EffectComposer>
      <Bloom
        intensity={settings.bloomIntensity}
        luminanceThreshold={settings.bloomThreshold}
        luminanceSmoothing={0.9}
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
