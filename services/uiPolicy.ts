'use client'

import type { UIState } from './gameStore'

export function isBlockingModalOpen(modals: UIState['modals']) {
  return !!(modals.wallet || modals.onboarding || modals.recap || modals.spectatorCta)
}

