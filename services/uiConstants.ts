// Centralized UI z-index constants
// All components should use these instead of hardcoded values
export const UI_Z_INDEX = {
  BACKGROUND: 'z-0',
  WORLD: 'z-10',
  HUD: 'z-20',
  UNDERWATER: 'z-[25]',
  WIDGET: 'z-30',
  MODAL_OVERLAY: 'z-40',
  TERMINAL: 'z-50',
  WEATHER_OVERLAY: 'z-[70]',
  FINAL_RUSH: 'z-[80]',
  LIGHTNING: 'z-[85]',
  CELEBRATION: 'z-[90]',
  ROUND_RECAP: 'z-[95]',
  ONBOARDING: 'z-[100]',
  AUCTION_FLASH: 'z-[200]',
} as const

export type HUDMode = 'full' | 'minimal' | 'hidden'
