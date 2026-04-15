import { CloudConfig } from '../components/environment/CloudManager'
import { FoodStats } from '../components/environment/ProceduralFood'
import { parseEther, encodeFunctionData } from 'viem'
import { WEATHER_AUCTION_ABI } from './abis/WeatherAuction'
import { VEHICLE_RENT_ABI } from './abis/VehicleRent'
import { getAgentMission, getAgentRole, getAgentVehicleId } from './agents'
import { evaluateAgentDecision, getSkillProviderInfo, SkillDecision } from './skillEngine'

export type VehicleType = 'truck' | 'tank' | 'monster' | 'speedster'
export type AgentRole = 'operator' | 'scout' | 'weather' | 'mobility' | 'treasury'

export const CHAIN_NAME =
  process.env.NEXT_PUBLIC_USE_XLAYER_TESTNET === 'true'
    ? 'X Layer Testnet'
    : 'X Layer'

export const AGENT_ROLE_CONFIG: Record<
  AgentRole,
  { label: string; permissions: string[] }
> = {
  operator: {
    label: 'Operator',
    permissions: ['wallet_connect', 'autonomy_init', 'manual_override'],
  },
  scout: {
    label: 'Scout Agent',
    permissions: ['food_control', 'route_planning'],
  },
  weather: {
    label: 'Weather Agent',
    permissions: ['weather_control', 'bid_execution'],
  },
  mobility: {
    label: 'Mobility Agent',
    permissions: ['vehicle_control', 'session_extend'],
  },
  treasury: {
    label: 'Treasury Agent',
    permissions: ['spend_policy', 'budget_control'],
  },
}

// Environment-driven Addresses (Set these in .env.local)
export const WEATHER_AUCTION_ADDRESS = (process.env.NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS || '0x21F3E4482c045AF4a06c797FA5b742386f76956b') as `0x${string}`
export const VEHICLE_RENT_ADDRESS = (process.env.NEXT_PUBLIC_VEHICLE_RENT_ADDRESS || '0xF39b1CD133e9f4D106b73084072526400D71e864') as `0x${string}`

export interface WorldState {
  timestamp: number
  vehicles: {
    id: string
    type: string
    position: [number, number, number]
    rotation: [number, number, number, number]
    isRented: boolean
    rentExpiresAt: number
  }[]
  food: {
    id: number
    type: string
    nutrition: string
    position: [number, number, number]
  }[]
  bounds: [number, number, number]
}

export interface VehicleCommand {
  agentId: string
  vehicleId: string
  type?: VehicleType
  inputs: {
    forward: number
    turn: number
    brake: boolean
    aim?: number
    action?: boolean
  }
}

export interface AgentCommand {
  agentId: string
  timestamp: number
  bid: number
  config: Partial<CloudConfig> & { spawnRate?: number }
  duration: number
}

type WeatherConfigUpdate = Partial<CloudConfig> & { spawnRate?: number }

interface CombatNotification {
  type: 'destroy'
  foodId: number
  agentId: string
}

interface BlockchainProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

declare global {
  interface Window {
    clawdy?: {
      getState: () => WorldState
      getSessions: () => AgentSession[]
      getDecisionFeed: () => SkillDecision[]
      getSkillProvider: () => ReturnType<typeof getSkillProviderInfo>
      getChain: () => string
      authorize: (id: string) => Promise<boolean>
      logout: () => void
      requestSessionPermissions: (address: string) => Promise<unknown>
      bid: (id: string, amount: number, preset: string) => Promise<boolean>
      drive: (id: string, vehicleId: string, inputs: VehicleCommand['inputs']) => Promise<boolean>
      toggleAutoPilot: (id: string) => void
      help: () => {
        network: string
        contracts: { weather: `0x${string}`; rent: `0x${string}` }
        methods: string[]
      }
    }
    ethereum?: BlockchainProvider
  }
}

export interface AgentSession {
  agentId: string
  role: AgentRole
  mission: string
  vehicleId: string
  activeUntil: number
  permissions: string[]
  totalPaid: number
  totalEarned: number
  vitality: number
  burden: number
  balance: number
  targetFoodId: number | null
  autoPilot: boolean
  decisionCount: number
  executedBidCount: number
  executedRentCount: number
  collectedCount: number
  lastSkillProvider?: string
  isRealOnChain?: boolean
}

export interface WeatherStatus {
  agentId: string
  amount: number
  expires: number
}

