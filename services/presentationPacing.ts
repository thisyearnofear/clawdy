/**
 * First-run presentation pacing.
 *
 * Testers called the opening Clash / Practice slow: a full round is ~1200 ticks
 * × 50ms ≈ 60s at 1×. Playback speed is presentation only — the sim stays
 * fixed-step and deterministic (see ArenaSession.setSpeed) — so a snappier
 * default never touches Match evaluation fairness or Season 0 tick budgets.
 *
 * Policy:
 *  - Unranked Practice / Rush / Skirmish first Plays start at 4× until the
 *    player cycles the speed control.
 *  - Scored Match never auto-bumps (players watch results carefully).
 *  - Beat handlers may pull to 1× for a watchable moment; callers restore the
 *    preferred snappy speed when the tip clears, unless the player chose.
 */

import type { SessionSpeed } from './arenaSession'

export const FIRST_RUN_PLAY_SPEED: SessionSpeed = 4

const PLAYBACK_STORAGE_KEY = 'clawdy_playback_v1'

export interface PlaybackPreference {
  /** Player manually cycled 1× / 2× / 4× at least once. */
  playerChoseSpeed: boolean
  /** Last speed the player picked; ignored until they have chosen. */
  lastSpeed: SessionSpeed | null
}

export interface PlaySpeedInput {
  /** Practice / Rush (incl. Skirmish preview) are unranked; compete is scored. */
  mode: 'practice' | 'practice-deep' | 'rush' | 'compete'
  playerChoseSpeed: boolean
  lastSpeed: SessionSpeed | null
  /** Current presentation speed before this Play press. */
  currentSpeed: SessionSpeed
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    // Storage access can throw in sandboxed iframes; treat as absent.
  }
  return null
}

function asSessionSpeed(value: unknown): SessionSpeed | null {
  return value === 1 || value === 2 || value === 4 ? value : null
}

export function loadPlaybackPreference(): PlaybackPreference {
  const storage = getLocalStorage()
  if (!storage) return { playerChoseSpeed: false, lastSpeed: null }
  try {
    const raw = storage.getItem(PLAYBACK_STORAGE_KEY)
    if (!raw) return { playerChoseSpeed: false, lastSpeed: null }
    const parsed = JSON.parse(raw) as Partial<PlaybackPreference>
    return {
      playerChoseSpeed: parsed.playerChoseSpeed === true,
      lastSpeed: asSessionSpeed(parsed.lastSpeed),
    }
  } catch {
    return { playerChoseSpeed: false, lastSpeed: null }
  }
}

export function savePlaybackPreference(preference: PlaybackPreference): void {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    storage.setItem(PLAYBACK_STORAGE_KEY, JSON.stringify({
      playerChoseSpeed: preference.playerChoseSpeed === true,
      lastSpeed: asSessionSpeed(preference.lastSpeed),
    }))
  } catch {
    // Non-fatal: next session falls back to the snappy first-run default.
  }
}

/** Unranked workbench modes that may receive the snappy first-run default. */
export function isUnrankedPlayMode(mode: PlaySpeedInput['mode']): boolean {
  return mode === 'practice' || mode === 'practice-deep' || mode === 'rush'
}

/**
 * Speed to apply when the player presses Play / Resume from a fresh start.
 * Resume mid-pause keeps `currentSpeed` (do not surprise mid-watch).
 */
export function playStartSpeed(input: PlaySpeedInput): SessionSpeed {
  if (input.playerChoseSpeed) {
    return input.lastSpeed ?? input.currentSpeed
  }
  if (!isUnrankedPlayMode(input.mode)) {
    return input.currentSpeed
  }
  return FIRST_RUN_PLAY_SPEED
}

/**
 * After a watchable beat pulls FF back to 1×, restore the snappy preferred
 * speed once the tip clears — but only while the player has not chosen.
 */
export function speedAfterWatchableTip(input: {
  playerChoseSpeed: boolean
  preferredSpeed: SessionSpeed
  currentSpeed: SessionSpeed
  phaseRunning: boolean
}): SessionSpeed | null {
  if (input.playerChoseSpeed || !input.phaseRunning) return null
  if (input.preferredSpeed <= 1 || input.currentSpeed !== 1) return null
  return input.preferredSpeed
}

/** Button label: keep "4×" short; annotate only while auto-snappy is active. */
export function speedControlLabel(speed: SessionSpeed, autoSnappy: boolean): string {
  if (autoSnappy && speed === FIRST_RUN_PLAY_SPEED) return `${speed}× · snappy`
  return `${speed}×`
}

export function speedControlTitle(autoSnappy: boolean): string {
  if (autoSnappy) {
    return 'Playback speed — presentation only; first unranked Plays start at 4× until you change it. Cycle 1× / 2× / 4×.'
  }
  return 'Playback speed — presentation only; the sim stays deterministic. Cycle 1× / 2× / 4×.'
}

export function skipControlTitle(upcomingLabel: string | null): string {
  if (upcomingLabel) {
    return `Skip ahead to the next ${upcomingLabel} — presentation only; scoring is unchanged.`
  }
  return 'Skip to the final whistle — presentation only; scoring is unchanged.'
}
