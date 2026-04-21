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
  const lastFloodPhaseRef = useRef<typeof flood.phase>('idle')

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
