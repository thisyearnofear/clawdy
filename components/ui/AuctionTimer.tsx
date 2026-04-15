'use client'

import { useState, useEffect } from 'react'
import { useGameStore } from '../../services/gameStore'

export function AuctionTimer() {
  const round = useGameStore(s => s.round)
  const [timeLeft, setTimeLeft] = useState(0)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0) {
        setFlash(true)
        setTimeout(() => setFlash(false), 1000)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [round.endsAt])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const isUrgent = timeLeft <= 15
  const elapsed = round.durationMs > 0 ? round.durationMs - timeLeft * 1000 : 0
  const progress = round.durationMs > 0
    ? Math.max(0, Math.min(100, elapsed / round.durationMs * 100))
    : 0

  return (
    <div className={`flex items-center gap-2 bg-black/40 backdrop-blur-xl border rounded-2xl px-4 py-2 shadow-xl transition-all duration-300 ${
      flash ? 'border-yellow-400/60 bg-yellow-500/20 scale-105' : isUrgent ? 'border-red-400/40' : 'border-white/10'
    }`}>
      <div className="flex items-center gap-2">
        <span className={`text-[9px] font-black uppercase tracking-widest ${isUrgent ? 'text-red-400 animate-pulse' : 'text-white/40'}`}>
          ⚡ Next Auction
        </span>
        <span className={`text-sm font-mono font-black tabular-nums ${isUrgent ? 'text-red-400' : 'text-white'}`}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
      </div>
      <div className="w-16 bg-white/10 rounded-full h-1 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-red-400' : 'bg-sky-400'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
