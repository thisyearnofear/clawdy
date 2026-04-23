'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useGameStore } from '../../services/gameStore'
import { emitToast } from './GameToasts'
import { agentProtocol, MEME_MARKET_ABILITIES, MEME_MARKET_STRATEGIES, getMemeMarketStrategy } from '../../services/AgentProtocol'

export function PlayerStrategyPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const playerId = useGameStore(s => s.playerId)
  const sessions = useGameStore(s => s.sessions)
  const playerSession = sessions[playerId]
  const [manualBidOverride, setManualBidOverride] = useState<number | null>(null)
  const currentStrategy = getMemeMarketStrategy(playerSession?.strategyId)

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const floodDrainAbility = MEME_MARKET_ABILITIES.find((ability) => ability.key === 'flood_drain')

  const abilityStatus = useMemo(() => {
    return MEME_MARKET_ABILITIES.map((ability) => {
      const activeUntil = ability.key === 'speed_boost'
        ? playerSession?.speedBoostUntil
        : ability.key === 'anti_gravity'
          ? playerSession?.antiGravityUntil
          : undefined
      const remainingSeconds = activeUntil && activeUntil > nowMs
        ? Math.ceil((activeUntil - nowMs) / 1000)
        : 0
      const charges = ability.key === 'flood_drain' ? (playerSession?.drainPlugCount ?? 0) : 0

      return {
        ...ability,
        remainingSeconds,
        charges,
      }
    })
  }, [nowMs, playerSession?.antiGravityUntil, playerSession?.drainPlugCount, playerSession?.speedBoostUntil])

  const handleStrategySelect = useCallback((strategy: (typeof MEME_MARKET_STRATEGIES)[number]) => {
    const success = agentProtocol.setPlayerStrategy(playerId, strategy.id)
    if (success && strategy) {
      emitToast('milestone', `Strategy: ${strategy.label}`, `${strategy.icon} Aggression: ${Math.round(strategy.aggressive * 100)}%`)
    }
  }, [playerId])

  const handleManualBid = useCallback(() => {
    if (manualBidOverride === null || manualBidOverride <= 0) {
      emitToast('bid-lose', 'Enter bid amount', 'Must be greater than 0')
      return
    }
    useGameStore.getState().setSession(playerId, {
      mission: 'manual',
    })
    emitToast('milestone', 'Manual Bid', `Will bid ${manualBidOverride.toFixed(4)} 0G`)
  }, [playerId, manualBidOverride])

  const handleUseFloodDrain = useCallback(() => {
    if (!floodDrainAbility) return

    const success = agentProtocol.activateMemeMarketAbility(floodDrainAbility.id)
    if (!success) {
      emitToast('bid-lose', 'No Flood Drain Charges', 'Mint one before draining the flood')
    }
  }, [floodDrainAbility])

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
          <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[8px] font-bold uppercase tracking-wider text-white/55">
            Current: {currentStrategy ? `${currentStrategy.icon} ${currentStrategy.label}` : 'Unset'}
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-4">
            {MEME_MARKET_STRATEGIES.map((preset) => (
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
              Override your agent&apos;s automatic bid with a fixed amount
            </p>
          </div>

          <div className="border-t border-white/10 pt-3 mt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[8px] font-black uppercase tracking-widest text-white/30">MemeMarket Loadout</div>
              <span className="text-[7px] font-bold uppercase tracking-widest text-white/25">Live abilities</span>
            </div>
            <div className="space-y-2">
              {abilityStatus.map((ability) => {
                const isFloodDrain = ability.key === 'flood_drain'
                const isActive = ability.remainingSeconds > 0
                const canUseDrain = isFloodDrain && ability.charges > 0

                return (
                  <div key={ability.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[9px] font-bold text-white">{ability.label}</div>
                        <div className="text-[7px] text-white/40">{ability.source} · Token #{ability.id}</div>
                      </div>
                      {isFloodDrain ? (
                        <button
                          onClick={handleUseFloodDrain}
                          disabled={!canUseDrain}
                          className={`rounded-md px-2 py-1 text-[8px] font-black uppercase tracking-wider transition-colors ${
                            canUseDrain
                              ? 'border border-sky-400/25 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20'
                              : 'border border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                          }`}
                        >
                          Use Drain
                        </button>
                      ) : (
                        <span className={`rounded-md border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${
                          isActive
                            ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                            : 'border-white/10 bg-white/5 text-white/40'
                        }`}>
                          {isActive ? `${ability.remainingSeconds}s left` : 'Ready'}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-[8px] text-white/45">
                      {isFloodDrain
                        ? `${ability.charges} charge${ability.charges === 1 ? '' : 's'} available`
                        : isActive
                          ? `${ability.remainingSeconds}s remaining`
                          : 'Passive until minted'}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[7px] text-white/25 mt-2">
              Flood Drain is consumed once per use; minting adds a charge.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
