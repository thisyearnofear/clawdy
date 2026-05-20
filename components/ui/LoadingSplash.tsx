'use client'

import { useState, useEffect } from 'react'
import { getLoadingSplashDurationMs } from '../../services/runtimeConfig'

const TIPS = [
  'Chain pickups within 6s for combo multipliers',
  'Win the weather auction to control the arena',
  'Golden meatballs are worth 5× — chase them',
  'The AI has blind spots — exploit them',
  'Storms create mud traps — avoid or weaponize them',
  'ESC opens the control panel for abilities and tuning',
]

const DEFAULT_TIP = TIPS[0]

export function LoadingSplash({
  ready = true,
  status = 'Preparing your vehicle',
  onReady,
}: {
  ready?: boolean
  status?: string
  onReady?: () => void
}) {
  const [progress, setProgress] = useState(0)
  const [tip, setTip] = useState(DEFAULT_TIP)
  const [fadeOut, setFadeOut] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    setTip(TIPS[Math.floor(Math.random() * TIPS.length)] ?? DEFAULT_TIP)
  }, [])

  useEffect(() => {
    if (fadeOut) return
    const start = Date.now()
    const duration = getLoadingSplashDurationMs()
    const maxWaitMs = Math.max(3500, duration + 2500)

    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const readinessReached = ready || elapsed >= maxWaitMs
      if (elapsed >= maxWaitMs) setTimedOut(true)

      const targetProgress = readinessReached
        ? 100
        : Math.min(92, (elapsed / duration) * 92)

      setProgress(targetProgress)
      if (targetProgress >= 100) {
        clearInterval(interval)
        setFadeOut(true)
        setTimeout(() => onReady?.(), 400)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [fadeOut, onReady, ready])

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950 transition-opacity duration-400 ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Logo / Title */}
      <div className="flex flex-col items-center gap-3 mb-12">
        <span className="text-6xl">☁️</span>
        <h1 className="text-4xl font-black text-white tracking-tight">CLAWDY</h1>
        <p className="text-sm text-white/40 font-medium">Outsmart the AI in a Marble-generated world</p>
      </div>

      {/* Progress bar */}
      <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-sky-400 rounded-full transition-all duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Tip */}
      <p className="text-xs text-white/30 max-w-xs text-center">
        💡 {tip}
      </p>
      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.24em] text-sky-300/60">
        {timedOut ? 'Starting fallback arena' : status}
      </p>

      {/* Tech credits */}
      <div className="absolute bottom-8 flex items-center gap-4 text-[10px] text-white/20 uppercase tracking-widest">
        <span>Marble</span>
        <span className="w-0.5 h-3 bg-white/10" />
        <span>Spark</span>
        <span className="w-0.5 h-3 bg-white/10" />
        <span>Three.js</span>
        <span className="w-0.5 h-3 bg-white/10" />
        <span>0G Chain</span>
      </div>
    </div>
  )
}
