'use client'

import { useState, useCallback } from 'react'
import { useGameStore } from '../../services/gameStore'
import { emitToast } from './GameToasts'

interface StrategyPreset {
  id: string
  label: string
  aggressive: number
  weatherFocus: number
  icon: string
}

const STRATEGY_PRESETS: StrategyPreset[] = [
  { id: 'conservative', label: 'Defensive', aggressive: 0.2, weatherFocus: 0.3, icon: '🛡️' },
  { id: 'balanced', label: 'Balanced', aggressive: 0.5, weatherFocus: 0.5, icon: '⚖️' },
  { id: 'aggressive', label: 'Aggressive', aggressive: 0.85, weatherFocus: 0.85, icon: '⚔️' },
  { id: 'hoarder', label: 'Collector', aggressive: 0.3, weatherFocus: 0.95, icon: '💎' },
]

export function PlayerStrategyPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const playerId = useGameStore(s => s.playerId)
  const sessions = useGameStore(s => s.sessions)
  const playerSession = sessions[playerId]
  const [manualBidOverride, setManualBidOverride] = useState<number | null>(null)

  const handleStrategySelect = useCallback((preset: StrategyPreset) => {
    useGameStore.getState().setSession(playerId, {
      mission: preset.id,
    } as any)
    emitToast('milestone', `Strategy: ${preset.label}`, `${preset.icon} Aggression: ${Math.round(preset.aggressive * 100)}%`)
  }, [playerId])

  const handleManualBid = useCallback(() => {
    if (manualBidOverride === null || manualBidOverride <= 0) {
      emitToast('bid-lose', 'Enter bid amount', 'Must be greater than 0')
      return
    }
    useGameStore.getState().setSession(playerId, {
      mission: 'manual',
    } as any)
    emitToast('milestone', 'Manual Bid', `Will bid ${manualBidOverride.toFixed(4)} 0G`)
  }, [playerId, manualBidOverride])

  if (!playerSession) return null

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 left-4 z-30 px-3 py-2 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-black/60 transition-all"
      >
        <span className="text-[10px] font-black uppercase tracking-wider">Strategy</span>
      </button>

      {isOpen && (
        <div className="fixed bottom-28 left-4 z-40 w-64 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">Player Strategy</div>
          
          <div className="grid grid-cols-2 gap-2 mb-4">
            {STRATEGY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleStrategySelect(preset)}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left"
              >
                <span className="text-sm">{preset.icon}</span>
                <div className="text-[9px] font-bold text-white">{preset.label}</div>
                <div className="text-[7px] text-white/40">
                  Agg: {Math.round(preset.aggressive * 100)}%
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-2">Manual Bid Override</div>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.001"
                min="0"
                value={manualBidOverride ?? ''}
                onChange={(e) => setManualBidOverride(Number(e.target.value))}
                placeholder="0.000"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white font-mono"
              />
              <button
                onClick={handleManualBid}
                className="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-300 text-[9px] font-bold uppercase"
              >
                Bid
              </button>
            </div>
            <p className="text-[7px] text-white/25 mt-2">
              Override your agent's automatic bid with a fixed amount
            </p>
          </div>
        </div>
      )}
    </>
  )
}