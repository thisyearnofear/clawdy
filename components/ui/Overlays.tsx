'use client'

import { OnboardingOverlay } from './OnboardingOverlay'
import { GameToasts, BidWinCelebration } from './GameToasts'
import { SoundManager } from './SoundManager'
import { EconomyFeedback } from './EconomyFeedback'
import { MobileTouchControls } from './MobileTouchControls'
import { RoundRecap } from './RoundRecap'
import { FinalRushOverlay } from './FinalRushOverlay'
import { WeatherGradeOverlay } from './WeatherGradeOverlay'
import { LightningFlashOverlay } from './LightningFlashOverlay'

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
