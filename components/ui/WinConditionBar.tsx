'use client'

import { useGameStore } from '../../services/gameStore'

export function WinConditionBar({ playerId }: { playerId: string }) {
  const round = useGameStore(s => s.round)
  const sessions = useGameStore(s => s.sessions)
  const entries = Object.values(sessions).sort((a, b) => b.totalEarned - a.totalEarned)
  
  const WIN_TARGET = round.goalOKB

  const leader = entries[0]
  const playerEntry = sessions[playerId] || entries.find(e => e.agentId.startsWith(playerId?.slice(0, 6) ?? ''))
  const displayEntry = playerEntry || leader

  if (!displayEntry) return null

  const progress = Math.min((displayEntry.totalEarned / WIN_TARGET) * 100, 100)
  const isLeading = entries[0]?.agentId === displayEntry.agentId

  return (
    <div className="flex flex-col items-center gap-1 pointer-events-none">
      {!round.isActive && round.winner ? (
        <div className="bg-yellow-500/30 backdrop-blur-xl border border-yellow-400/50 rounded-2xl px-6 py-2 text-center shadow-2xl animate-pulse">
          <span className="text-xs font-black text-yellow-200">🏆 {round.winner.slice(0, 12)} WON THE ROUND!</span>
        </div>
      ) : (
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-2 shadow-xl flex items-center gap-4 min-w-[260px]">
          <div className="text-[9px] font-black uppercase tracking-widest text-white/40 whitespace-nowrap">
            Goal: {WIN_TARGET} OKB
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className={`text-[9px] font-bold truncate max-w-[100px] ${isLeading ? 'text-yellow-300' : 'text-white/60'}`}>
                {isLeading ? '👑 ' : ''}{displayEntry.agentId.slice(0, 10)}
              </span>
              <span className="text-[9px] font-mono text-sky-300">{displayEntry.totalEarned.toFixed(3)} / {WIN_TARGET} OKB</span>
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
              👑 {leader.totalEarned.toFixed(3)} OKB
            </div>
          )}
        </div>
      )}
    </div>
  )
}
