'use client'

import { useGameStore } from '../../services/gameStore'

export function Leaderboard() {
  const sessions = useGameStore(state => state.sessions)
  const deadAgents = useGameStore(state => state.deadAgents)
  
  const entries = Object.values(sessions).sort((a, b) => b.totalEarned - a.totalEarned)

  return (
    <div className="flex flex-col gap-6 max-h-[70vh] overflow-y-auto scrollbar-hide">
      {/* Active Agents */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-emerald-300">
            Active Agents
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[8px] uppercase opacity-40 font-bold">
              <th className="px-2 py-2 font-black">Agent</th>
              <th className="px-2 py-2 text-right">Exec</th>
              <th className="px-2 py-2 text-right">Yield</th>
            </tr>
          </thead>
          <tbody className="text-[10px] font-mono">
            {entries.map((agent, i) => (
              <tr key={agent.agentId} className={`${i === 0 ? 'bg-yellow-500/5' : ''} border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors`}>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2 font-bold">
                  <span className={`w-1 h-1 rounded-full ${i === 0 ? 'bg-yellow-400 animate-pulse' : 'bg-white/20'}`} />
                  {agent.agentId.slice(0, 10)}
                  </div>
                  <div className="mt-1 text-[8px] uppercase tracking-wider text-white/35">{agent.role} · {agent.vitality.toFixed(0)}% VIT</div>
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="text-sky-300">{agent.executedBidCount + agent.executedRentCount}</div>
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="text-green-400">{agent.totalEarned.toFixed(3)} OKB</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The Graveyard */}
      {deadAgents.length > 0 && (
        <div className="opacity-60">
          <div className="mb-2 flex items-center justify-between border-t border-white/10 pt-4">
            <div className="rounded-full border border-red-400/40 bg-red-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-red-300">
              Legacy of the Fallen
            </div>
          </div>
          <table className="w-full text-left border-collapse">
            <tbody className="text-[9px] font-mono grayscale">
              {deadAgents.slice().reverse().map((agent) => (
                <tr key={agent.agentId} className="border-b border-white/5 last:border-0">
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 font-bold text-white/50">
                      <span>💀</span>
                      {agent.agentId.slice(0, 10)}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right text-white/30">
                    {agent.totalEarned.toFixed(3)} OKB
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
