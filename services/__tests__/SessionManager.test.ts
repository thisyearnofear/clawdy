import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../EconomyEngine', () => ({
  economyEngine: {
    authorizeAgent: vi.fn((agentId: string, duration: number, balance: number) => ({
      agentId,
      role: 'scout',
      mission: 'Test',
      vehicleId: `vehicle-${agentId}`,
      activeUntil: Date.now() + duration,
      permissions: [],
      totalPaid: 0,
      totalEarned: 0,
      vitality: 100,
      burden: 0,
      balance,
      targetAssetId: null,
      autoPilot: false,
      decisionCount: 0,
      executedBidCount: 0,
      executedRentCount: 0,
      collectedCount: 0,
      comboCount: 0,
      comboMultiplier: 1,
      comboExpiresAt: 0,
      lastCollectAt: 0,
    })),
  },
}))

import { SessionManager } from '../SessionManager'

describe('SessionManager', () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager()
  })

  describe('authorizeAgent', () => {
    it('creates a new session', () => {
      manager.authorizeAgent('Scout-1', 60000, 2.0)
      const session = manager.getSession('Scout-1')
      expect(session).toBeDefined()
      expect(session?.balance).toBe(2.0)
    })

    it('returns true if session already exists', () => {
      manager.authorizeAgent('Scout-1', 60000, 2.0)
      expect(manager.authorizeAgent('Scout-1', 60000, 5.0)).toBe(true)
    })

    it('does not overwrite existing session', () => {
      manager.authorizeAgent('Scout-1', 60000, 2.0)
      manager.authorizeAgent('Scout-1', 60000, 5.0)
      expect(manager.getSession('Scout-1')?.balance).toBe(2.0)
    })
  })

  describe('getSession', () => {
    it('returns undefined for unknown agent', () => {
      expect(manager.getSession('unknown')).toBeUndefined()
    })
  })

  describe('getSessions', () => {
    it('returns all active sessions', () => {
      manager.authorizeAgent('Scout-1', 60000)
      manager.authorizeAgent('Weather-1', 60000)
      expect(manager.getSessions()).toHaveLength(2)
    })
  })

  describe('toggleAutoPilot', () => {
    it('toggles autopilot on', () => {
      manager.authorizeAgent('Scout-1', 60000)
      manager.toggleAutoPilot('Scout-1')
      expect(manager.getSession('Scout-1')?.autoPilot).toBe(true)
    })

    it('toggles autopilot off', () => {
      manager.authorizeAgent('Scout-1', 60000)
      manager.toggleAutoPilot('Scout-1')
      manager.toggleAutoPilot('Scout-1')
      expect(manager.getSession('Scout-1')?.autoPilot).toBe(false)
    })

    it('does nothing for unknown agent', () => {
      expect(() => manager.toggleAutoPilot('unknown')).not.toThrow()
    })
  })

  describe('removeDeadAgent', () => {
    it('removes the agent from sessions', () => {
      manager.authorizeAgent('Scout-1', 60000)
      manager.removeDeadAgent('Scout-1')
      expect(manager.getSession('Scout-1')).toBeUndefined()
    })

    it('adds to graveyard', () => {
      manager.authorizeAgent('Scout-1', 60000)
      manager.removeDeadAgent('Scout-1')
      expect(manager.getGraveyard()).toHaveLength(1)
      expect(manager.getGraveyard()[0].agentId).toBe('Scout-1')
    })

    it('caps graveyard at 20 entries', () => {
      for (let i = 0; i < 25; i++) {
        manager.authorizeAgent(`Agent-${i}`, 60000)
        manager.removeDeadAgent(`Agent-${i}`)
      }
      expect(manager.getGraveyard()).toHaveLength(20)
    })

    it('returns undefined for unknown agent', () => {
      expect(manager.removeDeadAgent('unknown')).toBeUndefined()
    })
  })

  describe('applyRestoredState', () => {
    it('restores balance and stats to existing sessions', () => {
      manager.authorizeAgent('Scout-1', 60000)
      manager.applyRestoredState({
        'Scout-1': { balance: 5.0, totalEarned: 3.0, collectedCount: 10 },
      })
      const session = manager.getSession('Scout-1')
      expect(session?.balance).toBe(5.0)
      expect(session?.totalEarned).toBe(3.0)
    })

    it('ignores unknown session IDs', () => {
      expect(() => manager.applyRestoredState({
        'unknown': { balance: 5.0 },
      })).not.toThrow()
    })
  })

  describe('logout', () => {
    it('deletes Player session and re-creates it', () => {
      manager.authorizeAgent('Player', 60000, 5.0)
      manager.logout()
      const player = manager.getSession('Player')
      expect(player).toBeDefined()
      expect(player?.balance).toBe(10.0)
    })
  })
})
