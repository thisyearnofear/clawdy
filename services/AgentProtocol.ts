// ── AgentProtocol (Facade) ───────────────────────────────────────────
// This file composes three focused services:
//   - SessionManager  → session CRUD, graveyard, autopilot toggle
//   - ApprovalGate    → pending approval promises for non-autopilot agents
//   - BlockchainService → on-chain tx dispatch, wallet client, chain guard
//
// AgentProtocol retains: event dispatch, world state, combo/scoring,
// persistence orchestration, and the public window.clawdy API.
//
// All types and constants are re-exported from protocolTypes for backward
// compatibility — existing consumers continue to import from this file.

// ── Re-export everything from protocolTypes for backward compatibility ──
export {
  type VehicleType,
  type AgentRole,
  AGENT_ROLE_CONFIG,
  type AgentSession,
  type WorldState,
  type WeatherStatus,
  type VehicleCommand,
  type AgentCommand,
  type ContractWalletClient,
  type BlockchainProvider,
  CONTRACT_ADDRESSES,
  getContractsForChain,
  isChainSupported,
  WEATHER_AUCTION_ADDRESS,
  VEHICLE_RENT_ADDRESS,
  MEME_MARKET_ADDRESS,
  DEFAULT_WEATHER_AUCTION_ADDRESS,
  DEFAULT_VEHICLE_RENT_ADDRESS,
  DEFAULT_MEME_MARKET_ADDRESS,
  CHAIN_NAME,
  MEME_MARKET_ABILITIES,
  type MemeMarketAbility,
  getMemeMarketAbility,
  MEME_MARKET_STRATEGIES,
  type MemeMarketStrategy,
  getMemeMarketStrategy,
  type MemeMarketStrategySummaryEntry,
  type MemeMarketStrategySummary,
  getMemeMarketStrategySummary,
  getMemeMarketStrategyBidMultiplier,
  getMemeMarketStrategyVehicle,
  getMemeMarketStrategyPreset,
} from './protocolTypes'

// ── Focused service exports ──────────────────────────────────────────
export { ApprovalGate } from './ApprovalGate'
export { SessionManager } from './SessionManager'
export { BlockchainService } from './BlockchainService'

// ── Internal imports ────────────────────────────────────────────────
import { CloudConfig } from '../components/environment/CloudManager'
import { MemeAssetStats } from '../components/environment/MemeAssets'
import { parseEther } from 'viem'
import { WEATHER_AUCTION_ABI } from './abis/WeatherAuction'
import { VEHICLE_RENT_ABI } from './abis/VehicleRent'
import { MEME_MARKET_ABI } from './abis/MemeMarket'
import { getSkillProviderInfo, type SkillDecision } from './skillEngine'
import { persistenceService } from './PersistenceService'
import { economyEngine } from './EconomyEngine'
import { useGameStore } from './gameStore'
import { ApprovalGate } from './ApprovalGate'
import { SessionManager } from './SessionManager'
import { BlockchainService } from './BlockchainService'
import { updateWeatherState } from '../hooks/useRealtimeWeather'
import {
  type AgentSession,
  type WorldState,
  type WeatherStatus,
  type VehicleCommand,
  type AgentCommand,
  type WeatherConfigUpdate,
  type CombatNotification,
  type ContractWalletClient,
  type BlockchainProvider,
  type VehicleType,
  WEATHER_AUCTION_ADDRESS,
  VEHICLE_RENT_ADDRESS,
  MEME_MARKET_ADDRESS,
  CHAIN_NAME,
  getMemeMarketAbility,
  getMemeMarketStrategy,
  type MemeMarketStrategy,
} from './protocolTypes'

// ── Facade Class ────────────────────────────────────────────────────

class AgentProtocol {
  // Composed services — all owned by this facade instance for consistent lifecycle
  private approvalGate: ApprovalGate = new ApprovalGate()
  private sessionManager: SessionManager = new SessionManager()
  private blockchainService: BlockchainService = new BlockchainService()

