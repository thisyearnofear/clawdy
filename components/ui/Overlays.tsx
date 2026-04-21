'use client'

import { useEffect, useRef } from 'react'
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
  onDoneOnboarding: () => void
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
        <OnboardingOverlay onDone={onDoneOnboarding} />
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
    </>
  )
}
