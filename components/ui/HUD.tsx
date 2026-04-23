'use client'

import { useState, useMemo } from 'react'
import { WinConditionBar } from './WinConditionBar'
import { AuctionTimer } from './AuctionTimer'
import { AgentTerminal } from './AgentTerminal'
import { useGameStore } from '../../services/gameStore'
import { QueueStatusBadge } from './QueueStatusBadge'
import { CloudConfig } from '../environment/CloudManager'
import { UI_Z_INDEX } from '../../services/uiConstants'

const PROXIMITY_ALERT_DISTANCE = 40

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
  
  const sessions = useGameStore(s => s.sessions)
  const activeWeatherEffects = useGameStore(s => s.activeWeatherEffects)
  const ui = useGameStore(s => s.ui)
  const worldState = useGameStore(s => s.worldState)
  const playerId = useGameStore(s => s.playerId)
  const nearMud = useGameStore(s => s.nearMud)
  
  const playerSession = sessions['Player']

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
          </div>
        </div>
      </div>

      {/* Wallet - Top right */}
      <div className="absolute top-6 right-6 z-30">
        <ConnectWallet source="hud_top_right" />
      </div>

      {/* Spectator CTA - Center */}
      {props.isMounted && !address && !ui.hideSpectatorCta && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-white/20 bg-black/55 backdrop-blur-xl shadow-2xl p-5 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-300">Live Agent Arena</p>
            <p className="mt-2 text-sm font-semibold text-white">Connect wallet to join the queue and drive vehicles.</p>
            <div className="mt-4 flex justify-center">
              <ConnectWallet
                source="spectator_cta"
                buttonClassName="group px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-black rounded-xl shadow-lg transition-all flex items-center gap-2"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
