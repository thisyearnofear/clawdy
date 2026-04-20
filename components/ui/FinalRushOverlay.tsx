'use client'

import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../services/gameStore'
import { playSound } from './SoundManager'

export function FinalRushOverlay() {
  const round = useGameStore(s => s.round)
  const [now, setNow] = useState(() => Date.now())
  const lastSecondRef = useRef<number | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [])

  if (!round.isActive) return null

  const remainingMs = round.endsAt - now
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))
  const isFinalRush = remainingSec > 0 && remainingSec <= 10

  // Sound cues: one big cue at 10s, then light ticks.
  useEffect(() => {
    if (!isFinalRush) {
      lastSecondRef.current = null
      return
    }
    if (lastSecondRef.current === remainingSec) return
    const prev = lastSecondRef.current
    lastSecondRef.current = remainingSec

    if (remainingSec === 10) {
      playSound('milestone')
    } else if (prev !== null && remainingSec < prev) {
      playSound('ui-click')
    }
  }, [isFinalRush, remainingSec])

  if (!isFinalRush) return null

  // Subtle tint + banner. Keep it readable and not too intrusive.
  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      {/* Screen tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-red-500/0 via-red-500/0 to-red-500/10" />

      {/* Top banner */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2">
        <div className="rounded-full border border-red-400/40 bg-black/45 backdrop-blur-xl shadow-2xl px-4 py-2 flex items-center gap-3 animate-pulse">
          <span className="text-[10px] font-black uppercase tracking-[0.35em] text-red-300">
            Final Rush
          </span>
          <span className="text-sm font-mono font-black tabular-nums text-white">
            {remainingSec}s
          </span>
          <span className="text-[10px] text-white/55">
            everything counts
          </span>
        </div>
      </div>
    </div>
  )
}