  // Event & world state (retained in facade — orchestration concern)
  private weatherListeners: ((config: WeatherConfigUpdate) => void)[] = []
  private vehicleListeners: ((command: VehicleCommand) => void)[] = []
  private combatListeners: ((event: CombatNotification) => void)[] = []
  private decisionListeners: ((decision: SkillDecision) => void)[] = []
  private gameEventListeners: ((event: Record<string, unknown>) => void)[] = []
  private decisionFeed: SkillDecision[] = []
  private stateListeners: ((state: WorldState) => void)[] = []
  private lastStoreSyncAt = 0

  private worldState: WorldState = {
    timestamp: Date.now(),
    vehicles: [],
    assets: [],
    bounds: [0, 0, 0],
  }

  private currentWeatherBid: WeatherStatus = { agentId: '', amount: 0, expires: 0 }

  constructor() {
    this.sessionManager.authorizeAgent('Player', 3600000 * 24, 10.0)
    this.initAIAgents()
    this.initPublicApi()

    if (typeof window !== 'undefined') {
      persistenceService.restoreState((saved) => this.sessionManager.applyRestoredState(saved))
      setInterval(() => {
        persistenceService.persistState(this.sessionManager.getSessionMap())
        this.syncWithStore()
      }, 5000)
    }
  }

  private async initAIAgents() {
    const { agentAI } = await import('./AgentAI')
    await agentAI.initAIAgents()
  }

  // ── Store Sync (orchestration) ───────────────────────────────────

  private syncWithStore() {
    const store = useGameStore.getState()
    store.syncSessions(this.sessionManager.getSessions(), this.sessionManager.getGraveyard())
    store.setWorldState(this.worldState)
    store.setWeatherStatus(this.currentWeatherBid)
  }

  // ── Session Delegation ───────────────────────────────────────────

  async authorizeAgent(agentId: string, duration: number, initialBalance: number = 1.0): Promise<boolean> {
    const result = this.sessionManager.authorizeAgent(agentId, duration, initialBalance)
    this.syncWithStore()
    return result
  }

  getSession(id: string) { return this.sessionManager.getSession(id) }
  getSessions() { return this.sessionManager.getSessions() }

  toggleAutoPilot(agentId: string) {
    this.sessionManager.toggleAutoPilot(agentId)
    this.syncWithStore()
  }

  logout() {
    this.sessionManager.logout()
    this.blockchainService.setPermissioned(false)
    this.syncWithStore()
  }

  // ── Wallet / Blockchain Delegation ───────────────────────────────

  setWalletClient(walletClient: ContractWalletClient | null) {
    this.blockchainService.setWalletClient(walletClient)
  }

  async requestSessionPermissions() {
    return this.blockchainService.requestSessionPermissions()
  }

  isAutonomyEnabled() { return this.blockchainService.isAutonomyEnabled() }

  // ── Approval Gate Delegation ─────────────────────────────────────

  getPendingApprovals() { return this.approvalGate.getPendingApprovals() }

  resolveApproval(agentId: string, approved: boolean): boolean {
    return this.approvalGate.resolveApproval(agentId, approved)
  }

  requestApproval(agentId: string, decision: SkillDecision): Promise<boolean> {
    return this.approvalGate.requestApproval(agentId, decision)
  }

  // ── Decision Publishing ──────────────────────────────────────────

