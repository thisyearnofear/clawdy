'use client'

import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../../services/gameStore'

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function WeatherGradeOverlay() {
  const preset = useGameStore(s => s.cloudConfig.preset) || 'custom'
  const activeWeatherEffects = useGameStore(s => s.activeWeatherEffects)

  const lightning = activeWeatherEffects.lightning?.intensity ?? 0
  const dayNight = activeWeatherEffects.dayNight?.intensity ?? 0

  // Target grade intensity by preset (0..1)
  const target = useMemo(() => {
    switch (preset) {
      case 'stormy':
        return 1
      case 'cosmic':
        return 0.75
      case 'candy':
        return 0.55
      case 'sunset':
        return 0.5
      default:
        return 0.2
    }
  }, [preset])

  const [grade, setGrade] = useState(() => target)

  // Smooth ramp (avoids harsh switching when preset changes)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      // Faster ramp when storms/lighting are active
      const speed = 4 + lightning * 4
      setGrade(prev => lerp(prev, target, clamp01(dt * speed)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, lightning])

  const vignetteOpacity = clamp01(0.35 + grade * 0.35 + dayNight * 0.25)

  // Per-preset tint overlays (inspired by the rain puddle demo's grading layers).
  const tint = useMemo(() => {
    if (preset === 'stormy') return { bottom: 'rgba(0, 80, 255, 0.20)', top: 'rgba(0,0,0,0.00)' }
    if (preset === 'sunset') return { bottom: 'rgba(0, 0, 255, 0.08)', top: 'rgba(255, 200, 120, 0.20)' }
    if (preset === 'candy') return { bottom: 'rgba(255, 0, 200, 0.10)', top: 'rgba(255, 240, 250, 0.12)' }
    if (preset === 'cosmic') return { bottom: 'rgba(120, 0, 255, 0.14)', top: 'rgba(20, 0, 40, 0.18)' }
    return { bottom: 'rgba(0, 0, 255, 0.05)', top: 'rgba(255, 222, 165, 0.05)' }
  }, [preset])

  const tintOpacity = clamp01(grade * 0.9)

  return (
    <>
      {/* Vignette */}
      <div
        className="fixed inset-0 z-[70] pointer-events-none"
        style={{
          opacity: vignetteOpacity,
          background:
            'radial-gradient(circle at center, rgba(0, 0, 0, 0) 52%, rgba(0, 0, 0, 1) 115%)',
        }}
      />

      {/* Bottom tint */}
      <div
        className="fixed inset-0 z-[71] pointer-events-none"
        style={{
          opacity: tintOpacity,
          background: `linear-gradient(to bottom, rgba(0,0,0,0) 50%, ${tint.bottom} 100%)`,
          mixBlendMode: 'overlay',
        }}
      />

      {/* Top tint */}
      <div
        className="fixed inset-0 z-[71] pointer-events-none"
        style={{
          opacity: tintOpacity,
          background: `linear-gradient(to top, rgba(0,0,0,0) 45%, ${tint.top} 100%)`,
          mixBlendMode: 'overlay',
        }}
      />
    </>
  )
}

