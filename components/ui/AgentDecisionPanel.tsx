'use client'

import { useGameStore } from '../../services/gameStore'
import { useMemo } from 'react'

interface Decision {
  id: string
  agentId: string
  type: 'bid' | 'rent'
  amount: number
  target: string
  reason: string
}

const ROLE_LABELS: Record<string, string> = {
  Scout: '🔍',
  Weather: '⛅',
  Mobility: '🚗',
  Treasury: '💰',
  Player: '🦞',
}

export function AgentDecisionPanel() {
  const sessions = useGameStore(s => s.sessions)

  const decisions = useMemo(() => {
    const results: Decision[] = []
    for (const [id, session] of Object.entries(sessions)) {
      if (session.executedBidCount > 0) {
        results.push({
          id: `bid-${id}`,
          agentId: id,
          type: 'bid',
          amount: session.totalPaid || 0,
          target: 'Weather',
          reason: `${(session.vitality || 0).toFixed(1)} vigor`,
        })
      }
      if (session.executedRentCount > 0) {
        results.push({
          id: `rent-${id}`,
          agentId: id,
          type: 'rent',
          amount: session.executedRentCount,
          target: 'Vehicle',
          reason: 'Active lease',
        })
      }
    }
    return results.slice(0, 6)
  }, [sessions])

  if (decisions.length === 0) return null

  return (
    <div className="fixed top-20 right-4 z-30 flex flex-col gap-1.5 pointer-events-none max-w-[180px]">
      <div className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Agent Activity</div>
      {decisions.slice(0, 4).map((d) => (
        <div
          key={d.id}
          className="bg-black/30 backdrop-blur-md rounded-lg px-2 py-1.5 border border-white/5 flex items-center gap-1.5"
        >
          <span className="text-sm">{ROLE_LABELS[d.agentId] || '🤖'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[8px] font-bold text-sky-400 truncate">{d.agentId}</div>
            <div className="text-[7px] text-white/40 truncate">{d.reason}</div>
          </div>
          <span className="text-[9px] font-mono text-amber-400/80">
            {d.type === 'bid' ? `${(d.amount || 0).toFixed(3)}` : `x${d.amount}`}
          </span>
        </div>
      ))}
    </div>
  )
}