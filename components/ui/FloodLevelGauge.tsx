'use client'

import { useMemo } from 'react'
import { useGameStore } from '../../services/gameStore'

export function FloodLevelGauge() {
  const flood = useGameStore(s => s.flood)
  const playerWater = useGameStore(s => s.playerWater)

  const active = flood.active && flood.intensity > 0.15
  if (!active) return null

  // Calculate player height based on submersion depth
  // If depth is 0.5 and flood level is 1, player is at level 0.5 (half submerged)
  const playerHeight = flood.level - (playerWater.depth * 1.0)

  const floodHeight = Math.max(0, flood.level + 2) // Offset so 0 = underground
  const maxDisplay = 6

  const floodPercent = Math.min(100, (floodHeight / maxDisplay) * 100)
  const playerPercent = Math.min(100, (playerHeight / maxDisplay) * 100)

  const phaseLabel = flood.phase === 'rising' ? '↑ Rising' 
    : flood.phase === 'peak' ? '⚠ Peak'
    : flood.phase === 'draining' ? '↓ Draining'
    : '🌊 Active'

  const phaseColor = flood.phase === 'peak' ? 'text-amber-400'
    : flood.phase === 'rising' ? 'text-sky-400'
    : flood.phase === 'draining' ? 'text-emerald-400'
    : 'text-sky-300'

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1">
      {/* Phase label */}
      <div className={`text-[8px] font-black uppercase tracking-wider ${phaseColor}`}>
        {phaseLabel}
      </div>
      
      {/* Gauge bar */}
      <div className="relative w-3 h-32 bg-black/40 rounded-full border border-white/20 overflow-hidden">
        {/* Flood level */}
        <div 
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-sky-600 to-sky-400/70 transition-all duration-300"
          style={{ height: `${floodPercent}%` }}
        />
        
        {/* Player position indicator */}
        <div 
          className="absolute left-0 right-0 h-1 bg-yellow-400 rounded-full shadow-lg transition-all duration-150"
          style={{ top: `${100 - playerPercent}%` }}
        />
      </div>

      {/* Intensity indicator */}
      <div className="text-[7px] text-white/50 font-mono">
        {Math.round(flood.intensity * 100)}%
      </div>
    </div>
  )
}