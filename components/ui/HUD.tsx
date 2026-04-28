'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { WinConditionBar } from './WinConditionBar'
import { AuctionTimer } from './AuctionTimer'
import { useAccount } from 'wagmi'
import { useGameStore } from '../../services/gameStore'
import { QueueStatusBadge } from './QueueStatusBadge'
import { ConnectWallet } from './ConnectWallet'
import { FloodLevelGauge } from './FloodLevelGauge'
import { HighGroundIndicator } from './HighGroundIndicator'
import { CloudConfig } from '../environment/CloudManager'
import { UI_Z_INDEX } from '../../services/uiConstants'
import { AgentMetaBlock } from './AgentMetaBlock'
import { getMemeMarketStrategy } from '../../services/AgentProtocol'
import { playSound } from './SoundManager'
import { DiscoveryNudges } from './GameToasts'

const PROXIMITY_ALERT_DISTANCE = 40

const CAMERA_MODES = ['chase', 'wide', 'hood', 'free'] as const
type CameraMode = typeof CAMERA_MODES[number]
const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  chase: '🎥 Chase',
  wide:  '🔭 Wide',
  hood:  '🏎 Hood',
  free:  '🌐 Free',
}

function CameraModeToggle() {
  const cameraMode = useGameStore(s => s.ui.cameraMode)
  const setUI = useGameStore(s => s.setUI)
  const cycle = () => {
    const idx = CAMERA_MODES.indexOf(cameraMode as CameraMode)
    const next = CAMERA_MODES[(idx + 1) % CAMERA_MODES.length]
    setUI({ cameraMode: next })
  }
  return (
    <button
      onClick={cycle}
      title="Cycle camera mode (right-mouse to look around)"
      className="flex items-center gap-1.5 bg-black/40 hover:bg-white/10 backdrop-blur-xl border border-white/10 rounded-full px-3 py-1.5 shadow transition-all pointer-events-auto"
    >
      <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">
        {CAMERA_MODE_LABELS[cameraMode as CameraMode] ?? '🎥 Chase'}
      </span>
    </button>
  )
}

function getDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

const DOMAIN_LABELS = { wind: 'Wind', lightning: 'Light', dayNight: 'D/N' } as const

interface HUDProps {
  playerId: string
  isMounted: boolean
  onOpenSidebar: () => void
  onToggleQuickControls: () => void
  showQuickControls: boolean
  cloudConfig: CloudConfig
  onApplyPreset: (preset: NonNullable<CloudConfig['preset']>) => void
}