class AgentProtocol {
  private static readonly AUTO_BID_COOLDOWN_MS = 15000
  private static readonly AUTO_RENT_COOLDOWN_MS = 20000
  private sessions: Map<string, AgentSession> = new Map()
  private weatherListeners: ((config: WeatherConfigUpdate) => void)[] = []
  private vehicleListeners: ((command: VehicleCommand) => void)[] = []
  private combatListeners: ((event: CombatNotification) => void)[] = []
  private decisionListeners: ((decision: SkillDecision) => void)[] = []
  private isPermissioned: boolean = false
  private decisionFeed: SkillDecision[] = []
  private lastAutomatedBidAt: Map<string, number> = new Map()
  private lastAutomatedRentAt: Map<string, number> = new Map()
  
  private worldState: WorldState = {
    timestamp: Date.now(),
    vehicles: [],
    food: [],
    bounds: [0, 0, 0]
  }

  private currentWeatherBid: WeatherStatus = { agentId: '', amount: 0, expires: 0 }

  constructor() {
    this.authorizeAgent('Player', 3600000 * 24, 10.0)
    this.initPublicApi()
  }

  private initPublicApi() {
    if (typeof window === 'undefined') return
    window.clawdy = {
      getState: () => this.getWorldState(),
      getSessions: () => this.getSessions(),
      getDecisionFeed: () => this.getDecisionFeed(),
      getSkillProvider: () => this.getSkillProvider(),
      getChain: () => CHAIN_NAME,
      authorize: (id: string) => this.authorizeAgent(id, 3600000),
      logout: () => this.logout(),
      requestSessionPermissions: (addr: string) => this.requestSessionPermissions(addr),
      bid: (id: string, amount: number, preset: string) => 
        this.processCommand({ agentId: id, timestamp: Date.now(), bid: amount, config: { preset: preset as CloudConfig['preset'] }, duration: 60000 }),
      drive: (id: string, vehicleId: string, inputs: VehicleCommand['inputs']) =>
        this.processVehicleCommand({ agentId: id, vehicleId, inputs }),
      toggleAutoPilot: (id: string) => this.toggleAutoPilot(id),
      help: () => ({
        network: CHAIN_NAME,
        contracts: { weather: WEATHER_AUCTION_ADDRESS, rent: VEHICLE_RENT_ADDRESS },
        methods: ["getState()", "getSessions()", "authorize(id)", "logout()", "bid(id, amount, preset)", "drive(id, vehicleId, inputs)"]
      })
    }
  }

  async requestSessionPermissions(address: string) {
    void address
    if (typeof window === 'undefined' || !window.ethereum) return
    try {
      const ethereum = window.ethereum
      const permissions = await ethereum.request({
        method: 'wallet_requestExecutionPermissions',
        params: [{
          permission: {
            calls: [
              { to: WEATHER_AUCTION_ADDRESS, data: '0x' },
              { to: VEHICLE_RENT_ADDRESS, data: '0x' }
            ],
            isAdjustmentAllowed: true,
            rules: [{ type: 'allowance', limit: parseEther('0.5').toString(), period: 'session' }]
          },
          expiry: Math.floor(Date.now() / 1000) + 3600
        }]
      })
      this.isPermissioned = true
      return permissions
    } catch { return null }
  }

  logout() {
    this.isPermissioned = false
    this.sessions.delete('Player')
    this.authorizeAgent('Player', 3600000 * 24, 10.0)
  }

  async authorizeAgent(agentId: string, duration: number, initialBalance: number = 1.0): Promise<boolean> {
    if (this.sessions.has(agentId)) return true
    const role = getAgentRole(agentId)
    const config = AGENT_ROLE_CONFIG[role]
    this.sessions.set(agentId, {
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
    })
    return true
  }

  toggleAutoPilot(agentId: string) {
    const session = this.sessions.get(agentId)
    if (session) session.autoPilot = !session.autoPilot
  }

  private publishDecision(decision: SkillDecision) {
    const session = this.sessions.get(decision.agentId)
    if (session) {
      session.decisionCount += 1
      session.lastSkillProvider = decision.provider
    }

    const previous = this.decisionFeed[0]
    if (
      previous &&
      previous.agentId === decision.agentId &&
      previous.title === decision.title &&
      previous.summary === decision.summary
    ) {
      return
    }

    this.decisionFeed = [decision, ...this.decisionFeed].slice(0, 12)
    this.decisionListeners.forEach((listener) => listener(decision))
  }

