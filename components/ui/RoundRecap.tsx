'use client'

import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../../services/gameStore'

function shorten(id: string) {
  if (!id) return 'Unknown'
  return id.length > 14 ? `${id.slice(0, 12)}…` : id
}

export function RoundRecap() {
  const round = useGameStore(s => s.round)
  const sessions = useGameStore(s => s.sessions)
  const floodStats = useGameStore(s => s.playerFloodStats)
  const setModalOpen = useGameStore(s => s.setModalOpen)
  const [now, setNow] = useState(() => Date.now())
  const [dismissedRound, setDismissedRound] = useState<number | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])

  // When a new round starts, clear dismissal.
  useEffect(() => {
    if (round.isActive) setDismissedRound(null)
  }, [round.isActive, round.roundNumber])

  const leaderboard = useMemo(() => {
    return Object.values(sessions).sort((a, b) => b.totalEarned - a.totalEarned)
  }, [sessions])

  const isVisible = !round.isActive && !!round.winner && dismissedRound !== round.roundNumber
  
  // Expose recap as a blocking modal to the rest of the UI.
  useEffect(() => {
    setModalOpen('recap', isVisible)
  }, [isVisible, setModalOpen, round.roundNumber])

  useEffect(() => {
    if (!isVisible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissedRound(round.roundNumber)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [round.roundNumber, isVisible])

  if (!isVisible) return null

  const nextInMs = Math.max(0, (round.nextRoundAt ?? (now + 5000)) - now)
  const nextInSec = Math.ceil(nextInMs / 1000)

  const top3 = leaderboard.slice(0, 3)
  const player = sessions['Player']
  const playerRank = player ? leaderboard.findIndex(e => e.agentId === player.agentId) + 1 : null

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setDismissedRound(round.roundNumber)
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900/95 shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-white/10 bg-white/5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-300/80">Round complete</div>
            <div className="mt-1 text-xl font-black text-white">
              🏆 {shorten(round.winner ?? '')} wins
            </div>
            <div className="mt-1 text-[11px] text-white/55">
              Next round in <span className="text-sky-300 font-black">{nextInSec}s</span>
            </div>
          </div>
          <button
            onClick={() => setDismissedRound(round.roundNumber)}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/45">Top agents</div>
            <div className="mt-3 space-y-2">
              {top3.map((entry, idx) => (
                <div
                  key={entry.agentId}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                    idx === 0
                      ? 'border-yellow-400/30 bg-yellow-500/10'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-center text-[12px] font-black text-white/70">{idx + 1}</span>
                    <span className="text-[12px] font-black text-white">{shorten(entry.agentId)}</span>
                  </div>
                  <span className="text-[12px] font-mono text-sky-300">{entry.totalEarned.toFixed(3)} 0G</span>
                </div>
              ))}
            </div>
          </div>

          {player && (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/45">Your run</div>
                {playerRank !== null && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/70">
                    Rank #{playerRank}
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Earned</div>
                  <div className="mt-1 text-sm font-mono font-black text-emerald-200">{player.totalEarned.toFixed(3)} 0G</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Collected</div>
                  <div className="mt-1 text-sm font-mono font-black text-white">{player.collectedCount}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Best combo</div>
                  <div className="mt-1 text-sm font-mono font-black text-yellow-200">x{player.comboCount ?? 0}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">On-chain moves</div>
                  <div className="mt-1 text-sm font-mono font-black text-white">
                    {(player.executedBidCount ?? 0) + (player.executedRentCount ?? 0)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Air bubbles</div>
                  <div className="mt-1 text-sm font-mono font-black text-cyan-200">
                    {player.airBubbleCount ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Foam boards</div>
                  <div className="mt-1 text-sm font-mono font-black text-white">
                    {player.foamBoardCount ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Time in water</div>
                  <div className="mt-1 text-sm font-mono font-black text-cyan-200">
                    {(floodStats.waterTimeMs / 1000).toFixed(0)}s
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Clutch saves</div>
                  <div className="mt-1 text-sm font-mono font-black text-white">
                    {floodStats.bubbleSaves + floodStats.boardSaves}{' '}
                    <span className="text-[10px] text-white/50">
                      (B {floodStats.bubbleSaves} • F {floodStats.boardSaves})
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 col-span-2">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Drain plugs</div>
                  <div className="mt-1 text-sm font-mono font-black text-yellow-200">
                    {floodStats.drainUses}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setDismissedRound(round.roundNumber)}
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] font-black text-white/70 hover:bg-white/10 transition"
            >
              Continue
            </button>
            <div className="text-[10px] text-white/40">
              Tip: chain pickups to grow your combo multiplier.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
