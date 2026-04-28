import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../zgStorage', () => ({
  zgSaveState: vi.fn().mockResolvedValue({ rootHash: '0xabc', txHash: '0xdef' }),
  zgLoadState: vi.fn().mockResolvedValue({ state: null }),
  zgHealth: vi.fn().mockResolvedValue({ ok: true, configured: true, network: 'mainnet' }),
}))

vi.mock('../gameStore', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      steerRetentionOverrides: {},
      lateralGripOverrides: {},
      accelerationOverrides: {},
      maxSpeedOverrides: {},
      setZgStorage: vi.fn(),
      setSteerRetentionOverride: vi.fn(),
      setLateralGripOverride: vi.fn(),
      setAccelerationOverride: vi.fn(),
      setMaxSpeedOverride: vi.fn(),
    })),
  },
}))

import { PersistenceService } from '../PersistenceService'

describe('PersistenceService', () => {
  let service: PersistenceService
  let mockLocalStorage: Record<string, string>

  beforeEach(() => {
    vi.useFakeTimers()
    mockLocalStorage = {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { mockLocalStorage[key] = value }),
        removeItem: vi.fn((key: string) => { delete mockLocalStorage[key] }),
      },
      writable: true,
    })
    Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true })
    service = new PersistenceService()
  })

  describe('persistState', () => {
    it('saves sessions to localStorage', () => {
      const sessions = new Map([
        ['Scout-1', {
          balance: 2.5,
          totalEarned: 1.5,
          totalPaid: 0.5,
          collectedCount: 10,
          executedBidCount: 1,
          executedRentCount: 0,
          vitality: 80,
          burden: 20,
          decisionCount: 5,
        }],
      ])
      service.persistState(sessions)
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'clawdy:sessions',
        expect.any(String),
      )
    })

    it('saves timestamp', () => {
      service.persistState(new Map())
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'clawdy:timestamp',
        expect.any(String),
      )
    })
  })

  describe('restoreState', () => {
    it('restores from localStorage when data is fresh', async () => {
      mockLocalStorage['clawdy:timestamp'] = Date.now().toString()
      mockLocalStorage['clawdy:sessions'] = JSON.stringify({
        'Scout-1': { balance: 3.0 },
      })
      const callback = vi.fn()
      await service.restoreState(callback)
      expect(callback).toHaveBeenCalledWith({ 'Scout-1': { balance: 3.0 } })
    })

    it('does not restore stale localStorage data', async () => {
      mockLocalStorage['clawdy:timestamp'] = (Date.now() - 7200000).toString()
      mockLocalStorage['clawdy:sessions'] = JSON.stringify({
        'Scout-1': { balance: 3.0 },
      })
      const callback = vi.fn()
      await service.restoreState(callback)
      expect(callback).not.toHaveBeenCalled()
    })
  })
})
