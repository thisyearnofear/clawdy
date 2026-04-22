'use client'

import React, { useState, useEffect } from 'react'
import { vehicleQueue, QueueState } from '../../services/VehicleQueue'
import { useAccount } from 'wagmi'

export const QueueStatusBadge = React.memo(function QueueStatusBadge({ playerId }: { playerId: string }) {
  const { address } = useAccount()
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Subscribe to queue state changes (runs once)
  useEffect(() => {
    const unsubscribe = vehicleQueue.subscribe((state) => {
      setQueueState(state)
    })
    return () => unsubscribe()
  }, [])

  // Only tick the timer when the player is waiting or active
  useEffect(() => {
    const player = queueState?.queue.find(p => p.id === playerId)
    const needsTimer = player?.status === 'waiting' || (queueState?.isPlayerActive(playerId))
    if (!needsTimer) return

    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [playerId, queueState])

  if (!queueState) return null

  const isActive = queueState.isPlayerActive(playerId)
  const vehicle = queueState.getPlayerVehicle(playerId)
  const player = queueState.queue.find(p => p.id === playerId)
  
  if (isActive && vehicle) {
    const timeLeft = player?.sessionEndTime 
      ? Math.max(0, Math.floor((player.sessionEndTime - now) / 1000))
      : 0
    const minutes = Math.floor(timeLeft / 60)
    const seconds = timeLeft % 60
    
    return (
      <div className="flex flex-col gap-1 items-end">
        <div className="bg-black/60 backdrop-blur-xl rounded-lg border border-white/10 px-3 py-1.5 shadow-xl">
          <div className="flex items-center gap-3 text-[10px] text-white/70">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white font-mono text-[9px]">WASD</kbd>
              <span>Drive</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white font-mono text-[9px]">SPACE</kbd>
              <span>Brake/Action</span>
            </span>
          </div>
        </div>
        <div className="bg-green-500/20 backdrop-blur-xl rounded-xl border border-green-500/50 px-3 py-2 shadow-xl animate-in fade-in slide-in-from-right-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-green-400 uppercase">Driving {vehicle.type}</span>
            <span className="text-[10px] font-mono text-white/70">{minutes}:{seconds.toString().padStart(2, '0')}</span>
          </div>
        </div>
      </div>
    )
  }
  
  if (player?.status === 'waiting') {
    const position = queueState.queue.filter(p => p.status === 'waiting').findIndex(p => p.id === playerId) + 1
    const estimatedWait = position * 30
    
    return (
      <div className="bg-yellow-500/20 backdrop-blur-xl rounded-xl border border-yellow-500/50 px-3 py-2 shadow-xl">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-yellow-400 uppercase">Waiting in Queue</span>
          </div>
          <div className="text-[9px] text-white/50">
            Position {position} of {queueState.waitingCount} • ~{estimatedWait}s wait
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 px-3 py-2 shadow-xl">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black text-white/50 uppercase">{address ? 'Join Queue to Drive' : 'Connect wallet to drive'}</span>
      </div>
      {address && (
        <div className="text-[9px] text-white/50 mt-1">Drop-in slots rotate quickly during weather influence windows.</div>
      )}
    </div>
  )
})
