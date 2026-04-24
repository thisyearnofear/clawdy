import type { SkillDecision } from './skillEngine'

interface PendingApproval {
  resolve: (approved: boolean) => void
  decision: SkillDecision
}

/**
 * ApprovalGate manages the approval flow for agent actions when autopilot is off.
 * Agents request approval; the UI (AgentTerminal) resolves them with APPROVE/REJECT.
 */
export class ApprovalGate {
  private pendingApprovals: Map<string, PendingApproval> = new Map()

  /** Create a pending approval for an agent action. Returns a promise that resolves when the player approves/rejects. */
  requestApproval(agentId: string, decision: SkillDecision): Promise<boolean> {
    // Prevent stacking: if an approval is already pending for this agent, reject the new one
    if (this.pendingApprovals.has(agentId)) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      this.pendingApprovals.set(agentId, { resolve, decision })
    })
  }

  /** Resolve a pending approval — called by the UI (AgentTerminal) when the player clicks APPROVE/REJECT. */
  resolveApproval(agentId: string, approved: boolean): boolean {
    const pending = this.pendingApprovals.get(agentId)
    if (!pending) return false
    pending.resolve(approved)
    this.pendingApprovals.delete(agentId)
    return true
  }

  /** Get all currently pending approvals (for UI polling). */
  getPendingApprovals(): Array<{ agentId: string; decision: SkillDecision }> {
    return Array.from(this.pendingApprovals.entries()).map(([agentId, { decision }]) => ({
      agentId,
      decision,
    }))
  }

  /** Check if an agent has a pending approval. */
  hasPendingApproval(agentId: string): boolean {
    return this.pendingApprovals.has(agentId)
  }

  /** Clean up approvals for a dead or removed agent. Resolves any pending promise with false. */
  cleanupAgent(agentId: string): void {
    const pending = this.pendingApprovals.get(agentId)
    if (pending) {
      pending.resolve(false)
      this.pendingApprovals.delete(agentId)
    }
  }
}

// No module-level singleton — the AgentProtocol facade owns the instance