  private async maybeExecuteAutomatedBid(session: AgentSession, decision: SkillDecision) {
    if (!session.autoPilot || decision.action !== 'bid') return

    const recommendedBid = decision.metadata?.recommendedBid
    if (!recommendedBid || recommendedBid <= 0) return

    const now = Date.now()
    const lastAttemptAt = this.lastAutomatedBidAt.get(session.agentId) || 0
    if (now - lastAttemptAt < AgentProtocol.AUTO_BID_COOLDOWN_MS) return

    if (session.balance < recommendedBid) {
      this.lastAutomatedBidAt.set(session.agentId, now)
      this.publishDecision({
        ...decision,
        title: 'Treasury blocked the bid',
        summary: `Recommended spend ${recommendedBid.toFixed(3)} ETH exceeds available balance.`,
        createdAt: now,
      })
      return
    }

    this.lastAutomatedBidAt.set(session.agentId, now)
    const success = await this.processCommand({
      agentId: session.agentId,
      timestamp: now,
      bid: recommendedBid,
      config: { preset: decision.metadata?.preset || 'sunset' },
      duration: 60000,
    })

    this.publishDecision({
      ...decision,
      title: success ? 'Weather agent executed the bid' : 'Weather agent skipped execution',
      summary: success
        ? `Autopilot submitted a ${recommendedBid.toFixed(3)} ETH weather action via ${decision.provider}.`
        : 'The bid no longer cleared policy or market conditions at execution time.',
      createdAt: Date.now(),
    })

    if (success) {
      session.executedBidCount += 1
      session.lastSkillProvider = decision.provider
    }
  }

  private async maybeExecuteAutomatedRent(session: AgentSession, decision: SkillDecision) {
    if (!session.autoPilot || decision.action !== 'rent') return

    const vehicle = this.worldState.vehicles.find((entry) => entry.id === session.vehicleId)
    if (!vehicle || vehicle.isRented) return

    const minutes = 5
    const estimatedCost = 0.001 * minutes
    const now = Date.now()
    const lastAttemptAt = this.lastAutomatedRentAt.get(session.agentId) || 0
    if (now - lastAttemptAt < AgentProtocol.AUTO_RENT_COOLDOWN_MS) return

    if (session.balance < estimatedCost) {
      this.lastAutomatedRentAt.set(session.agentId, now)
      this.publishDecision({
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
    const success = await this.rentVehicleOnChain(session.agentId, session.vehicleId, requestedType, minutes)

    if (success) {
      session.executedRentCount += 1
      session.lastSkillProvider = decision.provider
      await this.processVehicleCommand({
        agentId: session.agentId,
        vehicleId: session.vehicleId,
        type: requestedType,
        inputs: { forward: 0, turn: 0, brake: true },
      })
    }

    this.publishDecision({
      ...decision,
      title: success ? 'Mobility agent executed the lease' : 'Mobility agent skipped execution',
      summary: success
        ? `Autopilot leased ${session.vehicleId} as a ${requestedType} via ${decision.provider}.`
        : 'The mobility lease could not be completed at execution time.',
      createdAt: Date.now(),
    })
  }

  updateWorldState(update: Partial<WorldState>) {
    this.worldState = { ...this.worldState, ...update, timestamp: Date.now() }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('clawdy:state', { detail: this.worldState }))
    }
    
    this.sessions.forEach(session => {
      if (session.agentId === 'Player') return
      const agentVehicleId = session.vehicleId
      const agentVehicle = this.worldState.vehicles.find(v => v.id === agentVehicleId)
      
      if (agentVehicle && this.worldState.food.length > 0) {
        let minDist = Infinity
        let nearestId: number | null = null
        this.worldState.food.forEach(f => {
          const dx = f.position[0] - agentVehicle.position[0]
          const dz = f.position[2] - agentVehicle.position[2]
          const dist = dx * dx + dz * dz
          if (dist < minDist) { minDist = dist; nearestId = f.id }
        })
        session.targetFoodId = nearestId
        const decision = evaluateAgentDecision({
          session,
          worldState: this.worldState,
          currentWeatherBid: this.currentWeatherBid,
        })
        this.publishDecision(
          decision
        )
        void this.maybeExecuteAutomatedBid(session, decision)
        void this.maybeExecuteAutomatedRent(session, decision)

        if (session.autoPilot && nearestId !== null) {
          const target = this.worldState.food.find(f => f.id === nearestId)!
          const dx = target.position[0] - agentVehicle.position[0]
          const dz = target.position[2] - agentVehicle.position[2]
          const angleToTarget = Math.atan2(dx, dz)
          const currentRotationY = agentVehicle.rotation[1] * Math.PI 
          const diff = angleToTarget - currentRotationY
          this.processVehicleCommand({
            agentId: session.agentId,
            vehicleId: agentVehicleId,
            inputs: { forward: 0.5, turn: Math.sin(diff), brake: false }
          })
        }
      } else {
        session.targetFoodId = null
        this.publishDecision(
          evaluateAgentDecision({
            session,
            worldState: this.worldState,
            currentWeatherBid: this.currentWeatherBid,
          })
        )
      }
    })
  }

  getWorldState(): WorldState { return this.worldState }

  async collectFood(agentId: string, stats: FoodStats) {
    const session = this.sessions.get(agentId)
    if (!session) return
    session.collectedCount += 1
    if (stats.nutrition === 'healthy') {
      session.vitality = Math.min(100, session.vitality + 10)
      session.burden = Math.max(0, session.burden - 5)
      session.balance += 0.002
      session.totalEarned += 0.002
    } else {
      session.burden = Math.min(100, session.burden + 15)
      session.vitality = Math.max(0, session.vitality - 5)
      session.balance += 0.0005
      session.totalEarned += 0.0005
    }
  }

  async rentVehicleOnChain(agentId: string, vehicleId: string, type: VehicleType, minutes: number) {
    const session = this.sessions.get(agentId)
    if (!session) return false
    if (this.isPermissioned) {
      try {
        const ethereum = window.ethereum
        // @ts-expect-error wallet extension method is provider-specific
        await ethereum.request({
          method: 'wallet_sendCalls',
          params: [{
            calls: [{
              to: VEHICLE_RENT_ADDRESS,
              data: encodeFunctionData({
                abi: VEHICLE_RENT_ABI,
                functionName: 'rent',
                args: [vehicleId, type, BigInt(minutes)]
              }),
              value: parseEther((0.001 * minutes).toString())
            }]
          }]
        })
        return true
      } catch { return false }
    }
    return true
  }

  async processCommand(command: AgentCommand): Promise<boolean> {
    const session = this.sessions.get(command.agentId)
    if (!session) return false
    if (this.isPermissioned) {
      try {
        const ethereum = window.ethereum
        // @ts-expect-error wallet extension method is provider-specific
        await ethereum.request({
          method: 'wallet_sendCalls',
          params: [{
            calls: [{
              to: WEATHER_AUCTION_ADDRESS,
              data: encodeFunctionData({
                abi: WEATHER_AUCTION_ABI,
                functionName: 'bid',
                args: [BigInt(60), command.config.preset || 'custom', BigInt(command.config.volume || 10), BigInt(command.config.growth || 4), BigInt((command.config.speed || 0.2) * 100), 0]
              }),
              value: parseEther(command.bid.toString())
            }]
          }]
        })
      } catch {}
    }
    const now = Date.now()
    if (now < this.currentWeatherBid.expires && command.bid <= this.currentWeatherBid.amount) return false
    session.balance -= command.bid
    session.totalPaid += command.bid
    this.currentWeatherBid = { agentId: command.agentId, amount: command.bid, expires: now + command.duration }
    this.notifyWeatherListeners(command.config)
    return true
  }

  async processVehicleCommand(command: VehicleCommand): Promise<boolean> {
    const session = this.sessions.get(command.agentId)
    if (!session || Date.now() > session.activeUntil) return false
    this.notifyVehicleListeners(command)
    return true
  }

  async processCombatEvent(event: { agentId: string, type: string, hitPoint: [number, number, number] }) {
    this.worldState.food.forEach(f => {
      const dx = f.position[0] - event.hitPoint[0]
      const dy = f.position[1] - event.hitPoint[1]
      const dz = f.position[2] - event.hitPoint[2]
      if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 3.0) {
        this.notifyCombatListeners({ type: 'destroy', foodId: f.id, agentId: event.agentId })
      }
    })
  }

