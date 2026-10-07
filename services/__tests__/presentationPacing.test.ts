import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIRST_RUN_PLAY_SPEED,
  isUnrankedPlayMode,
  loadPlaybackPreference,
  playStartSpeed,
  savePlaybackPreference,
  skipControlTitle,
  speedAfterWatchableTip,
  speedControlLabel,
  speedControlTitle,
} from '../presentationPacing'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isUnrankedPlayMode', () => {
  it('treats Practice and Rush/Skirmish as unranked', () => {
    expect(isUnrankedPlayMode('practice')).toBe(true)
    expect(isUnrankedPlayMode('practice-deep')).toBe(true)
    expect(isUnrankedPlayMode('rush')).toBe(true)
    expect(isUnrankedPlayMode('compete')).toBe(false)
  })
})

describe('playStartSpeed', () => {
  it('starts first unranked Play at 4× when the player has not chosen', () => {
    expect(playStartSpeed({
      mode: 'practice',
      playerChoseSpeed: false,
      lastSpeed: null,
      currentSpeed: 1,
    })).toBe(FIRST_RUN_PLAY_SPEED)
    expect(playStartSpeed({
      mode: 'rush',
      playerChoseSpeed: false,
      lastSpeed: null,
      currentSpeed: 1,
    })).toBe(4)
  })

  it('does not auto-bump scored Match', () => {
    expect(playStartSpeed({
      mode: 'compete',
      playerChoseSpeed: false,
      lastSpeed: null,
      currentSpeed: 1,
    })).toBe(1)
  })

  it('keeps the player\'s chosen speed afterwards', () => {
    expect(playStartSpeed({
      mode: 'practice',
      playerChoseSpeed: true,
      lastSpeed: 2,
      currentSpeed: 1,
    })).toBe(2)
    expect(playStartSpeed({
      mode: 'rush',
      playerChoseSpeed: true,
      lastSpeed: 1,
      currentSpeed: 4,
    })).toBe(1)
  })
})

describe('speedAfterWatchableTip', () => {
  it('restores preferred snappy speed after a beat pulls to 1×', () => {
    expect(speedAfterWatchableTip({
      playerChoseSpeed: false,
      preferredSpeed: 4,
      currentSpeed: 1,
      phaseRunning: true,
    })).toBe(4)
  })

  it('does nothing once the player has chosen, or while already fast', () => {
    expect(speedAfterWatchableTip({
      playerChoseSpeed: true,
      preferredSpeed: 4,
      currentSpeed: 1,
      phaseRunning: true,
    })).toBeNull()
    expect(speedAfterWatchableTip({
      playerChoseSpeed: false,
      preferredSpeed: 4,
      currentSpeed: 4,
      phaseRunning: true,
    })).toBeNull()
    expect(speedAfterWatchableTip({
      playerChoseSpeed: false,
      preferredSpeed: 4,
      currentSpeed: 1,
      phaseRunning: false,
    })).toBeNull()
  })
})

describe('speed / skip control copy', () => {
  it('annotates the auto-snappy first-run speed', () => {
    expect(speedControlLabel(4, true)).toBe('4× · snappy')
    expect(speedControlLabel(4, false)).toBe('4×')
    expect(speedControlLabel(2, true)).toBe('2×')
    expect(speedControlTitle(true)).toMatch(/first unranked Plays start at 4×/)
    expect(skipControlTitle('clash')).toMatch(/Skip ahead to the next clash/)
    expect(skipControlTitle(null)).toMatch(/final whistle/)
  })
})

describe('playback preference storage', () => {
  it('round-trips a chosen speed through localStorage', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
      },
    })
    expect(loadPlaybackPreference()).toEqual({ playerChoseSpeed: false, lastSpeed: null })
    savePlaybackPreference({ playerChoseSpeed: true, lastSpeed: 2 })
    expect(loadPlaybackPreference()).toEqual({ playerChoseSpeed: true, lastSpeed: 2 })
  })

  it('ignores corrupt storage', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => '{not-json',
        setItem: () => { /* noop */ },
      },
    })
    expect(loadPlaybackPreference()).toEqual({ playerChoseSpeed: false, lastSpeed: null })
  })
})
