import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

describe('Skirmish unlock notifications', () => {
  it('notifies the active workbench and survives storage errors', async () => {
    const target = new EventTarget()
    vi.stubGlobal('window', {
      localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    })
    const { isSkirmishUnlocked, subscribeSkirmishUnlock, unlockSkirmish } = await import('../workbenchRuleset')
    expect(isSkirmishUnlocked()).toBe(false)
    const listener = vi.fn()
    const unsubscribe = subscribeSkirmishUnlock(listener)
    unlockSkirmish()
    expect(listener).toHaveBeenCalledOnce()
    expect(isSkirmishUnlocked()).toBe(true)
    unsubscribe()
    unlockSkirmish()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('restores a persisted unlock without a new publish', async () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => '1' } })
    const { isSkirmishUnlocked } = await import('../workbenchRuleset')
    expect(isSkirmishUnlocked()).toBe(true)
  })
})