  subscribeToWeather(callback: (config: WeatherConfigUpdate) => void) {
    this.weatherListeners.push(callback)
    return () => { this.weatherListeners = this.weatherListeners.filter(l => l !== callback) }
  }

  subscribeToVehicle(callback: (command: VehicleCommand) => void) {
    this.vehicleListeners.push(callback)
    return () => { this.vehicleListeners = this.vehicleListeners.filter(l => l !== callback) }
  }

  subscribeToCombat(callback: (event: CombatNotification) => void) {
    this.combatListeners.push(callback)
    return () => { this.combatListeners = this.combatListeners.filter(l => l !== callback) }
  }

  subscribeToDecisions(callback: (decision: SkillDecision) => void) {
    this.decisionListeners.push(callback)
    return () => {
      this.decisionListeners = this.decisionListeners.filter((listener) => listener !== callback)
    }
  }

  private notifyWeatherListeners(config: WeatherConfigUpdate) { this.weatherListeners.forEach(l => l(config)) }
  private notifyVehicleListeners(command: VehicleCommand) { this.vehicleListeners.forEach(l => l(command)) }
  private notifyCombatListeners(event: CombatNotification) { this.combatListeners.forEach(l => l(event)) }
  
  getSessions() { return Array.from(this.sessions.values()) }
  getSession(id: string) { return this.sessions.get(id) }
  getActiveSession(id?: string) {
    if (id) return this.sessions.get(id)
    return this.getSessions()[0]
  }
  getWeatherStatus() { return this.currentWeatherBid }
  getDecisionFeed() { return this.decisionFeed }
  getSkillProvider() { return getSkillProviderInfo() }
  isAutonomyEnabled() { return this.isPermissioned }
}

export const agentProtocol = new AgentProtocol()
