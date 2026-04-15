'use client'

import { useState, useEffect } from 'react'
import { getActivitySnapshot, type ActivityDataSource, type ActivityEntry } from '../../services/activityMetrics'

export function Leaderboard() {
  const [entries, setLeaderboard] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState<ActivityDataSource>('runtime-only')
  const [indexerLabel, setIndexerLabel] = useState('runtime only')

  useEffect(() => {
    const updateLeaderboard = async () => {
      const snapshot = await getActivitySnapshot()
      setLeaderboard(snapshot.entries)
      setDataSource(snapshot.dataSource)
      setIndexerLabel(snapshot.indexerLabel)
      setLoading(false)
    }

    void updateLeaderboard()
    const interval = setInterval(updateLeaderboard, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="max-h-48 overflow-y-auto scrollbar-hide">
      <div className="mb-2 flex items-center justify-between">
        <div className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${
          dataSource === 'live-indexed'
            ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
            : dataSource === 'indexed-fallback'
              ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
              : 'border-white/10 bg-white/5 text-white/55'
        }`}>
          {dataSource === 'live-indexed' ? 'Live Indexed' : dataSource === 'indexed-fallback' ? 'Fallback Snapshot' : 'Runtime Only'}
        </div>
        <div className="text-[8px] uppercase tracking-wider text-white/30">{indexerLabel}</div>
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
            <tr key={agent.id} className={`${i === 0 ? 'bg-yellow-500/5' : ''} border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors`}>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2 font-bold">
                <span className={`w-1 h-1 rounded-full ${i === 0 ? 'bg-yellow-400 animate-pulse' : 'bg-white/20'}`} />
                {agent.id.slice(0, 10)}
                </div>
                <div className="mt-1 text-[8px] uppercase tracking-wider text-white/35">{agent.roleLabel} · {agent.provider} · {agent.source}</div>
              </td>
              <td className="px-2 py-2 text-right">
                <div className="text-sky-300">{agent.executedBidCount + agent.executedRentCount}</div>
                <div className="mt-1 text-[8px] text-white/35">B{agent.executedBidCount} · R{agent.executedRentCount}</div>
              </td>
              <td className="px-2 py-2 text-right">
                <div className="text-green-400">{agent.totalEarned.toFixed(3)} OKB</div>
                <div className="mt-1 text-[8px] opacity-40">C{agent.collectedCount}</div>
              </td>
            </tr>
          ))}
          {loading && <tr><td colSpan={3} className="px-2 py-8 text-center animate-pulse opacity-30 italic">Syncing activity...</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
