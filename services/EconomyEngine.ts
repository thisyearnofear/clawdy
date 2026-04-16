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

  tickDegradation(session: AgentSession, deltaSeconds: number) {
    if (session.agentId === 'Player' || session.isDead) return

    // Base decay: -1 vitality every 5 seconds
    const decayRate = 0.2
    session.vitality = Math.max(0, session.vitality - decayRate * deltaSeconds)
    
    // Burden increases fatigue
    if (session.burden > 50) {
      session.vitality = Math.max(0, session.vitality - decayRate * deltaSeconds * 0.5)
    }

    if (session.vitality <= 0) {
      session.isDead = true
    }
  }

  collectFood(session: AgentSession, stats: FoodStats): { earned: number; vitalityGain: number; burdenGain: number } {
    session.collectedCount += 1
    let earned = 0.002
    let vitalityGain = 10
    let burdenGain = -5

    // Specialized Food Logic
    switch (stats.type) {
      case 'golden_meatball':
        earned = 0.01
        vitalityGain = 25
        burdenGain = -15
        break
      case 'spicy_pepper':
        session.speedBoostUntil = Date.now() + 10000 // 10s speed boost
        vitalityGain = 5
        burdenGain = 10
        break
      case 'floaty_marshmallow':
        session.antiGravityUntil = Date.now() + 8000 // 8s anti-gravity
        vitalityGain = 2
        burdenGain = -20
        break
      default: // meatball
        earned = 0.002
        vitalityGain = 10
        burdenGain = -5
    }

    session.vitality = Math.max(0, Math.min(100, session.vitality + vitalityGain))
    session.burden = Math.max(0, Math.min(100, session.burden + burdenGain))
    session.balance += earned
    session.totalEarned += earned

    return { earned, vitalityGain, burdenGain }
  }
}

export const economyEngine = new EconomyEngine()
