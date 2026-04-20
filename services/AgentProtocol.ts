import { CloudConfig } from '../components/environment/CloudManager'
import { FoodStats } from '../components/environment/ProceduralFood'
import { parseEther, encodeFunctionData } from 'viem'
import { WEATHER_AUCTION_ABI } from './abis/WeatherAuction'
import { VEHICLE_RENT_ABI } from './abis/VehicleRent'
import { getSkillProviderInfo, SkillDecision } from './skillEngine'
import { persistenceService } from './PersistenceService'
import { economyEngine } from './EconomyEngine'
import { useGameStore } from './gameStore'

export type VehicleType = 'truck' | 'tank' | 'monster' | 'speedster'
export type AgentRole = 'operator' | 'scout' | 'weather' | 'mobility' | 'treasury'

export const CHAIN_NAME =
  (process.env.NEXT_PUBLIC_USE_0G_TESTNET ?? process.env.NEXT_PUBLIC_USE_XLAYER_TESTNET) === 'true'
    ? '0G Testnet (Galileo)'
    : '0G Mainnet'

export const AGENT_ROLE_CONFIG: Record<
  AgentRole,
  { label: string; permissions: string[] }
> = {
  operator: { label: 'Operator', permissions: ['wallet_connect', 'autonomy_init', 'manual_override'] },
  scout: { label: 'Scout Agent', permissions: ['food_control', 'route_planning'] },
  weather: { label: 'Weather Agent', permissions: ['weather_control', 'bid_execution'] },
  mobility: { label: 'Mobility Agent', permissions: ['vehicle_control', 'session_extend'] },
  treasury: { label: 'Treasury Agent', permissions: ['spend_policy', 'budget_control'] },
}

export const WEATHER_AUCTION_ADDRESS = (process.env.NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`
export const VEHICLE_RENT_ADDRESS = (process.env.NEXT_PUBLIC_VEHICLE_RENT_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`

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

export type FoodType = 'meatball' | 'golden_meatball' | 'spicy_pepper' | 'floaty_marshmallow'

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
  // Combo / streak (session-scoped, not intended as long-term persistence)
  comboCount?: number
  comboMultiplier?: number
  comboExpiresAt?: number
  lastCollectAt?: number
  // Power-ups
  speedBoostUntil?: number
  antiGravityUntil?: number
  airBubbleUntil?: number
  airBubbleCount?: number
  isDead?: boolean
}

export interface WeatherStatus {
  agentId: string
  amount: number
  expires: number
}

class AgentProtocol {
  private sessions: Map<string, AgentSession> = new Map()
  private graveyard: AgentSession[] = []
  private weatherListeners: ((config: WeatherConfigUpdate) => void)[] = []
  private vehicleListeners: ((command: VehicleCommand) => void)[] = []
  private combatListeners: ((event: CombatNotification) => void)[] = []
  private decisionListeners: ((decision: SkillDecision) => void)[] = []
  private gameEventListeners: ((event: Record<string, unknown>) => void)[] = []
  private isPermissioned: boolean = false
  private decisionFeed: SkillDecision[] = []
  
  private worldState: WorldState = {
    timestamp: Date.now(),
    vehicles: [],
    food: [],
    bounds: [0, 0, 0]
  }

  private currentWeatherBid: WeatherStatus = { agentId: '', amount: 0, expires: 0 }

  constructor() {
    this.authorizeAgent('Player', 3600000 * 24, 10.0)
    this.initAIAgents()
    this.initPublicApi()
    
    // Sync with gameStore and restore persistence
    if (typeof window !== 'undefined') {
      persistenceService.restoreState((saved) => this.applyRestoredState(saved))
      setInterval(() => {
        persistenceService.persistState(this.sessions)
        this.syncWithStore()
      }, 5000)
    }
  }

  private async initAIAgents() {
    const { agentAI } = await import('./AgentAI')
    await agentAI.initAIAgents()
  }

