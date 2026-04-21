'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectWallet } from './ConnectWallet'
import { WinConditionBar } from './WinConditionBar'
import { AuctionTimer } from './AuctionTimer'
import { AgentTerminal } from './AgentTerminal'
import { useGameStore } from '../../services/gameStore'
import { CloudConfig } from '../environment/CloudManager'
import { QueueStatusBadge } from './QueueStatusBadge'
import { trackEvent } from '../../services/analytics'

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
  const hideSpectatorCta = useGameStore(state => state.ui.hideSpectatorCta)
  const setUI = useGameStore(state => state.setUI)
  const setModalOpen = useGameStore(state => state.setModalOpen)
  const isBlockingOverlayOpen = useGameStore(state =>
    state.ui.modals.wallet || state.ui.modals.onboarding || state.ui.modals.recap || state.ui.modals.spectatorCta
  )
  const activeWeatherEffects = useGameStore(state => state.activeWeatherEffects)
  const [now, setNow] = useState(() => Date.now())
  const [spectatorCtaDismissed, setSpectatorCtaDismissed] = useState(false)
  const [spectatorCtaDontShow, setSpectatorCtaDontShow] = useState(false)
  const flood = useGameStore(state => state.flood)
  const playerWater = useGameStore(state => state.playerWater)
  const playerSession = sessions['Player']
  const activeDomainEffects = Object.values(activeWeatherEffects)
  const isSpeedBoosted = !!(playerSession?.speedBoostUntil && playerSession.speedBoostUntil > now)
  const isAntiGravity = !!(playerSession?.antiGravityUntil && playerSession.antiGravityUntil > now)
  const isAirBubble = !!(playerSession?.airBubbleUntil && playerSession.airBubbleUntil > now)
  const isFoamBoard = !!(playerSession?.foamBoardUntil && playerSession.foamBoardUntil > now)
  const comboCount = playerSession?.comboCount ?? 0
  const comboMultiplier = playerSession?.comboMultiplier ?? 1
  const comboExpiresAt = playerSession?.comboExpiresAt ?? 0
  const comboSecondsLeft = comboCount >= 2 ? Math.max(0, Math.ceil((comboExpiresAt - now) / 1000)) : 0
  const bubbleSecondsLeft = isAirBubble ? Math.max(0, Math.ceil(((playerSession?.airBubbleUntil ?? 0) - now) / 1000)) : 0
  const boardSecondsLeft = isFoamBoard ? Math.max(0, Math.ceil(((playerSession?.foamBoardUntil ?? 0) - now) / 1000)) : 0
  const hasTrackedSpectatorCtaRef = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Restore persisted CTA dismissal (mobile clutter fix)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem('clawdy:hideSpectatorCta')
      if (raw === '1') setUI({ hideSpectatorCta: true })
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isMounted || address || hasTrackedSpectatorCtaRef.current) return
    hasTrackedSpectatorCtaRef.current = true
    trackEvent('spectator_cta_viewed', {
      playerId,
      source: 'hud_overlay',
      activeDomains: activeDomainEffects.length,
    })
  }, [activeDomainEffects.length, address, isMounted, playerId])

  const spectatorCtaVisible = isMounted && !address && !hideSpectatorCta && !spectatorCtaDismissed

  // Register spectator CTA as a blocking overlay so the layer manager can hide other UI.
  useEffect(() => {
    setModalOpen('spectatorCta', spectatorCtaVisible)
  }, [setModalOpen, spectatorCtaVisible])
  
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
        {isMounted ? <ConnectWallet source="hud_top_right" /> : null}
      </div>

      {/* Spectator CTA - Center */}
      {spectatorCtaVisible && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
            onClick={() => {
              setSpectatorCtaDismissed(true)
              if (spectatorCtaDontShow) {
                setUI({ hideSpectatorCta: true })
                try { localStorage.setItem('clawdy:hideSpectatorCta', '1') } catch { /* ignore */ }
              }
            }}
          />
          {/* Mobile bottom sheet (default) / Center card (sm+) */}
          <div className="relative w-full max-w-md rounded-2xl border border-white/20 bg-black/55 backdrop-blur-xl shadow-2xl p-5 text-center max-h-[60vh] overflow-y-auto overscroll-contain sm:max-h-none">
            <button
              onClick={() => {
                setSpectatorCtaDismissed(true)
                if (spectatorCtaDontShow) {
                  setUI({ hideSpectatorCta: true })
                  try { localStorage.setItem('clawdy:hideSpectatorCta', '1') } catch { /* ignore */ }
                }
              }}
              className="absolute top-3 right-3 text-white/40 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
              aria-label="Dismiss"
              title="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-300">Live Agent Arena</p>
            <p className="mt-2 text-sm font-semibold text-white">Agents are battling for weather control now. Connect wallet to drop in and disrupt the meta.</p>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-[9px] uppercase font-black tracking-wide">
              <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-sky-200">1) Connect</span>
              <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-sky-200">2) Join Queue</span>
              <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-sky-200">3) Control Weather</span>
            </div>
            <p className="mt-2 text-[10px] text-white/70">
              Controls: <span className="font-black text-white">WASD / Arrows + Space</span>
              <span className="hidden sm:inline"> • On mobile use joystick + A</span>
            </p>
            <div className="mt-4 flex justify-center">
              <ConnectWallet
                source="spectator_cta"
                buttonClassName="group px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-black rounded-xl shadow-lg shadow-sky-900/20 transition-all active:scale-95 flex items-center gap-2"
              />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-white/60">
              <input
                id="spectatorCtaDontShow"
                type="checkbox"
                className="accent-sky-400"
                checked={spectatorCtaDontShow}
                onChange={(e) => setSpectatorCtaDontShow(e.target.checked)}
              />
              <label htmlFor="spectatorCtaDontShow" className="select-none">
                Don’t show again
              </label>
            </div>
          </div>
        </div>
      )}

      {isMounted && activeDomainEffects.length > 0 && (
        <div className="hidden sm:block absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
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
      <div
        className={`absolute top-1/2 right-6 -translate-y-1/2 ${
          isBlockingOverlayOpen ? 'hidden sm:flex' : 'flex'
        } flex-col gap-3 z-20`}
      >
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
                <span className="text-xs font-mono font-bold text-sky-400">{playerSession.balance.toFixed(2)} 0G</span>
              </div>
              {(isSpeedBoosted || isAntiGravity) && (
                <>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    {isSpeedBoosted && (
                      <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-orange-200">
                        Boost
                      </span>
                    )}
                    {isAntiGravity && (
                      <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-purple-200">
                        Float
                      </span>
                    )}
                  </div>
                </>
              )}
              {isAirBubble && (
                <>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200">
                      Bubble
                    </span>
                    <span className="rounded-full border border-cyan-300/20 bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200/80 tabular-nums">
                      {bubbleSecondsLeft}s
                    </span>
                  </div>
                </>
              )}
              {isFoamBoard && (
                <>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-slate-200/25 bg-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-100">
                      Board
                    </span>
                    <span className="rounded-full border border-slate-200/15 bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-100/80 tabular-nums">
                      {boardSecondsLeft}s
                    </span>
                  </div>
                </>
              )}
              {comboCount >= 2 && (
                <>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-yellow-400/30 bg-yellow-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-yellow-200">
                      Combo x{comboCount}
                    </span>
                    <span className="rounded-full border border-yellow-400/20 bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-yellow-200/80">
                      {comboMultiplier.toFixed(2)}× • {comboSecondsLeft}s
                    </span>
                  </div>
                </>
              )}
              {flood.active && flood.intensity > 0.2 && (
                <>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-sky-200">
                      Flooding
                    </span>
                    <span className="rounded-full border border-sky-400/20 bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-sky-200/80 tabular-nums">
                      {Math.round(flood.intensity * 100)}%
                    </span>
                  </div>
                </>
              )}
              {playerWater.inWater && (
                <>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200">
                      In water
                    </span>
                    <span className="rounded-full border border-cyan-300/20 bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200/80 tabular-nums">
                      {Math.round((playerWater.depth ?? 0) * 100)}%
                    </span>
                  </div>
                </>
              )}
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