export function HUD(props: HUDProps) {
  const [weatherCollapsed, setWeatherCollapsed] = useState(false)
  const [statusCollapsed, setStatusCollapsed] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  
  const { address } = useAccount()
  const sessions = useGameStore(s => s.sessions)
  const activeWeatherEffects = useGameStore(s => s.activeWeatherEffects)
  const ui = useGameStore(s => s.ui)
  const worldState = useGameStore(s => s.worldState)
  const playerId = useGameStore(s => s.playerId)
  const nearMud = useGameStore(s => s.nearMud)
  const setUI = useGameStore(s => s.setUI)
  const cumulativeScore = useGameStore(s => s.cumulativeScore)
  const round = useGameStore(s => s.round)
  const activeOverrideCount = useGameStore(s =>
    Object.keys(s.steerRetentionOverrides).length
    + Object.keys(s.lateralGripOverrides).length
    + Object.keys(s.accelerationOverrides).length
    + Object.keys(s.maxSpeedOverrides).length
  )
  const activeHumans = useGameStore(s => s.activeHumans)
  const setActiveHumans = useGameStore(s => s.setActiveHumans)

  // Server-synced player count: ping /api/players every 30s
  useEffect(() => {
    const ping = async () => {
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: playerId || 'anonymous' }),
        })
        if (res.ok) {
          const { count } = await res.json()
          if (typeof count === 'number') setActiveHumans(count)
        }
      } catch { /* network error — keep local count */ }
    }
    ping()
    const interval = window.setInterval(ping, 30_000)
    return () => window.clearInterval(interval)
  }, [playerId, setActiveHumans])
  
  const playerSession = sessions['Player']
  const currentStrategy = getMemeMarketStrategy(playerSession?.strategyId)
  const speedBoostRemaining = playerSession?.speedBoostUntil && playerSession.speedBoostUntil > nowMs
    ? Math.ceil((playerSession.speedBoostUntil - nowMs) / 1000)
    : 0
  const antiGravityRemaining = playerSession?.antiGravityUntil && playerSession.antiGravityUntil > nowMs
    ? Math.ceil((playerSession.antiGravityUntil - nowMs) / 1000)
    : 0
  const activeMemeEffects = [
    speedBoostRemaining > 0
      ? { label: 'Speed Boost', value: `${speedBoostRemaining}s` }
      : null,
    antiGravityRemaining > 0
      ? { label: 'Anti-Gravity', value: `${antiGravityRemaining}s` }
      : null,
    playerSession?.drainPlugCount
      ? { label: 'Drain Charges', value: `${playerSession.drainPlugCount}` }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  // Compute nearest player distance
  const nearestDistance = useMemo(() => {
    const myVehicle = worldState.vehicles.find(v => v.id === playerId)
    if (!myVehicle) return null
    const distances = worldState.vehicles
      .filter(v => v.id !== playerId)
      .map(v => getDistance(myVehicle.position, v.position))
      .filter(d => d <= PROXIMITY_ALERT_DISTANCE)
    return distances.length > 0 ? Math.min(...distances) : null
  }, [worldState.vehicles, playerId])

  if (!ui.showHUD) return null

  return (
    <>
      {/* PROXIMITY ALERT: Bottom Left */}
      {nearestDistance !== null && (
        <div className={`absolute bottom-6 left-6 ${UI_Z_INDEX.HUD} pointer-events-none`}>
          <div className="bg-red-500/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-red-400/50 shadow-lg animate-pulse">
            <span className="text-[10px] font-bold text-white uppercase tracking-wider">
              ⚠ RIVAL NEARBY {Math.round(nearestDistance)}m
            </span>
          </div>
        </div>
      )}

      {/* MUD WARNING: Above proximity alert */}
      {nearMud && (
        <div className={`absolute bottom-20 left-6 ${UI_Z_INDEX.HUD} pointer-events-none`}>
          <div className="bg-amber-900/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-amber-500/50 shadow-lg">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
              ⚠ MUD AHEAD
            </span>
          </div>
        </div>
      )}

      {/* TOP LEFT: Live player count + share button + camera mode */}
      <div className={`absolute top-6 left-6 ${UI_Z_INDEX.HUD} flex flex-col gap-2`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-3 py-1.5 shadow pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">
              {activeHumans} {activeHumans === 1 ? 'player' : 'players'} online
            </span>
          </div>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(cumulativeScore > 0 ? `🌩️ I just earned ${cumulativeScore.toFixed(3)} 0G in CLAWDY — AI agents & humans battle to control the weather in a real-time 3D arena! #vibejam2026 #web3gaming` : '🌩️ Just playing CLAWDY — AI agents & humans battle to control the weather in a real-time 3D arena! #vibejam2026 #web3gaming')}&url=${encodeURIComponent('https://clawdy.xyz')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-sky-500/80 hover:bg-sky-400/90 backdrop-blur-xl border border-sky-400/40 rounded-full px-3 py-1.5 shadow transition-all pointer-events-auto"
            aria-label="Share on X / Twitter"
          >
            <span className="text-[11px]">𝕏</span>
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Share</span>
          </a>
          <CameraModeToggle />
        </div>
      </div>

      {/* 1. TOP CENTER: Stacked UI */}
      <div className={`absolute top-6 left-1/2 -translate-x-1/2 ${UI_Z_INDEX.HUD} flex flex-col items-center gap-2 pointer-events-none`}>
        <div className="pointer-events-auto"><WinConditionBar playerId={props.playerId} /></div>
        <div className="pointer-events-auto"><AuctionTimer /></div>
        
        {/* Collapsible Weather */}
        <div className="bg-black/45 backdrop-blur-xl border border-white/15 rounded-2xl p-3 shadow-xl pointer-events-auto w-full max-w-[280px]">
          <div className="flex justify-between items-center mb-1">
             <button 
              onClick={() => setWeatherCollapsed(!weatherCollapsed)} 
              aria-label="Toggle weather domains"
              aria-expanded={!weatherCollapsed}
              className="text-[8px] font-black uppercase text-sky-300"
            >
               {weatherCollapsed ? 'WEATHER (SHOW)' : 'WEATHER (HIDE)'}
             </button>
          </div>
          {!weatherCollapsed && (
            <div className="flex flex-wrap gap-1">
              {Object.values(activeWeatherEffects).map(e => (
                <span key={e.domain} className="px-1.5 py-0.5 bg-white/10 rounded-lg text-[8px] text-white">
                  {DOMAIN_LABELS[e.domain]}: {Math.round(e.intensity * 100)}%
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. BOTTOM RIGHT: Collapsible Status */}
      {/* Flood Level Gauge — fixed left side, independent of other containers */}
      <FloodLevelGauge />

      {/* Higher ground indicator — shows during active floods */}
      <HighGroundIndicator />

      <div className={`absolute bottom-6 right-6 ${UI_Z_INDEX.HUD} flex flex-col gap-2 items-end`}>
        <QueueStatusBadge playerId={props.playerId} />
        
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-3 shadow-xl pointer-events-auto">
          <div className="flex justify-between items-center mb-2 gap-4">
            <span className="text-[9px] font-black text-white/50 uppercase">STATUS</span>
            <button 
              onClick={() => setStatusCollapsed(!statusCollapsed)} 
              aria-label="Toggle status panel"
              aria-expanded={!statusCollapsed}
              className="text-white/30 text-[10px]"
            >
              {statusCollapsed ? '▲' : '▼'}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
               <span className="text-[9px] text-white/50">Vitality</span>
               <div className="w-16 h-1 bg-black/30 rounded-full"><div className="h-full bg-green-500" style={{ width: `${playerSession?.vitality || 0}%` }}/></div>
            </div>
            {!statusCollapsed && (
              <div className="grid grid-cols-2 gap-1 text-[8px] text-white/70">
                <span>Bal: {playerSession?.balance.toFixed(2)}</span>
                <span>Combo: {playerSession?.comboCount}</span>
              </div>
            )}
            <div className="text-[8px] font-bold uppercase tracking-widest text-sky-200/80">
              Strategy: <AgentMetaBlock variant="badge" strategyId={playerSession?.strategyId} prefix={currentStrategy?.icon ? <span>{currentStrategy.icon}</span> : undefined} badgeClassName="text-sky-200/80" />
            </div>
            {cumulativeScore > 0 && (
              <div className="text-[8px] font-bold uppercase tracking-widest text-emerald-200/80">
                Career: {cumulativeScore.toFixed(3)} 0G
              </div>
            )}
            {round.isFinalRush && (
              <FinalRushBadge endsAt={round.endsAt} multiplier={round.finalRushMultiplier} />
            )}
            {activeOverrideCount > 0 && (
              <button
                onClick={() => { setUI({ isSidebarOpen: true, activeTab: 'vehicles', vehiclesTabPulseAt: Date.now() }) }}
                className="flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 cursor-pointer hover:bg-amber-500/20 hover:border-amber-400/40 transition-all"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[8px] font-black uppercase tracking-widest text-amber-200/90">Custom Tuning ({activeOverrideCount})</span>
              </button>
            )}
            {activeMemeEffects.length > 0 && (
              <div className="flex flex-wrap gap-1 text-[8px] text-sky-200/90">
                {activeMemeEffects.map((effect) => (
                  <span key={effect.label} className="rounded-full border border-sky-400/20 bg-sky-500/10 px-1.5 py-0.5 font-bold uppercase tracking-wider">
                    {effect.label} {effect.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>


      {/* Wallet - Top right */}
      <div className="absolute top-6 right-6 z-30">
        <ConnectWallet source="hud_top_right" />
      </div>

      {/* Objective overlay — dismisses after 8s, then collapses to mini bar */}
      <ObjectiveOverlay score={cumulativeScore} />

      {/* Discovery nudges — contextual onchain feature hints */}
      <DiscoveryNudges onOpen={(tab) => {
        setUI({ isSidebarOpen: true, activeTab: tab })
        props.onOpenSidebar()
      }} />

      {/* Wallet upsell - soft prompt for guests, dismissible */}
      {props.isMounted && !address && !ui.hideSpectatorCta && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4">
          <div className="relative rounded-2xl border border-sky-400/20 bg-black/60 backdrop-blur-xl shadow-xl p-4 flex items-center gap-3">
            <span className="text-2xl">🔗</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Save your score on-chain</p>
              <p className="text-[11px] text-white/60 mt-0.5">Connect wallet to unlock abilities &amp; leaderboard</p>
            </div>
            <ConnectWallet
              source="spectator_cta"
              buttonClassName="shrink-0 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-black rounded-xl shadow transition-all"
            />
            <button
              onClick={() => setUI({ hideSpectatorCta: true })}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-white/50 text-[10px] font-black flex items-center justify-center transition-colors"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ObjectiveOverlay({ score }: { score: number }) {
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setExpanded(false), 8000)
    return () => clearTimeout(t)
  }, [])

  if (expanded) {
    return (
      <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-white/15 bg-black/60 backdrop-blur-xl shadow-2xl">
          <span className="text-2xl">🎯</span>
          <div>
            <div className="text-[11px] font-black text-white uppercase tracking-widest">Collect food · Earn 0G · Beat the AI</div>
            <div className="text-[9px] text-white/50 mt-0.5">WASD / Arrows to drive · Space to brake · Win the weather auction for an edge</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-in fade-in duration-700">
      <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-md shadow">
        <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">🎯 Collect food · Earn 0G · Beat the AI</span>
        {score > 0 && (
          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">· {score.toFixed(3)} 0G earned</span>
        )}
      </div>
    </div>
  )
}

function FinalRushBadge({ endsAt, multiplier }: { endsAt: number; multiplier: number }) {
  const [remainingSec, setRemainingSec] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
  const lastSecondRef = useRef<number>(remainingSec)

  useEffect(() => {
    const timer = setInterval(() => {
      const next = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (next !== lastSecondRef.current) {
        if (next === 30) playSound('milestone')
        else if (next < 10 && next > 0) playSound('ui-click')
        lastSecondRef.current = next
        setRemainingSec(next)
      }
    }, 100)
    return () => clearInterval(timer)
  }, [endsAt])

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-red-400/25 bg-red-500/10 px-2 py-0.5 animate-pulse">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
      <span className="text-[8px] font-black uppercase tracking-widest text-red-200">
        Final Rush ×{multiplier} ({remainingSec}s)
      </span>
    </div>
  )
}