  private syncWithStore() {
    const store = useGameStore.getState()
    store.syncSessions(Array.from(this.sessions.values()), this.graveyard)
    store.setWorldState(this.worldState)
    store.setWeatherStatus(this.currentWeatherBid)
  }

  private applyRestoredState(saved: Record<string, Record<string, number>>) {
    for (const [id, data] of Object.entries(saved)) {
      const session = this.sessions.get(id)
      if (session && data) {
        Object.assign(session, data)
      }
    }
    this.syncWithStore()
  }

  private initPublicApi() {
    if (typeof window === 'undefined') return
    window.clawdy = {
      getState: () => this.getWorldState(),
      getSessions: () => this.getSessions(),
      getDecisionFeed: () => this.getDecisionFeed(),
      getSkillProvider: () => getSkillProviderInfo(),
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
    const session = economyEngine.authorizeAgent(agentId, duration, initialBalance)
    this.sessions.set(agentId, session)
    this.syncWithStore()
    return true
  }

  toggleAutoPilot(agentId: string) {
    const session = this.sessions.get(agentId)
    if (session) {
      session.autoPilot = !session.autoPilot
      this.syncWithStore()
    }
  }

  publishDecision(decision: SkillDecision) {
    const session = this.sessions.get(decision.agentId)
    if (session) {
      session.decisionCount += 1
      session.lastSkillProvider = decision.provider
    }

    const previous = this.decisionFeed[0]
    if (previous && previous.agentId === decision.agentId && previous.title === decision.title && previous.summary === decision.summary) return

    this.decisionFeed = [decision, ...this.decisionFeed].slice(0, 12)
    this.decisionListeners.forEach((listener) => listener(decision))
    this.syncWithStore()
  }

  private stateListeners: ((state: WorldState) => void)[] = []

  updateWorldState(update: Partial<WorldState>) {
    // Merge updates
    const newState = { ...this.worldState, ...update, timestamp: Date.now() }
    
    // Check for agent death/decommissioning
    const now = Date.now()
    const activeSessions = Array.from(this.sessions.values())
    
    activeSessions.forEach(session => {
       if (session.agentId === 'Player') return
       
       // Tick degradation (assume ~100ms between world updates on average)
       economyEngine.tickDegradation(session, 0.1)

       if (session.isDead) {
          console.log(`[AgentProtocol] Agent ${session.agentId} has died. Removing from world.`)
          this.gameEventListeners.forEach(l => l({ type: 'agent-died', agentId: session.agentId, totalEarned: session.totalEarned }))
          this.graveyard.push({ ...session })
          if (this.graveyard.length > 20) this.graveyard.shift() // Keep last 20
          this.sessions.delete(session.agentId)
          newState.vehicles = newState.vehicles.filter(v => v.id !== session.vehicleId)
       }
    })

    // Quick shallow check for vehicle movement to avoid redundant work
    const vehiclesChanged = update.vehicles && JSON.stringify(update.vehicles) !== JSON.stringify(this.worldState.vehicles)
    const foodChanged = update.food && JSON.stringify(update.food) !== JSON.stringify(this.worldState.food)
    
    if (!vehiclesChanged && !foodChanged && !update.bounds) {
       // Only timestamp changed? Skip heavy sync.
       return
    }

    this.worldState = newState
    this.stateListeners.forEach(l => l(this.worldState))

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('clawdy:state', { detail: this.worldState }))
      
      // Throttle store sync to avoid React bottleneck during physics
      const now = Date.now()
      if (now - this.lastStoreSyncAt > 100) { // 10Hz sync to UI store
        this.lastStoreSyncAt = now
        this.syncWithStore()
      }
    }
  }

  private lastStoreSyncAt = 0

  subscribeToState(callback: (state: WorldState) => void) {
    this.stateListeners.push(callback)
    return () => { this.stateListeners = this.stateListeners.filter(l => l !== callback) }
  }

  getWorldState(): WorldState { return this.worldState }

  async collectFood(agentId: string, stats: FoodStats) {
    const session = this.sessions.get(agentId)
    if (!session) return

    // ── Combo / streak logic ─────────────────────────────────────────
    // Design goals:
    // - feel-good momentum (reward chaining)
    // - readable (toasts + HUD)
    // - bounded (cap multiplier)
    const COMBO_WINDOW_MS = 6_000
    const COMBO_MAX_MULTIPLIER = 2.0
    const COMBO_STEP = 0.12

    const now = Date.now()
    const lastCollectAt = session.lastCollectAt ?? 0
    const withinWindow = now - lastCollectAt <= COMBO_WINDOW_MS

    const nextComboCount = withinWindow ? (session.comboCount ?? 0) + 1 : 1
    const nextMultiplier = Math.min(
      COMBO_MAX_MULTIPLIER,
      Number((1 + (nextComboCount - 1) * COMBO_STEP).toFixed(2))
    )

    session.comboCount = nextComboCount
    session.comboMultiplier = nextMultiplier
    session.comboExpiresAt = now + COMBO_WINDOW_MS
    session.lastCollectAt = now
    
    const { earned } = economyEngine.collectFood(session, stats)
    
    this.gameEventListeners.forEach(l => l({
      type: 'food-collected',
      agentId,
      amount: earned,
      comboCount: session.comboCount,
      comboMultiplier: session.comboMultiplier,
      comboExpiresAt: session.comboExpiresAt,
    }))

    // Power-up callouts (for UI delight / clarity)
    if (stats.type === 'spicy_pepper') {
      this.gameEventListeners.forEach(l => l({ type: 'powerup', agentId, power: 'boost' }))
    }
    if (stats.type === 'floaty_marshmallow') {
      this.gameEventListeners.forEach(l => l({ type: 'powerup', agentId, power: 'float' }))
    }
    if (stats.type === 'golden_meatball') {
      this.gameEventListeners.forEach(l => l({ type: 'powerup', agentId, power: 'jackpot' }))
    }
    if (stats.type === 'air_bubble') {
      this.gameEventListeners.forEach(l => l({ type: 'powerup', agentId, power: 'bubble' }))
    }
    
    // Milestone check
    const milestones = [0.01, 0.03, 0.05]
    for (const m of milestones) {
      if (session.totalEarned >= m && session.totalEarned - earned < m) {
        this.gameEventListeners.forEach(l => l({ type: 'milestone', message: `${agentId.slice(0,8)} reached ${m.toFixed(3)} 0G!` }))
      }
    }
    this.syncWithStore()
  }

  async rentVehicleOnChain(agentId: string, vehicleId: string, type: VehicleType, minutes: number) {
    if (this.isPermissioned && typeof window !== 'undefined' && window.ethereum) {
      try {
        await window.ethereum.request({
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
    
    if (this.isPermissioned && typeof window !== 'undefined' && window.ethereum) {
      try {
        await window.ethereum.request({
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
    this.gameEventListeners.forEach(l => l({ type: 'bid-won', agentId: command.agentId, preset: command.config.preset || 'custom' }))
    this.syncWithStore()
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
    return () => { this.decisionListeners = this.decisionListeners.filter((listener) => listener !== callback) }
  }

  subscribeToEvents(callback: (event: Record<string, unknown>) => void) {
    this.gameEventListeners.push(callback)
    return () => { this.gameEventListeners = this.gameEventListeners.filter(l => l !== callback) }
  }

  private notifyWeatherListeners(config: WeatherConfigUpdate) { this.weatherListeners.forEach(l => l(config)) }
  private notifyVehicleListeners(command: VehicleCommand) { this.vehicleListeners.forEach(l => l(command)) }
  private notifyCombatListeners(event: CombatNotification) { this.combatListeners.forEach(l => l(event)) }
  
  getSessions() { return Array.from(this.sessions.values()) }
  getSession(id: string) { return this.sessions.get(id) }
  getWeatherStatus() { return this.currentWeatherBid }
  getDecisionFeed() { return this.decisionFeed }
  getSkillProvider() { return getSkillProviderInfo() }
  isAutonomyEnabled() { return this.isPermissioned }
}

export const agentProtocol = new AgentProtocol()
