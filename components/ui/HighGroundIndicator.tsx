'use client'

import { useMemo } from 'react'
import { useGameStore } from '../../services/gameStore'

export function HighGroundIndicator() {
  const flood = useGameStore(s => s.flood)
  const playerWater = useGameStore(s => s.playerWater)
  const worldState = useGameStore(s => s.worldState)
  const playerId = useGameStore(s => s.playerId)

  const arrow = useMemo(() => {
    if (!flood.active || flood.intensity < 0.2) return null
    const myVehicle = worldState.vehicles.find(v => v.id === playerId)
    if (!myVehicle) return null

    const [px, , pz] = myVehicle.position
    const distFromCenter = Math.sqrt(px * px + pz * pz)

    // Only show when player is far from center (roads/high ground) or in water
    if (distFromCenter < 15 && !playerWater.inWater) return null

    // Arrow points toward center [0, 0, 0] — where roads and flat terrain are
    const angle = Math.atan2(-pz, -px) * (180 / Math.PI) - 90
    return { angle, distance: Math.round(distFromCenter) }
  }, [flood.active, flood.intensity, worldState.vehicles, playerId, playerWater.inWater])

  if (!arrow) return null

  return (
    <div className="fixed left-4 bottom-1/3 z-30 flex flex-col items-center gap-1">
      <div className="bg-emerald-900/80 backdrop-blur-sm rounded-xl border border-emerald-500/40 px-2.5 py-2 shadow-lg flex flex-col items-center gap-1">
        <span className="text-[7px] font-black text-emerald-400 uppercase tracking-wider">
          Higher Ground
        </span>
        <div
          className="text-emerald-300 text-lg transition-transform duration-300"
          style={{ transform: `rotate(${arrow.angle}deg)` }}
        >
          ↑
        </div>
        <span className="text-[8px] text-emerald-300/70 font-mono">
          {arrow.distance}m
        </span>
      </div>
    </div>
  )
}
