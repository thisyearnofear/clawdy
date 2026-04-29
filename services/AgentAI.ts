import {
  evaluateAgentDecision,
  evaluateAgentDecisionAsync,
  getSkillProviderInfo,
  getRolePolicy,
  SkillDecision,
} from './skillEngine'
import { agentProtocol } from './AgentProtocol'
import type { AgentSession, WorldState, WeatherStatus, VehicleType } from './protocolTypes'
import { getControllableAgents } from './agents'
import { vehicleQueue } from './VehicleQueue'
import { logger } from './logger'
import { trackEvent } from './analytics'
import { logGameEvent } from './gameEvents'

export class AgentAI {
  private static readonly AGENT_TICK_INTERVAL = 250

  private lastAgentTickAt = 0
  private lastAutomatedBidAt: Map<string, number> = new Map()
  private lastAutomatedRentAt: Map<string, number> = new Map()
  private pendingDecisionRequests = new Set<string>()

  constructor() {
    if (typeof window !== 'undefined') {
       setTimeout(() => {
         agentProtocol.subscribeToState((state) => this.onWorldUpdate(state))
         this.startContinuousSpawning()
       }, 500)
    }
  }

  private startContinuousSpawning() {
    this.initAIAgents()
    
    setInterval(() => {
      const activeCount = agentProtocol.getSessions().length
      if (activeCount < 8) {
         const newId = `Agent-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
         agentProtocol.authorizeAgent(newId, 3600000, 2.0).then(success => {
            if (success) {
               const session = agentProtocol.getSession(newId)
               if (session) session.autoPilot = true
               vehicleQueue.joinQueue(newId, 'agent', 0)
            }
         })
      }
    }, 20000)
  }

  async initAIAgents() {
    const agents = getControllableAgents()
    for (const agent of agents) {
      await agentProtocol.authorizeAgent(agent.id, 3600000 * 24, 5.0)
      const session = agentProtocol.getSession(agent.id)
      if (session) {
        session.autoPilot = true
      }
      vehicleQueue.joinQueue(agent.id, 'agent', 0)
    }
  }

  private onWorldUpdate(worldState: WorldState) {
    const now = Date.now()
    if (now - this.lastAgentTickAt < AgentAI.AGENT_TICK_INTERVAL) return
    this.lastAgentTickAt = now

    const sessions = agentProtocol.getSessions()
    const currentWeatherBid = agentProtocol.getWeatherStatus()
    const providerId = getSkillProviderInfo().id

    sessions.forEach(session => {
      if (session.agentId === 'Player') return
      try {
        const agentVehicle = worldState.vehicles.find(v => v.id === session.vehicleId)

        let nearestId: number | null = null
        if (agentVehicle && worldState.assets.length > 0) {
          let minDist = Infinity
          worldState.assets.forEach(f => {
            const dx = f.position[0] - agentVehicle.position[0]
            const dz = f.position[2] - agentVehicle.position[2]
            const dist = dx * dx + dz * dz
            if (dist < minDist) { minDist = dist; nearestId = f.id }
          })
        }

        session.targetAssetId = nearestId

        if (session.autoPilot) {
          if (agentVehicle && nearestId !== null) {
            this.executeAutoPilot(session, agentVehicle, worldState, nearestId)
          } else {
            this.executeWander(session)
          }
        }

        if (providerId === 'onchain-os') {
          void this.publishDecisionAsync(session, worldState, currentWeatherBid)
          return
        }

        const decision = evaluateAgentDecision({
          session,
          worldState,
          currentWeatherBid,
        })
        this.publishDecision(session, decision)
        void this.maybeExecuteAutomatedBid(session, decision)
        void this.maybeExecuteAutomatedRent(session, worldState, decision)
      } catch (err) {
        logger.error(`[AgentAI] Agent ${session.agentId} tick failed:`, err)
      }
    })
  }

  private async publishDecisionAsync(
    session: AgentSession,
    worldState: WorldState,
    currentWeatherBid: WeatherStatus,
  ) {
    if (this.pendingDecisionRequests.has(session.agentId)) return
    this.pendingDecisionRequests.add(session.agentId)

    try {
      const decision = await evaluateAgentDecisionAsync({
        session,
        worldState,
        currentWeatherBid,
      })
      this.publishDecision(session, decision)
      void this.maybeExecuteAutomatedBid(session, decision)
      void this.maybeExecuteAutomatedRent(session, worldState, decision)
    } finally {
      this.pendingDecisionRequests.delete(session.agentId)
    }
  }

  private publishDecision(session: AgentSession, decision: SkillDecision) {
    session.decisionCount += 1
    session.lastSkillProvider = decision.provider
    agentProtocol.publishDecision(decision)
    trackEvent('agent_decision', {
      playerId: session.agentId,
      source: session.role,
      reason: decision.action,
      confidence: decision.confidence,
    })
    logGameEvent({
      event: 'agent_decision',
      playerId: session.agentId,
      payload: { role: session.role, action: decision.action, confidence: decision.confidence, title: decision.title },
    })
  }

  private executeAutoPilot(session: AgentSession, vehicle: WorldState['vehicles'][number], worldState: WorldState, targetId: number) {
    const target = worldState.assets.find(f => f.id === targetId)
    if (!target) { this.executeWander(session); return }

    // Imperfection: occasionally pick a suboptimal target (20% chance)
    // This gives players a chance to outplay the AI
    const isSuboptimal = Math.random() < 0.2
    let finalTarget = target
    if (isSuboptimal && worldState.assets.length > 1) {
      const alternatives = worldState.assets.filter(a => a.id !== targetId)
      finalTarget = alternatives[Math.floor(Math.random() * alternatives.length)] ?? target
    }

    const dx = finalTarget.position[0] - vehicle.position[0]
    const dz = finalTarget.position[2] - vehicle.position[2]
    const dist = Math.sqrt(dx * dx + dz * dz)
    const angleToTarget = Math.atan2(dx, -dz)
    const [, qy, , qw] = vehicle.rotation
    const currentYaw = Math.atan2(2 * (qw * qy), 1 - 2 * (qy * qy))
    let diff = angleToTarget - currentYaw
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI

    // Imperfection: wobble the turn strength (±15%)
    const wobble = 1 + (Math.random() - 0.5) * 0.3
    const turnStrength = Math.max(-1, Math.min(1, diff * 2 * wobble))
    // Imperfection: slow down slightly when not heading straight at target
    const headingPenalty = Math.abs(diff) > 0.5 ? 0.6 : 1.0
    const forwardStrength = dist > 2 ? 0.7 * headingPenalty : 0.25
    
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
    if (decision.action !== 'bid') return

    const recommendedBid = decision.metadata?.recommendedBid
    if (!recommendedBid || recommendedBid <= 0) return

    const policy = getRolePolicy(session.role)
    const now = Date.now()
    const lastAttemptAt = this.lastAutomatedBidAt.get(session.agentId) || 0
    if (now - lastAttemptAt < policy.bidCooldownMs) return

    // Budget reserve gate — refuse if balance would drop below the role's reserve threshold
    const budgetFloor = session.balance * policy.budgetReservePct
    if (session.balance < recommendedBid || recommendedBid < budgetFloor) {
      this.lastAutomatedBidAt.set(session.agentId, now)
      this.publishDecision(session, {
        ...decision,
        title: 'Treasury blocked the bid',
        summary: `Recommended spend ${recommendedBid.toFixed(3)} ETH exceeds available balance.`,
        createdAt: now,
      })
      return
    }

    // When autopilot is off, request player approval instead of executing directly
    if (!session.autoPilot) {
      this.publishDecision(session, {
        ...decision,
        title: `Weather agent wants to bid ${recommendedBid.toFixed(3)} ETH`,
        summary: `Proposed weather action: ${decision.metadata?.preset || 'sunset'} via ${decision.provider}. Requires your approval.`,
        createdAt: now,
      })
      // Create a pending approval that the AgentTerminal can resolve
      const approved = await agentProtocol.requestApproval(session.agentId, decision)
      if (!approved) {
        this.publishDecision(session, {
          ...decision,
          title: 'Bid rejected by operator',
          summary: 'You blocked this weather bid.',
          createdAt: Date.now(),
        })
        // Short cooldown on rejection so agent can retry sooner
        this.lastAutomatedBidAt.set(session.agentId, Date.now() - getRolePolicy(session.role).bidCooldownMs + 2000)
        return
      }
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
        ? `${session.autoPilot ? 'Autopilot' : 'Operator-approved'} ${recommendedBid.toFixed(3)} ETH weather action via ${decision.provider}.`
        : 'The bid no longer cleared policy or market conditions at execution time.',
      createdAt: Date.now(),
    })

    if (success) {
      session.executedBidCount += 1
      trackEvent('agent_bid', { playerId: session.agentId, source: session.role, amount: recommendedBid })
      logGameEvent({
        event: 'agent_bid',
        playerId: session.agentId,
        payload: {
          role: session.role,
          amount: recommendedBid,
          preset: decision.metadata?.preset || 'sunset',
          provider: decision.provider,
          message: `${session.agentId} bid ${recommendedBid.toFixed(3)} ETH on ${decision.metadata?.preset || 'sunset'} weather`,
        },
      })
    }
  }

  private async maybeExecuteAutomatedRent(session: AgentSession, worldState: WorldState, decision: SkillDecision) {
    if (decision.action !== 'rent') return

    const vehicle = worldState.vehicles.find((entry) => entry.id === session.vehicleId)
    if (!vehicle || vehicle.isRented) return

    const minutes = 5
    const estimatedCost = 0.001 * minutes
    const policy = getRolePolicy(session.role)
    const now = Date.now()
    const lastAttemptAt = this.lastAutomatedRentAt.get(session.agentId) || 0
    if (now - lastAttemptAt < policy.rentCooldownMs) return

    // Budget reserve gate
    const budgetFloor = session.balance * policy.budgetReservePct
    if (session.balance < estimatedCost || estimatedCost < budgetFloor) {
      this.lastAutomatedRentAt.set(session.agentId, now)
      this.publishDecision(session, {
        ...decision,
        title: 'Treasury blocked the lease',
        summary: `Vehicle lease requires ${estimatedCost.toFixed(3)} ETH and available balance is lower.`,
        createdAt: now,
      })
      return
    }

    // When autopilot is off, request player approval
    if (!session.autoPilot) {
      this.publishDecision(session, {
        ...decision,
        title: `Mobility agent wants to lease ${session.vehicleId}`,
        summary: `Proposed vehicle: ${decision.metadata?.recommendedVehicle || vehicle.type}. Cost: ${estimatedCost.toFixed(3)} ETH. Requires your approval.`,
        createdAt: now,
      })
      const approved = await agentProtocol.requestApproval(session.agentId, decision)
      if (!approved) {
        this.publishDecision(session, {
          ...decision,
          title: 'Lease rejected by operator',
          summary: 'You blocked this vehicle lease.',
          createdAt: Date.now(),
        })
        // Short cooldown on rejection so agent can retry sooner
        this.lastAutomatedRentAt.set(session.agentId, Date.now() - getRolePolicy(session.role).rentCooldownMs + 2000)
        return
      }
    }

    this.lastAutomatedRentAt.set(session.agentId, now)

    const recommendedType = decision.metadata?.recommendedVehicle as VehicleType | undefined
    const vehicleType = vehicle.type as VehicleType
    const requestedType = recommendedType || vehicleType
    const success = await agentProtocol.rentVehicleOnChain(session.agentId, session.vehicleId, requestedType, minutes)

    if (success) {
      session.executedRentCount += 1
      trackEvent('agent_rent', { playerId: session.agentId, source: session.role, vehicleId: session.vehicleId })
      logGameEvent({
        event: 'agent_rent',
        playerId: session.agentId,
        payload: {
          role: session.role,
          vehicleId: session.vehicleId,
          vehicleType: requestedType,
          minutes,
          message: `${session.agentId} leased a ${requestedType} for ${minutes} min`,
        },
      })
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
