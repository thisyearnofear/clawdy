import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../agents', () => ({
  getAgentRole: vi.fn(() => 'scout'),
  getAgentMission: vi.fn(() => 'Test mission'),
  getAgentVehicleId: vi.fn(() => 'vehicle-scout'),
}))

vi.mock('../protocolTypes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../protocolTypes')>()
  return {
    ...actual,
    AGENT_ROLE_CONFIG: {
      scout: { permissions: ['wallet_connect', 'vehicle_control'] },
      weather: { permissions: ['wallet_connect', 'weather_control'] },
      mobility: { permissions: ['wallet_connect', 'vehicle_control'] },
      treasury: { permissions: ['wallet_connect', 'spend_policy'] },
      operator: { permissions: ['wallet_connect', 'vehicle_control', 'weather_control', 'spend_policy'] },
    },
  }
})

vi.mock('../components/environment/MemeAssets', () => ({
  MemeAssetStats: {},
}))

import { EconomyEngine } from '../EconomyEngine'

describe('EconomyEngine', () => {
  let engine: EconomyEngine

  beforeEach(() => {
    engine = new EconomyEngine()
    vi.spyOn(Date, 'now').mockReturnValue(1000000)
  })

  describe('authorizeAgent', () => {
    it('creates a session with correct defaults', () => {
      const session = engine.authorizeAgent('Scout-1', 60000, 2.0)
      expect(session.agentId).toBe('Scout-1')
      expect(session.balance).toBe(2.0)
      expect(session.vitality).toBe(100)
      expect(session.burden).toBe(0)
      expect(session.collectedCount).toBe(0)
      expect(session.comboMultiplier).toBe(1)
    })

    it('sets activeUntil based on duration', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      expect(session.activeUntil).toBe(1060000)
    })

    it('uses default balance of 1.0', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      expect(session.balance).toBe(1.0)
    })
  })

  describe('tickDegradation', () => {
    it('decreases vitality over time', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      engine.tickDegradation(session, 10)
      expect(session.vitality).toBeLessThan(100)
    })

    it('does not degrade Player sessions', () => {
      const session = engine.authorizeAgent('Player', 60000)
      const initialVitality = session.vitality
      engine.tickDegradation(session, 10)
      expect(session.vitality).toBe(initialVitality)
    })

    it('marks session as dead when vitality reaches 0', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      session.vitality = 0.1
      engine.tickDegradation(session, 10)
      expect(session.isDead).toBe(true)
    })

    it('clamps vitality at 0', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      session.vitality = 0.01
      engine.tickDegradation(session, 100)
      expect(session.vitality).toBe(0)
    })
  })

  describe('collectAsset', () => {
    it('increases collectedCount', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      engine.collectAsset(session, { type: 'default', rarity: 'common' } as any)
      expect(session.collectedCount).toBe(1)
    })

    it('applies rarity multiplier to earnings', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      const commonResult = engine.collectAsset(session, { type: 'default', rarity: 'common' } as any)
      const session2 = engine.authorizeAgent('Scout-2', 60000)
      const legendaryResult = engine.collectAsset(session2, { type: 'default', rarity: 'legendary' } as any)
      expect(legendaryResult.earned).toBeGreaterThan(commonResult.earned)
    })

    it('clamps vitality between 0 and 100', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      session.vitality = 95
      engine.collectAsset(session, { type: 'default', rarity: 'common' } as any)
      expect(session.vitality).toBeLessThanOrEqual(100)
    })

    it('clamps burden between 0 and 100', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      session.burden = 5
      engine.collectAsset(session, { type: 'default', rarity: 'common' } as any)
      expect(session.burden).toBeGreaterThanOrEqual(0)
    })

    it('applies combo multiplier to earnings', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      session.comboMultiplier = 3
      const result = engine.collectAsset(session, { type: 'default', rarity: 'common' } as any)
      const session2 = engine.authorizeAgent('Scout-2', 60000)
      session2.comboMultiplier = 1
      const result2 = engine.collectAsset(session2, { type: 'default', rarity: 'common' } as any)
      expect(result.earned).toBeGreaterThan(result2.earned)
    })

    it('grants speed boost on spicy_pepper', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      engine.collectAsset(session, { type: 'spicy_pepper', rarity: 'common' } as any)
      expect(session.speedBoostUntil).toBe(1010000)
    })

    it('grants anti-gravity on floaty_marshmallow', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      engine.collectAsset(session, { type: 'floaty_marshmallow', rarity: 'common' } as any)
      expect(session.antiGravityUntil).toBe(1008000)
    })

    it('reduces burden on air_bubble', () => {
      const session = engine.authorizeAgent('Scout-1', 60000)
      session.burden = 20
      engine.collectAsset(session, { type: 'air_bubble', rarity: 'common' } as any)
      expect(session.burden).toBe(12)
    })
  })
})
