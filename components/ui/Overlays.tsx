'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../../services/gameStore'
import { OnboardingOverlay } from './OnboardingOverlay'
import { GameToasts, BidWinCelebration } from './GameToasts'
import { SoundManager } from './SoundManager'
import { EconomyFeedback } from './EconomyFeedback'
import { MobileTouchControls } from './MobileTouchControls'
import { RoundRecap } from './RoundRecap'
import { FinalRushOverlay } from './FinalRushOverlay'
import { WeatherGradeOverlay } from './WeatherGradeOverlay'
import { LightningFlashOverlay } from './LightningFlashOverlay'
import { emitToast } from './GameToasts'
import { playSound } from './SoundManager'

interface OverlaysProps {
  showOnboarding: boolean
  onDoneOnboarding: (preferredVehicleType?: 'speedster' | 'truck') => void
  bidWinPreset: string | null
  onDoneBidWin: () => void
}

export function Overlays({
  showOnboarding,
  onDoneOnboarding,
  bidWinPreset,
  onDoneBidWin
}: OverlaysProps) {
  const flood = useGameStore(s => s.flood)
  const ui = useGameStore(s => s.ui)
  const setUI = useGameStore(s => s.setUI)
  const setModalOpen = useGameStore(s => s.setModalOpen)
  const lastFloodPhaseRef = useRef<typeof flood.phase>('idle')

  // Keep a single source of truth for "blocking" overlays.
  useEffect(() => {
    setModalOpen('onboarding', showOnboarding)
  }, [setModalOpen, showOnboarding])

  const isBlockingOverlayOpen =
    ui.modals.wallet || ui.modals.onboarding || ui.modals.recap || ui.modals.spectatorCta

  // Mobile declutter: if a blocking overlay is open, close secondary UI surfaces.
  useEffect(() => {
    if (!isBlockingOverlayOpen) return
    // Keep these centralized so other components stay dumb.
    setUI({ showQuickControls: false, isSidebarOpen: false })
  }, [isBlockingOverlayOpen, setUI])

  // Flood phase callouts (no new components; keep this centralized).
  useEffect(() => {
    const phase = flood.phase
    const prev = lastFloodPhaseRef.current
    if (phase === prev) return
    lastFloodPhaseRef.current = phase

    if (phase === 'rising') {
      emitToast('milestone', 'Flood Rising', 'Get to higher ground (or find bubbles)')
      playSound('ui-click')
    } else if (phase === 'peak') {
      emitToast('milestone', 'High Water!', 'Movement gets heavy in the flood')
      playSound('milestone')
    } else if (phase === 'draining') {
      emitToast('milestone', 'Waters Recede', 'Back to dry land… for now')
      playSound('ui-click')
    }
  }, [flood.phase])

  return (
    <>
      {/* Onboarding */}
      {showOnboarding && (
        <OnboardingOverlay onDone={(v) => onDoneOnboarding(v)} />
      )}

      {/* Global color grading / vignette */}
      <WeatherGradeOverlay />

      {/* Final 10 seconds */}
      <FinalRushOverlay />

      {/* Lightning flashes */}
      <LightningFlashOverlay />

      {/* End-of-round recap */}
      <RoundRecap />

      {/* Bid win celebration */}
      {bidWinPreset && (
        <BidWinCelebration preset={bidWinPreset} onDone={onDoneBidWin} />
      )}

      {/* Toast notifications */}
      <GameToasts />

      {/* Sound manager */}
      <SoundManager />

      {/* Economy feedback floaters */}
      <EconomyFeedback />

      {/* Mobile touch controls */}
      <MobileTouchControls />

      {/* Underwater screen overlay - only visible when player is actually submerged */}
      {flood.active && flood.level > -1 && (
        <UnderwaterOverlay />
      )}
    </>
  )
}

// Simple underwater overlay - only visible when player is actually in water
function UnderwaterOverlay() {
  const playerWater = useGameStore(s => s.playerWater)
  const inWater = playerWater.inWater && playerWater.depth > 0.1

  // Depth-based opacity: deeper = more visible, capped at 0.35 (much lighter than before)
  const depthOpacity = inWater ? Math.min(0.35, playerWater.depth * 0.25) : 0

  const bubbles = useMemo(() => 
    [...Array(8)].map((_, i) => ({
      key: i,
      size: 2 + (i * 0.3) % 3,
      left: (i * 7.3) % 100,
      duration: 2 + (i * 0.17) % 3,
      delay: (i * 0.23) % 2,
    })), [])

  if (!inWater) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[25]"
      style={{
        background: `linear-gradient(180deg, 
          rgba(10, 25, 47, ${depthOpacity * 0.6}) 0%, 
          rgba(20, 60, 90, ${depthOpacity * 0.8}) 60%,
          rgba(10, 30, 60, ${depthOpacity}) 100%)`,
        transition: 'opacity 0.3s ease',
      }}
    >
      {/* Animated bubble particles */}
      <div className="absolute inset-0 overflow-hidden">
        {bubbles.map(b => (
          <div
            key={b.key}
            className="absolute rounded-full bg-white/20 animate-pulse"
            style={{
              width: `${b.size}px`,
              height: `${b.size}px`,
              left: `${b.left}%`,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`,
            }}
          />
        ))}
      </div>
      
      {/* Depth indicator — bottom-left, clear of other HUD */}
      <div className="absolute bottom-6 left-6">
        <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 border border-blue-400/20">
          <span className="text-blue-200 text-[10px] font-bold tracking-wider">
            🌊 {playerWater.depth.toFixed(1)}m deep
          </span>
        </div>
      </div>
    </div>
  )
}
