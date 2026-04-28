import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApprovalGate } from '../ApprovalGate'
import type { SkillDecision } from '../skillEngine'

function makeDecision(overrides?: Partial<SkillDecision>): SkillDecision {
  return {
    agentId: 'Scout-1',
    provider: 'local-policy',
    title: 'Test decision',
    summary: 'Test summary',
    action: 'route',
    confidence: 0.8,
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('ApprovalGate', () => {
  let gate: ApprovalGate

  beforeEach(() => {
    gate = new ApprovalGate()
  })

  describe('requestApproval', () => {
    it('returns a promise that resolves when approval is resolved', async () => {
      const promise = gate.requestApproval('Scout-1', makeDecision())
      gate.resolveApproval('Scout-1', true)
      expect(await promise).toBe(true)
    })

    it('resolves with false when rejected', async () => {
      const promise = gate.requestApproval('Scout-1', makeDecision())
      gate.resolveApproval('Scout-1', false)
      expect(await promise).toBe(false)
    })

    it('prevents stacking — returns false if already pending', () => {
      gate.requestApproval('Scout-1', makeDecision())
      const result = gate.requestApproval('Scout-1', makeDecision())
      expect(result).resolves.toBe(false)
    })
  })

  describe('resolveApproval', () => {
    it('returns true when a pending approval exists', () => {
      gate.requestApproval('Scout-1', makeDecision())
      expect(gate.resolveApproval('Scout-1', true)).toBe(true)
    })

    it('returns false when no pending approval exists', () => {
      expect(gate.resolveApproval('Scout-1', true)).toBe(false)
    })

    it('removes the pending approval after resolving', () => {
      gate.requestApproval('Scout-1', makeDecision())
      gate.resolveApproval('Scout-1', true)
      expect(gate.hasPendingApproval('Scout-1')).toBe(false)
    })
  })

  describe('getPendingApprovals', () => {
    it('returns all pending approvals', () => {
      gate.requestApproval('Scout-1', makeDecision({ agentId: 'Scout-1' }))
      gate.requestApproval('Weather-1', makeDecision({ agentId: 'Weather-1' }))
      const pending = gate.getPendingApprovals()
      expect(pending).toHaveLength(2)
      expect(pending.map(p => p.agentId)).toContain('Scout-1')
      expect(pending.map(p => p.agentId)).toContain('Weather-1')
    })

    it('returns empty array when no approvals pending', () => {
      expect(gate.getPendingApprovals()).toHaveLength(0)
    })
  })

  describe('cleanupAgent', () => {
    it('resolves pending promise with false', async () => {
      const promise = gate.requestApproval('Scout-1', makeDecision())
      gate.cleanupAgent('Scout-1')
      expect(await promise).toBe(false)
    })

    it('removes the pending approval', () => {
      gate.requestApproval('Scout-1', makeDecision())
      gate.cleanupAgent('Scout-1')
      expect(gate.hasPendingApproval('Scout-1')).toBe(false)
    })

    it('does nothing for unknown agent', () => {
      expect(() => gate.cleanupAgent('unknown')).not.toThrow()
    })
  })
})
