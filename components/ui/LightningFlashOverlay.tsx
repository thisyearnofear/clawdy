'use client'

import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../services/gameStore'
import { playSound } from './SoundManager'

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

export function LightningFlashOverlay() {
  const lightning = useGameStore(s => s.activeWeatherEffects.lightning)
  const triggerCameraShake = useGameStore(s => s.triggerCameraShake)
  const [flash, setFlash] = useState(0)
  const timeoutRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  const intensity = clamp01(lightning?.intensity ?? 0)
  const enabled = intensity > 0.2

  useEffect(() => {
    if (!enabled) {
      setFlash(0)
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      timeoutRef.current = null
      rafRef.current = null
      return
    }

    let cancelled = false

    const schedule = () => {
      if (cancelled) return

      // Higher intensity = more frequent lightning.
      const min = 2600 - intensity * 1200
      const max = 7200 - intensity * 2800
      const wait = Math.max(800, Math.floor(min + Math.random() * (max - min)))

      timeoutRef.current = window.setTimeout(() => {
        if (cancelled) return

        // Flash sequence: 1-3 pulses.
        const pulses = 1 + (Math.random() < intensity ? 2 : 0)
        let pulseIndex = 0

        const pulse = () => {
          if (cancelled) return
          pulseIndex++

          // Flash up quickly
          const peak = 0.35 + intensity * 0.55
          setFlash(peak)
          triggerCameraShake(0.55 + intensity * 0.55, 220)

          // Occasional thunder stinger (not every flash)
          if (Math.random() < 0.55 + intensity * 0.25) {
            // "Speed of sound" illusion: distant thunder arrives later.
            const distance = Math.random() // 0 close, 1 distant
            const delayMs = distance > 0.6
              ? 450 + Math.random() * 900
              : 80 + Math.random() * 220
            window.setTimeout(() => {
              if (!cancelled) playSound('thunder')
            }, delayMs)
          }

          // Decay
          const start = performance.now()
          const decay = (t: number) => {
            const dt = (t - start) / 1000
            const v = peak * Math.exp(-dt * 10)
            setFlash(v)
            if (dt < 0.35) {
              rafRef.current = requestAnimationFrame(decay)
            } else {
              setFlash(0)
              if (pulseIndex < pulses) {
                window.setTimeout(pulse, 120 + Math.random() * 140)
              } else {
                schedule()
              }
            }
          }
          rafRef.current = requestAnimationFrame(decay)
        }

        pulse()
      }, wait)
    }

    schedule()

    return () => {
      cancelled = true
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      timeoutRef.current = null
      rafRef.current = null
    }
  }, [enabled, intensity, triggerCameraShake])

  if (!enabled || flash <= 0.001) return null

  return (
    <div
      className="fixed inset-0 z-[85] pointer-events-none"
      style={{
        opacity: flash,
        background: 'radial-gradient(circle at 30% 20%, rgba(180, 210, 255, 0.95) 0%, rgba(120, 160, 255, 0.35) 35%, rgba(0,0,0,0) 70%)',
        mixBlendMode: 'screen',
      }}
    />
  )
}
