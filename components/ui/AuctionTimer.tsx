'use client'

import { useState, useEffect } from 'react'

const ROUND_DURATION = 60 // seconds per auction round

export function AuctionTimer() {
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setFlash(true)
          setTimeout(() => setFlash(false), 600)
          return ROUND_DURATION
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const isUrgent = timeLeft <= 10
  const progress = ((ROUND_DURATION - timeLeft) / ROUND_DURATION) * 100

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
