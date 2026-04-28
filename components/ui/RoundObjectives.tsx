'use client'

import { useGameStore } from '../../services/gameStore'
import { useMemo } from 'react'

interface Milestone {
  id: string
  label: string
  icon: string
  reward: number
  check: (collected: number, bids: number, rents: number, isLeader: boolean) => boolean
}

const OBJECTIVES: Milestone[] = [
  { id: 'collect_10', label: 'Collect 10', reward: 0.005, icon: '🍖', check: (c) => c >= 10 },
  { id: 'collect_25', label: 'Collect 25', reward: 0.01, icon: '🍗', check: (c) => c >= 25 },
  { id: 'bid_win', label: 'Win bid', reward: 0.005, icon: '⛈', check: (_, b) => b > 0 },
  { id: 'vehicle_rent', label: 'Rent ride', reward: 0.003, icon: '🚗', check: (_, __, r) => r > 0 },
]

export function RoundObjectives() {
  const round = useGameStore(s => s.round)
  const sessions = useGameStore(s => s.sessions)
  const playerId = useGameStore(s => s.playerId)

  const completed = useMemo(() => {
    const player = sessions[playerId]
    if (!player) return []

    const collected = player.collectedCount || 0
    const bids = player.executedBidCount || 0
    const rents = player.executedRentCount || 0
    const leader = Object.values(sessions).sort((a, b) => (b.totalEarned || 0) - (a.totalEarned || 0))[0]
    const isLeader = leader?.agentId === playerId

    return OBJECTIVES.filter(obj => obj.check(collected, bids, rents, isLeader)).map(obj => obj.id)
  }, [sessions, playerId])

  if (!round.isActive) return null

  return (
    <div className="fixed top-20 left-4 z-30 pointer-events-none">
      <div className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">Objectives</div>
      <div className="flex flex-col gap-1.5">
        {OBJECTIVES.slice(0, 3).map((obj) => {
          const isDone = completed.includes(obj.id)
          return (
            <div key={obj.id} className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${isDone ? 'bg-emerald-500/10 border-emerald-400/30' : 'bg-black/20 border-white/5'}`}>
              <span className="text-sm filter blur-[0.5px] opacity-60">{obj.icon}</span>
              <div className="text-[8px] font-bold text-white/50">{obj.label}</div>
              <div className="text-[8px] font-mono text-white/25">+{obj.reward.toFixed(3)}</div>
              {isDone && <span className="text-emerald-400 text-xs">✓</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}