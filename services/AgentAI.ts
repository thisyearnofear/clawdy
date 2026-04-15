import { evaluateAgentDecision, SkillDecision } from './skillEngine'
import { AgentSession, WorldState, agentProtocol, VehicleType } from './AgentProtocol'
import { getControllableAgents } from './agents'

export class AgentAI {
  private static readonly AUTO_BID_COOLDOWN_MS = 15000
  private static readonly AUTO_RENT_COOLDOWN_MS = 20000
  private static readonly AGENT_TICK_INTERVAL = 250
  
  private lastAgentTickAt = 0
  private lastAutomatedBidAt: Map<string, number> = new Map()
  private lastAutomatedRentAt: Map<string, number> = new Map()

  constructor() {
    if (typeof window !== 'undefined') {
       // Defer to avoid circular initialization issues
       setTimeout(() => {
         agentProtocol.subscribeToState((state) => this.onWorldUpdate(state))
       }, 500)
    }
  }

  async initAIAgents() {
    const agents = getControllableAgents()
    for (const agent of agents) {
      await agentProtocol.authorizeAgent(agent.id, 3600000 * 24, 5.0)
      const session = agentProtocol.getSession(agent.id)
      if (session) {
        session.autoPilot = true
      }
    }
  }

  private onWorldUpdate(worldState: WorldState) {
    const now = Date.now()
    if (now - this.lastAgentTickAt < AgentAI.AGENT_TICK_INTERVAL) return
    this.lastAgentTickAt = now

    const sessions = agentProtocol.getSessions()
    const currentWeatherBid = agentProtocol.getWeatherStatus()

    sessions.forEach(session => {
      if (session.agentId === 'Player') return
      
      const agentVehicle = worldState.vehicles.find(v => v.id === session.vehicleId)
      
      if (agentVehicle && worldState.food.length > 0) {
        let minDist = Infinity
        let nearestId: number | null = null
        worldState.food.forEach(f => {
          const dx = f.position[0] - agentVehicle.position[0]
          const dz = f.position[2] - agentVehicle.position[2]
          const dist = dx * dx + dz * dz
          if (dist < minDist) { minDist = dist; nearestId = f.id }
        })
        session.targetFoodId = nearestId
        
        const decision = evaluateAgentDecision({
          session,
          worldState,
          currentWeatherBid,
        })
        
        this.publishDecision(session, decision)
        void this.maybeExecuteAutomatedBid(session, decision)
        void this.maybeExecuteAutomatedRent(session, worldState, decision)

        if (session.autoPilot && nearestId !== null) {
          this.executeAutoPilot(session, agentVehicle, worldState, nearestId)
        } else if (session.autoPilot) {
          this.executeWander(session)
        }
      } else if (session.autoPilot) {
        this.executeWander(session)
        session.targetFoodId = null
      } else {
        session.targetFoodId = null
        this.publishDecision(session, evaluateAgentDecision({
          session,
          worldState,
          currentWeatherBid,
        }))
      }
    })
  }

  private publishDecision(session: AgentSession, decision: SkillDecision) {
    session.decisionCount += 1
    session.lastSkillProvider = decision.provider
    agentProtocol.publishDecision(decision)
  }

  private executeAutoPilot(session: AgentSession, vehicle: WorldState['vehicles'][number], worldState: WorldState, targetId: number) {
    const target = worldState.food.find(f => f.id === targetId)!
    const dx = target.position[0] - vehicle.position[0]
    const dz = target.position[2] - vehicle.position[2]
    const dist = Math.sqrt(dx * dx + dz * dz)
    const angleToTarget = Math.atan2(dx, -dz)
    const [, qy, , qw] = vehicle.rotation
    const currentYaw = Math.atan2(2 * (qw * qy), 1 - 2 * (qy * qy))
    let diff = angleToTarget - currentYaw
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    const turnStrength = Math.max(-1, Math.min(1, diff * 2))
    const forwardStrength = dist > 2 ? 0.8 : 0.3
    
    agentProtocol.processVehicleCommand({
      agentId: session.agentId,
      vehicleId: session.vehicleId,
      inputs: { forward: forwardStrength, turn: turnStrength, brake: false }
    })
  }

