import { beforeEach, describe, expect, it } from 'vitest'
import { clearFunnelLog, formatFunnelLog, getFunnelEvents, recordFunnelEvent } from '../funnelLog'

describe('funnelLog', () => {
  const store = new Map<string, string>()
  const mockLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  }

  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    })
  })

  it('records events with timestamps and survives reload (storage round-trip)', () => {
    recordFunnelEvent('run.start', 'mode=practice')
    recordFunnelEvent('mistake.shown', 'rescue')
    const events = getFunnelEvents()
    expect(events).toHaveLength(2)
    expect(events[0].event).toBe('run.start')
    expect(events[0].detail).toBe('mode=practice')
    expect(events[1].event).toBe('mistake.shown')
    expect(events.every(e => typeof e.at === 'number')).toBe(true)
  })

  it('caps the buffer at the oldest events', () => {
    for (let i = 0; i < 450; i++) recordFunnelEvent(`ev-${i}`)
    const events = getFunnelEvents()
    expect(events).toHaveLength(400)
    expect(events[0].event).toBe('ev-50')
    expect(events[events.length - 1].event).toBe('ev-449')
  })

  it('drops malformed entries when reading', () => {
    store.set('clawdy_funnel_v1', JSON.stringify([{ at: 1, event: 'ok' }, { bad: true }, null, 'x']))
    expect(getFunnelEvents()).toHaveLength(1)
    expect(getFunnelEvents()[0].event).toBe('ok')
  })

  it('formats a readable one-line-per-event dump', () => {
    recordFunnelEvent('train.done', 'loss=0.42')
    const log = formatFunnelLog()
    expect(log).toMatch(/\d{2}:\d{2}:\d{2} train\.done — loss=0\.42/)
  })

  it('clears', () => {
    recordFunnelEvent('x')
    clearFunnelLog()
    expect(getFunnelEvents()).toEqual([])
  })

  it('is silent when storage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, writable: true, configurable: true })
    expect(() => recordFunnelEvent('x')).not.toThrow()
    expect(getFunnelEvents()).toEqual([])
  })
})
