'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectWallet } from './ConnectWallet'
import { WinConditionBar } from './WinConditionBar'
import { AuctionTimer } from './AuctionTimer'
import { AgentTerminal } from './AgentTerminal'
import { useGameStore } from '../../services/gameStore'
import { CloudConfig } from '../environment/CloudManager'
import { QueueStatusBadge } from './QueueStatusBadge'

const DOMAIN_LABELS = {
  wind: 'Wind',
  lightning: 'Lightning',
  dayNight: 'Day/Night',
} as const

interface HUDProps {
  playerId: string
  isMounted: boolean
  onOpenSidebar: () => void
  onToggleQuickControls: () => void
  showQuickControls: boolean
  cloudConfig: CloudConfig
  onApplyPreset: (preset: NonNullable<CloudConfig['preset']>) => void
}

export function HUD({
  playerId,
  isMounted,
  onOpenSidebar,
  onToggleQuickControls,
  showQuickControls,
  cloudConfig,
  onApplyPreset
}: HUDProps) {
  const { address } = useAccount()
  const sessions = useGameStore(state => state.sessions)
  const showHUD = useGameStore(state => state.ui.showHUD)
  const activeWeatherEffects = useGameStore(state => state.activeWeatherEffects)
  const playerSession = sessions['Player']
  const activeDomainEffects = Object.values(activeWeatherEffects)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  
  if (!showHUD) return null

  return (
    <>
      {/* Win condition bar + auction timer */}
      {isMounted && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none">
          <WinConditionBar playerId={playerId} />
          <AuctionTimer />
        </div>
      )}

      {/* Logo - Always visible, compact */}
      <div className="absolute top-6 left-6 flex items-center gap-3 z-10">
        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg">
          <span className="text-2xl">🦞</span>
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-white drop-shadow-lg leading-none">CLAWDY</h1>
          <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">(with a chance of meatballs)</span>
        </div>
      </div>

      {/* Wallet - Top right */}
      <div className="absolute top-6 right-6 z-30">
        {isMounted ? <ConnectWallet /> : null}
      </div>

      {/* Spectator CTA - Center */}
      {isMounted && !address && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="max-w-md mx-4 rounded-2xl border border-white/20 bg-black/45 backdrop-blur-xl shadow-2xl p-5 text-center pointer-events-auto">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-300">Live Agent Arena</p>
            <p className="mt-2 text-sm font-semibold text-white">Agents are battling for weather control now. Connect wallet to drop in and disrupt the meta.</p>
            <div className="mt-4 flex justify-center">
              <ConnectWallet buttonClassName="group px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-black rounded-xl shadow-lg shadow-sky-900/20 transition-all active:scale-95 flex items-center gap-2" />
            </div>
          </div>
        </div>
      )}

      {isMounted && activeDomainEffects.length > 0 && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-black/45 backdrop-blur-xl border border-white/15 rounded-2xl px-4 py-3 shadow-xl min-w-[280px]">
            <p className="text-[9px] uppercase tracking-[0.22em] text-sky-300 font-black">Active Weather Domains</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeDomainEffects.map((effect) => {
                const secondsLeft = Math.max(0, Math.floor((effect.expiresAt - now) / 1000))
                return (
                  <span
                    key={effect.domain}
                    className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-white/10 text-white border border-white/15"
                  >
                    {DOMAIN_LABELS[effect.domain]} {Math.round(effect.intensity * 100)}% • {secondsLeft}s
                  </span>
                )
              })}
            </div>
            {activeDomainEffects.some(effect => effect.source === 'drop-in') && (
              <p className="mt-2 text-[9px] text-yellow-300 font-bold uppercase tracking-wide">Player influence window active</p>
            )}
          </div>
        </div>
      )}

      {/* Floating Action Buttons - Right side */}
      <div className="absolute top-1/2 right-6 -translate-y-1/2 flex flex-col gap-3 z-20">
        {/* Quick Weather Presets */}
        <div className="relative">
          <button
            onClick={onToggleQuickControls}
            className={`w-12 h-12 rounded-full backdrop-blur-xl border shadow-lg transition-all flex items-center justify-center group ${showQuickControls ? 'bg-sky-500 border-white text-white' : 'bg-black/20 border-white/20 text-white hover:bg-black/30'}`}
            title="Quick Weather [Tab]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </button>
          
          {/* Quick Presets Popup */}
          {showQuickControls && (
            <div className="absolute right-14 top-0 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 p-2 shadow-2xl animate-in fade-in slide-in-from-right-4">
              <div className="flex flex-col gap-1">
                {(['stormy', 'sunset', 'candy', 'cosmic', 'custom'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => onApplyPreset(p)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${cloudConfig.preset === p ? 'bg-white text-sky-900' : 'text-white hover:bg-white/10'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Open Full Controls */}
        <button
          onClick={onOpenSidebar}
          className="w-12 h-12 rounded-full bg-black/20 backdrop-blur-xl border border-white/20 text-white hover:bg-black/30 transition-all flex items-center justify-center group"
          title="Open Controls [ESC]"
        >
          <svg className="w-5 h-5 group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Agent Terminal Toggle */}
        <AgentTerminal />
      </div>

      {/* Player Status - Bottom right, minimal */}
      {playerSession && (
        <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2 items-end">
          {/* Queue Status */}
          <QueueStatusBadge playerId={playerId} />
          
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-3 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-white/50 uppercase">Balance</span>
                <span className="text-xs font-mono font-bold text-sky-400">{playerSession.balance.toFixed(2)} OKB</span>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-green-400">{playerSession.vitality}%</span>
                  <div className="w-16 bg-black/30 h-1 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${playerSession.vitality}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom center tagline */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-center pointer-events-none opacity-20 text-[8px] z-10 font-black tracking-[0.5em] uppercase">
        Continuous Decentralized Sandbox
      </div>
    </>
  )
}