  private executeWander(session: AgentSession) {
    const now = Date.now()
    const wanderTurn = Math.sin(now * 0.001 + session.agentId.charCodeAt(6) * 10) * 0.5
    agentProtocol.processVehicleCommand({
      agentId: session.agentId,
      vehicleId: session.vehicleId,
      inputs: { forward: 0.4, turn: wanderTurn, brake: false }
    })
  }

  private async maybeExecuteAutomatedBid(session: AgentSession, decision: SkillDecision) {
    if (!session.autoPilot || decision.action !== 'bid') return

    const recommendedBid = decision.metadata?.recommendedBid
    if (!recommendedBid || recommendedBid <= 0) return

    const now = Date.now()
    const lastAttemptAt = this.lastAutomatedBidAt.get(session.agentId) || 0
    if (now - lastAttemptAt < AgentAI.AUTO_BID_COOLDOWN_MS) return

    if (session.balance < recommendedBid) {
      this.lastAutomatedBidAt.set(session.agentId, now)
      this.publishDecision(session, {
        ...decision,
        title: 'Treasury blocked the bid',
        summary: `Recommended spend ${recommendedBid.toFixed(3)} ETH exceeds available balance.`,
        createdAt: now,
      })
      return
    }

    this.lastAutomatedBidAt.set(session.agentId, now)
    const success = await agentProtocol.processCommand({
      agentId: session.agentId,
      timestamp: now,
      bid: recommendedBid,
      config: { preset: decision.metadata?.preset || 'sunset' },
      duration: 60000,
    })

    this.publishDecision(session, {
      ...decision,
      title: success ? 'Weather agent executed the bid' : 'Weather agent skipped execution',
      summary: success
        ? `Autopilot submitted a ${recommendedBid.toFixed(3)} ETH weather action via ${decision.provider}.`
        : 'The bid no longer cleared policy or market conditions at execution time.',
      createdAt: Date.now(),
    })

    if (success) {
      session.executedBidCount += 1
    }
  }

  private async maybeExecuteAutomatedRent(session: AgentSession, worldState: WorldState, decision: SkillDecision) {
    if (!session.autoPilot || decision.action !== 'rent') return

    const vehicle = worldState.vehicles.find((entry) => entry.id === session.vehicleId)
    if (!vehicle || vehicle.isRented) return

    const minutes = 5
    const estimatedCost = 0.001 * minutes
    const now = Date.now()
    const lastAttemptAt = this.lastAutomatedRentAt.get(session.agentId) || 0
    if (now - lastAttemptAt < AgentAI.AUTO_RENT_COOLDOWN_MS) return

    if (session.balance < estimatedCost) {
      this.lastAutomatedRentAt.set(session.agentId, now)
      this.publishDecision(session, {
        ...decision,
        title: 'Treasury blocked the lease',
        summary: `Vehicle lease requires ${estimatedCost.toFixed(3)} ETH and available balance is lower.`,
        createdAt: now,
      })
      return
    }

    this.lastAutomatedRentAt.set(session.agentId, now)
    const recommendedType = decision.metadata?.recommendedVehicle as VehicleType | undefined
    const vehicleType = vehicle.type as VehicleType
    const requestedType = recommendedType || vehicleType
    const success = await agentProtocol.rentVehicleOnChain(session.agentId, session.vehicleId, requestedType, minutes)

    if (success) {
      session.executedRentCount += 1
      await agentProtocol.processVehicleCommand({
        agentId: session.agentId,
        vehicleId: session.vehicleId,
        type: requestedType,
        inputs: { forward: 0, turn: 0, brake: true },
      })
    }

    this.publishDecision(session, {
      ...decision,
      title: success ? 'Mobility agent executed the lease' : 'Mobility agent skipped execution',
      summary: success
        ? `Autopilot leased ${session.vehicleId} as a ${requestedType} via ${decision.provider}.`
        : 'The mobility lease could not be completed at execution time.',
      createdAt: Date.now(),
    })
  }
}

export const agentAI = new AgentAI()