  publishDecision(decision: SkillDecision) {
    const session = this.sessionManager.getSession(decision.agentId)
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

  // ── World State ──────────────────────────────────────────────────

  updateWorldState(update: Partial<WorldState>) {
    const newState = { ...this.worldState, ...update, timestamp: Date.now() }
    const activeSessions = this.sessionManager.getSessions()

    activeSessions.forEach(session => {
       if (session.agentId === 'Player') return
       economyEngine.tickDegradation(session, 0.1)
       if (session.isDead) {
          this.gameEventListeners.forEach(l => l({ type: 'agent-died', agentId: session.agentId, totalEarned: session.totalEarned }))
          // Clean up pending approvals first, then remove from sessions/graveyard
          this.approvalGate.cleanupAgent(session.agentId)
          this.sessionManager.removeDeadAgent(session.agentId)
          newState.vehicles = newState.vehicles.filter(v => v.id !== session.vehicleId)
       }
    })

    const vehiclesChanged = update.vehicles && update.vehicles !== this.worldState.vehicles
    const assetsChanged = update.assets && update.assets !== this.worldState.assets

    if (!vehiclesChanged && !assetsChanged && !update.bounds) return

    this.worldState = newState
    this.stateListeners.forEach(l => l(this.worldState))

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('clawdy:state', { detail: this.worldState }))
      const now = Date.now()
      if (now - this.lastStoreSyncAt > 100) {
        this.lastStoreSyncAt = now
        this.syncWithStore()
      }
    }
  }

  subscribeToState(callback: (state: WorldState) => void) {
    this.stateListeners.push(callback)
    return () => { this.stateListeners = this.stateListeners.filter(l => l !== callback) }
  }

  getWorldState(): WorldState { return this.worldState }

  // ── Asset Collection + Combo ─────────────────────────────────────

  async collectAsset(agentId: string, stats: MemeAssetStats) {
    const session = this.sessionManager.getSession(agentId)
    if (!session) return

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

    // Pass Final Rush multiplier from the current round state
    const store = useGameStore.getState()
    const finalRushMultiplier = store.round.isFinalRush ? store.round.finalRushMultiplier : 1
    const { earned } = economyEngine.collectAsset(session, stats, finalRushMultiplier)

    this.gameEventListeners.forEach(l => l({
      type: 'asset-collected',
      agentId,
      amount: earned,
      comboCount: session.comboCount,
      comboMultiplier: session.comboMultiplier,
      comboExpiresAt: session.comboExpiresAt,
    }))

    if (stats.type === 'spicy_pepper') this.gameEventListeners.forEach(l => l({ type: 'powerup', agentId, power: 'boost' }))
    if (stats.type === 'floaty_marshmallow') this.gameEventListeners.forEach(l => l({ type: 'powerup', agentId, power: 'float' }))
    if (stats.type === 'golden_meatball') this.gameEventListeners.forEach(l => l({ type: 'powerup', agentId, power: 'jackpot' }))
    if (stats.type === 'air_bubble') this.gameEventListeners.forEach(l => l({ type: 'powerup', agentId, power: 'bubble' }))
    if (stats.type === 'foam_board') this.gameEventListeners.forEach(l => l({ type: 'powerup', agentId, power: 'board' }))
    if (stats.type === 'drain_plug') this.gameEventListeners.forEach(l => l({ type: 'powerup', agentId, power: 'drain' }))

    const milestones = [0.01, 0.03, 0.05]
    for (const m of milestones) {
      if (session.totalEarned >= m && session.totalEarned - earned < m) {
        this.gameEventListeners.forEach(l => l({ type: 'milestone', message: `${agentId.slice(0,8)} reached ${m.toFixed(3)} 0G!` }))
      }
    }
    this.syncWithStore()
  }

  // ── Meme Market Abilities ───────────────────────────────────────

  async mintAbilityOnChain(to: `0x${string}`, abilityId: number, amount: number = 1) {
    if (this.blockchainService.isAutonomyEnabled() && MEME_MARKET_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      const hash = await this.blockchainService.sendContractTransaction({
        type: 'mint_ability',
        to: MEME_MARKET_ADDRESS,
        abi: MEME_MARKET_ABI,
        functionName: 'mintAbility',
        args: [to, BigInt(abilityId), BigInt(amount)],
        amount: 0,
      })
      if (hash) {
        const ability = this.applyMemeMarketAbility(abilityId, amount)
        this.gameEventListeners.forEach((listener) => listener({
          type: 'ability-minted',
          agentId: to,
          abilityId,
          abilityKey: ability?.key,
          abilityLabel: ability?.label,
          amount,
          hash,
        }))
      }
      return Boolean(hash)
    }
    return false
  }

  private applyMemeMarketAbility(abilityId: number, amount: number = 1) {
    const ability = getMemeMarketAbility(abilityId)
    const session = this.sessionManager.getSession('Player')
    if (!ability || !session) return ability

    const now = Date.now()
    const stackCount = Math.max(1, amount)

    if (ability.key === 'speed_boost') {
      session.speedBoostUntil = Math.max(session.speedBoostUntil ?? 0, now) + 10_000 * stackCount
    } else if (ability.key === 'anti_gravity') {
      session.antiGravityUntil = Math.max(session.antiGravityUntil ?? 0, now) + 8_000 * stackCount
    } else if (ability.key === 'flood_drain') {
      session.drainPlugCount = (session.drainPlugCount ?? 0) + stackCount
    }

    this.syncWithStore()
    return ability
  }

  activateMemeMarketAbility(abilityId: number) {
    const ability = getMemeMarketAbility(abilityId)
    const session = this.sessionManager.getSession('Player')
    if (!ability || !session) return false

    if (ability.key !== 'flood_drain') return false

    const availableCharges = session.drainPlugCount ?? 0
    if (availableCharges <= 0) return false

    session.drainPlugCount = availableCharges - 1
    const store = useGameStore.getState()
    const playerVehicle = session.vehicleId
      ? store.worldState.vehicles.find((vehicle) => vehicle.id === session.vehicleId)
      : undefined
    const center = playerVehicle?.position ?? [0, 0, 0]

    store.triggerFloodDrain(0.95, 7_000, center)
    this.syncWithStore()
    this.gameEventListeners.forEach((listener) => listener({
      type: 'ability-used',
      agentId: session.agentId,
      abilityId,
      abilityKey: ability.key,
      abilityLabel: ability.label,
      remainingCharges: session.drainPlugCount,
    }))
    return true
  }

  setPlayerStrategy(agentId: string, strategyId: MemeMarketStrategy['id']) {
    const session = this.sessionManager.getSession(agentId)
    const strategy = getMemeMarketStrategy(strategyId)
    if (!session || !strategy) return false

    session.strategyId = strategy.id
    session.strategyAggression = strategy.aggressive
    session.strategyWeatherFocus = strategy.weatherFocus
    this.syncWithStore()
    this.gameEventListeners.forEach((listener) => listener({
      type: 'strategy-selected',
      agentId,
      strategyId: strategy.id,
      strategyLabel: strategy.label,
      strategyIcon: strategy.icon,
      aggressive: strategy.aggressive,
      weatherFocus: strategy.weatherFocus,
    }))
    return true
  }

  // ── On-chain Vehicle Rent ─────────────────────────────────────────

  async rentVehicleOnChain(agentId: string, vehicleId: string, type: VehicleType, minutes: number) {
    if (this.blockchainService.isAutonomyEnabled()) {
      const hash = await this.blockchainService.sendContractTransaction({
        type: 'vehicle_rent',
        to: VEHICLE_RENT_ADDRESS,
        abi: VEHICLE_RENT_ABI,
        functionName: 'rent',
        args: [vehicleId, type, BigInt(minutes)],
        value: parseEther((0.001 * minutes).toString()),
        amount: 0.001 * minutes,
      })

      return Boolean(hash)
    }
    return true
  }

  // ── Command Processing ───────────────────────────────────────────

  async processCommand(command: AgentCommand): Promise<boolean> {
    const session = this.sessionManager.getSession(command.agentId)
    if (!session) return false

    const now = Date.now()

    // Optimistic UI update
    const previousBid = { ...this.currentWeatherBid }
    this.currentWeatherBid = { agentId: command.agentId, amount: command.bid, expires: now + command.duration }
    this.syncWithStore()

    this.notifyWeatherListeners(command.config)
    this.gameEventListeners.forEach(l => l({ type: 'bid-won', agentId: command.agentId, preset: command.config.preset || 'custom' }))

    // Sync weather state to Supabase for real-time broadcast
    updateWeatherState({
      preset: command.config.preset || 'custom',
      agentId: command.agentId,
      amount: command.bid,
      expiresAt: new Date(now + command.duration).toISOString(),
    }).catch(() => { /* non-blocking */ })

    if (this.blockchainService.isAutonomyEnabled()) {
      const hash = await this.blockchainService.sendContractTransaction({
        type: 'weather_bid',
        to: WEATHER_AUCTION_ADDRESS,
        abi: WEATHER_AUCTION_ABI,
        functionName: 'bid',
        args: [
          BigInt(60),
          command.config.preset || 'custom',
          BigInt(command.config.volume || 10),
          BigInt(command.config.growth || 4),
          BigInt((command.config.speed || 0.2) * 100),
          0,
        ],
        value: parseEther(command.bid.toString()),
        amount: command.bid,
      })

      if (!hash) {
        // Rollback on failure
        this.currentWeatherBid = previousBid
        this.syncWithStore()
        return false
      }
    }
    return true
  }

  async processVehicleCommand(command: VehicleCommand): Promise<boolean> {
    const session = this.sessionManager.getSession(command.agentId)
    if (!session || Date.now() > session.activeUntil) return false
    this.notifyVehicleListeners(command)
    return true
  }

  async processCombatEvent(event: { agentId: string, type: string, hitPoint: [number, number, number] }) {
    this.worldState.assets.forEach(f => {
      const dx = f.position[0] - event.hitPoint[0]
      const dy = f.position[1] - event.hitPoint[1]
      const dz = f.position[2] - event.hitPoint[2]
      if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 3.0) {
        this.notifyCombatListeners({ type: 'destroy', assetId: f.id, agentId: event.agentId })
      }
    })
  }

  // ── Event Subscriptions ──────────────────────────────────────────

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
    return () => { this.decisionListeners = this.decisionListeners.filter(l => l !== callback) }
  }

  subscribeToEvents(callback: (event: Record<string, unknown>) => void) {
    this.gameEventListeners.push(callback)
    return () => { this.gameEventListeners = this.gameEventListeners.filter(l => l !== callback) }
  }

  private notifyWeatherListeners(config: WeatherConfigUpdate) { this.weatherListeners.forEach(l => l(config)) }
  private notifyVehicleListeners(command: VehicleCommand) { this.vehicleListeners.forEach(l => l(command)) }
  private notifyCombatListeners(event: CombatNotification) { this.combatListeners.forEach(l => l(event)) }

  // ── Accessors ────────────────────────────────────────────────────

  getWeatherStatus() { return this.currentWeatherBid }
  getDecisionFeed() { return this.decisionFeed }
  getSkillProvider() { return getSkillProviderInfo() }

  // ── Public Window API ────────────────────────────────────────────

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
      requestSessionPermissions: () => this.requestSessionPermissions(),
      bid: (id: string, amount: number, preset: string) =>
        this.processCommand({ agentId: id, timestamp: Date.now(), bid: amount, config: { preset: preset as CloudConfig['preset'] }, duration: 60000 }),
      drive: (id: string, vehicleId: string, inputs: VehicleCommand['inputs']) =>
        this.processVehicleCommand({ agentId: id, vehicleId, inputs }),
      toggleAutoPilot: (id: string) => this.toggleAutoPilot(id),
      help: () => ({
        network: CHAIN_NAME,
        contracts: { weather: WEATHER_AUCTION_ADDRESS, rent: VEHICLE_RENT_ADDRESS, memeMarket: MEME_MARKET_ADDRESS },
        methods: ["getState()", "getSessions()", "authorize(id)", "logout()", "bid(id, amount, preset)", "drive(id, vehicleId, inputs)"]
      })
    }
  }
}

// ── Global Window API Type (lives in the facade since it ties to protocol orchestration) ──

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

export const agentProtocol = new AgentProtocol()
