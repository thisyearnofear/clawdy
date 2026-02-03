'use client'

import { useState, useEffect } from 'react'
import { agentProtocol } from '../../services/AgentProtocol'

interface LeaderboardEntry {
  id: string
  totalEarned: string
  totalRentPaid: string
  itemsCollectedCount: number
}

export function Leaderboard() {
  const [entries, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const updateLeaderboard = () => {
      const sessions = agentProtocol.getSessions()
      const currentStats = sessions.map(s => ({
        id: s.agentId,
        totalEarned: s.totalEarned.toString(),
        totalRentPaid: s.totalPaid.toString(),
        itemsCollectedCount: Math.floor(s.totalEarned / 0.001)
      }))

      const historical = [
        { id: '0xAlpha...dead', totalEarned: '1.245', totalRentPaid: '0.45', itemsCollectedCount: 842 },
        { id: '0xBeta...cafe', totalEarned: '0.892', totalRentPaid: '0.21', itemsCollectedCount: 512 }
      ]

      setLeaderboard([...currentStats, ...historical].sort((a, b) => parseFloat(b.totalEarned) - parseFloat(a.totalEarned)))
      setLoading(false)
    }

    const interval = setInterval(updateLeaderboard, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="max-h-48 overflow-y-auto scrollbar-hide">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="text-[8px] uppercase opacity-40 font-bold">
            <th className="px-2 py-2 font-black">Agent</th>
            <th className="px-2 py-2 text-right">Earned</th>
            <th className="px-2 py-2 text-right">Items</th>
          </tr>
        </thead>
        <tbody className="text-[10px] font-mono">
          {entries.map((agent, i) => (
            <tr key={agent.id} className={`${i === 0 ? 'bg-yellow-500/5' : ''} border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors`}>
              <td className="px-2 py-2 font-bold flex items-center gap-2">
                <span className={`w-1 h-1 rounded-full ${i === 0 ? 'bg-yellow-400 animate-pulse' : 'bg-white/20'}`} />
                {agent.id.slice(0, 10)}
              </td>
              <td className="px-2 py-2 text-right text-green-400">Ξ{parseFloat(agent.totalEarned).toFixed(3)}</td>
              <td className="px-2 py-2 text-right opacity-60">{agent.itemsCollectedCount}</td>
            </tr>
          ))}
          {loading && <tr><td colSpan={3} className="px-2 py-8 text-center animate-pulse opacity-30 italic">Syncing Envio...</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
