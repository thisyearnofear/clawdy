import { AgentSession, AgentRole, AGENT_ROLE_CONFIG } from './AgentProtocol'
import { getAgentMission, getAgentRole, getAgentVehicleId } from './agents'
import { FoodStats } from '../components/environment/ProceduralFood'

export class EconomyEngine {
  constructor() {}

  authorizeAgent(agentId: string, duration: number, initialBalance: number = 1.0): AgentSession {
    const role = getAgentRole(agentId)
    const config = AGENT_ROLE_CONFIG[role]
    return {
      agentId,
      role,
      mission: getAgentMission(agentId),
      vehicleId: getAgentVehicleId(agentId),
      activeUntil: Date.now() + duration,
      permissions: config.permissions,
      totalPaid: 0,
      totalEarned: 0,
      vitality: 100,
      burden: 0,
      balance: initialBalance,
      targetFoodId: null,
      autoPilot: false,
      decisionCount: 0,
      executedBidCount: 0,
      executedRentCount: 0,
      collectedCount: 0,
    }
  }

  collectFood(session: AgentSession, stats: FoodStats): { earned: number; vitalityGain: number; burdenGain: number } {
    session.collectedCount += 1
    const earned = stats.nutrition === 'healthy' ? 0.002 : 0.0005
    let vitalityGain = 0
    let burdenGain = 0

    if (stats.nutrition === 'healthy') {
      vitalityGain = 10
      burdenGain = -5
    } else {
      vitalityGain = -5
      burdenGain = 15
    }

    session.vitality = Math.max(0, Math.min(100, session.vitality + vitalityGain))
    session.burden = Math.max(0, Math.min(100, session.burden + burdenGain))
    session.balance += earned
    session.totalEarned += earned

    return { earned, vitalityGain, burdenGain }
  }
}

export const economyEngine = new EconomyEngine()
