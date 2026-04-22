'use client'

import React, { useEffect, useRef, useMemo } from 'react'
import { useGameStore } from '../../services/gameStore'
import { emitToast } from './GameToasts'
import { playSound } from './SoundManager'

export const WinConditionBar = React.memo(function WinConditionBar({ playerId }: { playerId: string }) {
  const round = useGameStore(s => s.round)
  const sessions = useGameStore(s => s.sessions)
  const triggerCameraShake = useGameStore(s => s.triggerCameraShake)

  const lastLeaderRef = useRef<string | null>(null)
  const lastPopAtRef = useRef(0)

  useEffect(() => {
    const entries = Object.values(sessions).sort((a, b) => b.totalEarned - a.totalEarned)
    const leader = entries[0]
    const leaderId = leader?.agentId ?? null
    const now = Date.now()
    const remainingSec = Math.max(0, Math.ceil((round.endsAt - now) / 1000))
    const isFinalRush = round.isActive && remainingSec > 0 && remainingSec <= 10

    if (leaderId && lastLeaderRef.current && leaderId !== lastLeaderRef.current && isFinalRush) {
      if (now - lastPopAtRef.current > 900) {
        lastPopAtRef.current = now
        triggerCameraShake(0.9, 260)
        playSound('milestone')
        emitToast('bid-win', 'Lead stolen!', `${leaderId.slice(0, 10)} took #1`)
      }
    }
    lastLeaderRef.current = leaderId
  }, [sessions, round.endsAt, round.isActive, triggerCameraShake])

  const entries = useMemo(() => Object.values(sessions).sort((a, b) => b.totalEarned - a.totalEarned), [sessions])
  const WIN_TARGET = round.goal
  const leader = entries[0]
  const playerEntry = sessions[playerId] || entries.find(e => e.agentId.startsWith(playerId?.slice(0, 6) ?? ''))
  const displayEntry = playerEntry || leader

  if (!round.isActive) {
    return (
      <div className="flex flex-col items-center gap-1 pointer-events-none">
        {round.winner ? (
          <div className="bg-yellow-500/30 backdrop-blur-xl border border-yellow-400/50 rounded-2xl px-6 py-2 text-center shadow-2xl animate-pulse">
            <span className="text-xs font-black text-yellow-200">🏆 {round.winner.slice(0, 12)} WON THE ROUND!</span>
          </div>
        ) : null}
      </div>
    )
  }

  if (!displayEntry) return null

  const progress = Math.min((displayEntry.totalEarned / WIN_TARGET) * 100, 100)
  const isLeading = entries[0]?.agentId === displayEntry.agentId

  return (
    <div className="flex flex-col items-center gap-1 pointer-events-none">
      <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-2 shadow-xl flex items-center gap-4 min-w-[260px]">
        <div className="text-[9px] font-black uppercase tracking-widest text-white/40 whitespace-nowrap">
          Goal: {WIN_TARGET} 0G
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <span className={`text-[9px] font-bold truncate max-w-[100px] ${isLeading ? 'text-yellow-300' : 'text-white/60'}`}>
              {isLeading ? '👑 ' : ''}{displayEntry.agentId.slice(0, 10)}
            </span>
            <span className="text-[9px] font-mono text-sky-300">{displayEntry.totalEarned.toFixed(3)} / {WIN_TARGET} 0G</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${isLeading ? 'bg-yellow-400' : 'bg-sky-400'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {leader && leader.agentId !== displayEntry.agentId && (
          <div className="text-[9px] text-yellow-300/60 whitespace-nowrap">
            👑 {leader.totalEarned.toFixed(3)} 0G
          </div>
        )}
      </div>
    </div>
  )
})
