import { useSyncExternalStore } from 'react'

export const FLAVOUR_ZH_KEY = 'clawdy_flavour_zh_v1'
const EVENT = 'clawdy:flavour-zh'
let sessionValue = false

/** Optional Chinese proverbs shown beside the English copy. Off unless the player turns them on. */
export function isFlavourZhOn(): boolean {
  try { return sessionValue || (typeof window !== 'undefined' && window.localStorage.getItem(FLAVOUR_ZH_KEY) === '1') }
  catch { return sessionValue }
}

export function setFlavourZh(on: boolean): void {
  sessionValue = on
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(FLAVOUR_ZH_KEY, on ? '1' : '0') } catch { /* Session value still applies. */ }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

export function useFlavourZh(): boolean {
  return useSyncExternalStore(subscribe, isFlavourZhOn, () => false)
}

/** The proverbs, each paired with the English idea it sits beside. */
export const PROVERBS = {
  handoff: '师傅领进门，修行在个人',
  receipt: '教学相长',
  student: '因材施教',
  surpass: '青出于蓝',
} as const

/** English is always shown; the proverb is appended only when the toggle is on. */
export function withProverb(english: string, proverb: string, on: boolean): string {
  return on ? `${english} ${proverb}` : english
}
