import { CloudConfig } from '../components/environment/CloudManager'
import { MemeAssetStats } from '../components/environment/MemeAssets'
import { parseEther, encodeFunctionData, toHex } from 'viem'
import { WEATHER_AUCTION_ABI } from './abis/WeatherAuction'
import { VEHICLE_RENT_ABI } from './abis/VehicleRent'
import { MEME_MARKET_ABI } from './abis/MemeMarket'
import { getSkillProviderInfo, SkillDecision } from './skillEngine'
import { persistenceService } from './PersistenceService'
import { economyEngine } from './EconomyEngine'
import { useGameStore } from './gameStore'

export type VehicleType = 'truck' | 'tank' | 'monster' | 'speedster'
export type AgentRole = 'operator' | 'scout' | 'weather' | 'mobility' | 'treasury'

import { primaryChain, supportedChains } from './web3Config'
import { emitToast } from '../components/ui/GameToasts'

export const CHAIN_NAME = primaryChain.name

export const AGENT_ROLE_CONFIG: Record<
  AgentRole,
  { label: string; permissions: string[] }
> = {
  operator: { label: 'Operator', permissions: ['wallet_connect', 'autonomy_init', 'manual_override'] },
  scout: { label: 'Scout Agent', permissions: ['asset_control', 'route_planning'] },
  weather: { label: 'Weather Agent', permissions: ['weather_control', 'bid_execution'] },
  mobility: { label: 'Mobility Agent', permissions: ['vehicle_control', 'session_extend'] },
  treasury: { label: 'Treasury Agent', permissions: ['spend_policy', 'budget_control'] },
}

// ── Per-chain contract address registry ──────────────────────────────
// Update these after each deployment. The app resolves addresses dynamically
// based on the connected wallet's chain ID — no rebuild required.
interface ChainContracts {
  weatherAuction: `0x${string}`
  vehicleRent: `0x${string}`
  memeMarket: `0x${string}`
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

export const CONTRACT_ADDRESSES: Record<number, ChainContracts> = {
  // X-Layer Testnet (chainId 195)
  195: {
    weatherAuction: '0x3d183dc932ea183a8acb2aabb451a456892150ba',
    vehicleRent: '0xf02f7bedb7cb6be02ee52f7f0286b4c3f1dbc0fb',
    memeMarket: '0x7568d551495cfba8de11ad8af31100d58563fd1e',
  },
  // BNB Testnet (chainId 97)
  97: {
    weatherAuction: '0x0094ba23b76bb2802356d76e96ec067797d07009',
    vehicleRent: '0x92e5425f9d2f113445097e5490e77cd234c0d3ca',
    memeMarket: '0x2e8463a8a0355a3e601cc313bdcdbe6d77e46f9b',
  },
}

/** Resolve contract addresses for a given chain ID. Falls back to env vars, then zero address. */
export function getContractsForChain(chainId: number): ChainContracts {
  if (CONTRACT_ADDRESSES[chainId]) return CONTRACT_ADDRESSES[chainId]
  // Fallback: env-var overrides (for chains not yet in the registry)
  return {
    weatherAuction: (process.env.NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS || ZERO_ADDRESS) as `0x${string}`,
    vehicleRent: (process.env.NEXT_PUBLIC_VEHICLE_RENT_ADDRESS || ZERO_ADDRESS) as `0x${string}`,
    memeMarket: (process.env.NEXT_PUBLIC_MEME_MARKET_ADDRESS || ZERO_ADDRESS) as `0x${string}`,
  }
}

/** Check whether contracts are deployed on a given chain. */
export function isChainSupported(chainId: number): boolean {
  return chainId in CONTRACT_ADDRESSES
}

// Legacy single-address exports (resolve from primary chain for backward compat)
const _primary = getContractsForChain(primaryChain.id)
export const WEATHER_AUCTION_ADDRESS = _primary.weatherAuction
export const VEHICLE_RENT_ADDRESS = _primary.vehicleRent
export const MEME_MARKET_ADDRESS = _primary.memeMarket
export const DEFAULT_WEATHER_AUCTION_ADDRESS = ZERO_ADDRESS
export const DEFAULT_VEHICLE_RENT_ADDRESS = ZERO_ADDRESS
export const DEFAULT_MEME_MARKET_ADDRESS = ZERO_ADDRESS

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
  assets: {
    id: number
    type: string
    rarity: string
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
  assetId: number
  agentId: string
}

interface BlockchainProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

export interface ContractWalletClient {
  writeContract(args: {
    address: `0x${string}`
    abi: unknown
    functionName: string
    args: readonly unknown[]
    value?: bigint
  }): Promise<`0x${string}`>
}

export const MEME_MARKET_ABILITIES = [
  { id: 1, key: 'speed_boost', label: 'Speed Boost', source: 'Spicy Pepper' },
  { id: 2, key: 'anti_gravity', label: 'Anti-Gravity', source: 'Floaty Marshmallow' },
  { id: 3, key: 'flood_drain', label: 'Flood Drain', source: 'Drain Plug' },
] as const

export type MemeMarketAbility = (typeof MEME_MARKET_ABILITIES)[number]

export const getMemeMarketAbility = (abilityId: number) =>
  MEME_MARKET_ABILITIES.find((ability) => ability.id === abilityId)

export const MEME_MARKET_STRATEGIES = [
  { id: 'conservative', label: 'Defensive', aggressive: 0.2, weatherFocus: 0.3, icon: '🛡️' },
  { id: 'balanced', label: 'Balanced', aggressive: 0.5, weatherFocus: 0.5, icon: '⚖️' },
  { id: 'aggressive', label: 'Aggressive', aggressive: 0.85, weatherFocus: 0.85, icon: '⚔️' },
  { id: 'hoarder', label: 'Collector', aggressive: 0.3, weatherFocus: 0.95, icon: '💎' },
] as const

export type MemeMarketStrategy = (typeof MEME_MARKET_STRATEGIES)[number]

export const getMemeMarketStrategy = (strategyId?: string) =>
  MEME_MARKET_STRATEGIES.find((strategy) => strategy.id === strategyId)

export interface MemeMarketStrategySummaryEntry {
  strategyId?: string
  executedBidCount: number
  executedRentCount: number
  totalEarned: number
}

export interface MemeMarketStrategySummary {
  tone: string
  moves: number
  earnedText: string
  compact: string
}

export const getMemeMarketStrategySummary = (entry: MemeMarketStrategySummaryEntry): MemeMarketStrategySummary => {
  const strategy = getMemeMarketStrategy(entry.strategyId)
  const moves = entry.executedBidCount + entry.executedRentCount
  const earnedText = `${entry.totalEarned.toFixed(3)} 0G`

  if (!strategy) {
    return {
      tone: 'Unclassified',
      moves,
      earnedText,
      compact: `${moves} moves · ${earnedText}`,
    }
  }

  const tone = strategy.aggressive >= 0.7
    ? 'Aggressive'
    : strategy.weatherFocus >= 0.7
      ? 'Weather-led'
      : strategy.id === 'hoarder'
        ? 'Collector'
        : 'Balanced'

  return {
    tone,
    moves,
    earnedText,
    compact: `${tone} · ${moves} moves · ${earnedText}`,
  }
}

export const getMemeMarketStrategyBidMultiplier = (strategyId?: string) => {
  const strategy = getMemeMarketStrategy(strategyId)
  if (!strategy) return 1
  return Number((1 + strategy.aggressive * 0.35 + strategy.weatherFocus * 0.25).toFixed(2))
}

export const getMemeMarketStrategyVehicle = (strategyId?: string): VehicleType => {
  const strategy = getMemeMarketStrategy(strategyId)
  if (!strategy) return 'speedster'

  switch (strategy.id) {
    case 'conservative':
      return 'truck'
    case 'aggressive':
      return 'monster'
    case 'hoarder':
      return 'tank'
    default:
      return 'speedster'
  }
}

export const getMemeMarketStrategyPreset = (strategyId?: string): NonNullable<CloudConfig['preset']> => {
  const strategy = getMemeMarketStrategy(strategyId)
  if (!strategy) return 'custom'

  switch (strategy.id) {
    case 'conservative':
      return 'sunset'
    case 'aggressive':
      return 'stormy'
    case 'hoarder':
      return 'candy'
    default:
      return 'custom'
  }
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
  targetAssetId: number | null
  autoPilot: boolean
  decisionCount: number
  executedBidCount: number
  executedRentCount: number
  collectedCount: number
  lastSkillProvider?: string
  isRealOnChain?: boolean
  comboCount?: number
  comboMultiplier?: number
  comboExpiresAt?: number
  lastCollectAt?: number
  speedBoostUntil?: number
  antiGravityUntil?: number
  airBubbleUntil?: number
  airBubbleCount?: number
  foamBoardUntil?: number
  foamBoardCount?: number
  drainPlugCount?: number
  strategyId?: MemeMarketStrategy['id']
  strategyAggression?: number
  strategyWeatherFocus?: number
  agentLoyalty: number
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
  private walletClient: ContractWalletClient | null = null
  private decisionFeed: SkillDecision[] = []
  
  private worldState: WorldState = {
    timestamp: Date.now(),
    vehicles: [],
    assets: [],
    bounds: [0, 0, 0]
  }

  private currentWeatherBid: WeatherStatus = { agentId: '', amount: 0, expires: 0 }

  constructor() {
    this.authorizeAgent('Player', 3600000 * 24, 10.0)
    this.initAIAgents()
    this.initPublicApi()
    
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

  setWalletClient(walletClient: ContractWalletClient | null) {
    this.walletClient = walletClient
  }

  private getEthereumProvider() {
    if (typeof window === 'undefined') return null
    return window.ethereum ?? null
  }

  private async getWalletAddress() {
    const ethereum = this.getEthereumProvider()
    if (!ethereum) return null

    const accounts = (await ethereum.request({ method: 'eth_accounts' })) as string[]
    if (accounts?.[0]) return accounts[0]

    const requested = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[]
    return requested?.[0] ?? null
  }

  private trackTransaction(
    type: 'weather_bid' | 'vehicle_rent' | 'mint_ability',
    amount: number,
    hash?: string,
    error?: string,
  ) {
    const store = useGameStore.getState()
    const txId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    store.addTransaction({
      id: txId,
      type,
      amount,
      status: error ? 'failed' : hash ? 'confirmed' : 'pending',
      timestamp: Date.now(),
      retryCount: 0,
      hash,
      error,
    })

    return txId
  }

  private async sendContractTransaction(params: {
    type: 'weather_bid' | 'vehicle_rent' | 'mint_ability'
    to: `0x${string}`
    abi: unknown
    functionName: string
    args: readonly unknown[]
    amount: number
    value?: bigint
  }) {
    const txId = this.trackTransaction(params.type, params.amount)
    const store = useGameStore.getState()
    const typeLabel = params.type === 'weather_bid' ? 'Weather Bid' : params.type === 'vehicle_rent' ? 'Vehicle Rent' : 'Mint Ability'

    // Chain guard: verify the wallet is on a chain with deployed contracts
    try {
      const ethereum = this.getEthereumProvider()
      if (ethereum) {
        const chainIdHex = (await ethereum.request({ method: 'eth_chainId' })) as string
        const connectedChainId = parseInt(chainIdHex, 16)
        if (!isChainSupported(connectedChainId)) {
          const supportedNames = Object.keys(CONTRACT_ADDRESSES)
            .map(id => supportedChains.find(c => c.id === Number(id))?.name ?? `Chain ${id}`)
            .join(', ')
          const msg = `No contracts deployed on this chain. Switch to: ${supportedNames}`
          store.updateTransaction(txId, { status: 'failed', error: msg })
          emitToast('bid-lose', `${typeLabel} Failed`, msg)
          return null
        }
      }
    } catch { /* non-blocking — proceed and let the tx itself fail if chain is wrong */ }

    try {
      store.updateTransaction(txId, { status: 'confirming' })
      emitToast('milestone', `${typeLabel} Submitted`, 'Waiting for confirmation...')

      if (this.walletClient) {
        const hash = await this.walletClient.writeContract({
          address: params.to,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args,
          ...(params.value !== undefined ? { value: params.value } : {}),
        }) as string

        store.updateTransaction(txId, { status: 'confirmed', hash })
        emitToast('collect', `${typeLabel} Confirmed`, `Tx: ${hash.slice(0, 10)}…`)
        return hash
      }

      const ethereum = this.getEthereumProvider()
      if (!ethereum) return null

      const from = await this.getWalletAddress()
      if (!from) return null

      const hash = (await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from,
          to: params.to,
          data: encodeFunctionData({
            abi: params.abi,
            functionName: params.functionName,
            args: params.args,
          } as Parameters<typeof encodeFunctionData>[0]),
          ...(params.value !== undefined ? { value: toHex(params.value) } : {}),
        }],
      })) as string

      store.updateTransaction(txId, { status: 'confirmed', hash })
      emitToast('collect', `${typeLabel} Confirmed`, `Tx: ${hash.slice(0, 10)}…`)
      return hash
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      store.updateTransaction(txId, { status: 'failed', error: message })
      emitToast('bid-lose', `${typeLabel} Failed`, message.slice(0, 60))
      return null
    }
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

  async requestSessionPermissions() {
    const ethereum = this.getEthereumProvider()
    if (!ethereum) return null
    try {
      const permissions = await ethereum.request({ method: 'eth_requestAccounts' })
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
    const newState = { ...this.worldState, ...update, timestamp: Date.now() }
    const activeSessions = Array.from(this.sessions.values())
    
    activeSessions.forEach(session => {
       if (session.agentId === 'Player') return
       economyEngine.tickDegradation(session, 0.1)
       if (session.isDead) {
          this.gameEventListeners.forEach(l => l({ type: 'agent-died', agentId: session.agentId, totalEarned: session.totalEarned }))
          this.graveyard.push({ ...session })
          if (this.graveyard.length > 20) this.graveyard.shift()
          this.sessions.delete(session.agentId)
          newState.vehicles = newState.vehicles.filter(v => v.id !== session.vehicleId)
       }
    })

    const vehiclesChanged = update.vehicles && JSON.stringify(update.vehicles) !== JSON.stringify(this.worldState.vehicles)
    const assetsChanged = update.assets && JSON.stringify(update.assets) !== JSON.stringify(this.worldState.assets)
    
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

  private lastStoreSyncAt = 0

  subscribeToState(callback: (state: WorldState) => void) {
    this.stateListeners.push(callback)
    return () => { this.stateListeners = this.stateListeners.filter(l => l !== callback) }
  }

  getWorldState(): WorldState { return this.worldState }

  async collectAsset(agentId: string, stats: MemeAssetStats) {
    const session = this.sessions.get(agentId)
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
    
    const { earned } = economyEngine.collectAsset(session, stats)
    
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

  async mintAbilityOnChain(to: `0x${string}`, abilityId: number, amount: number = 1) {
    if (this.isPermissioned && MEME_MARKET_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      const hash = await this.sendContractTransaction({
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
    const session = this.sessions.get('Player')
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
    const session = this.sessions.get('Player')
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
    const session = this.sessions.get(agentId)
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

  async rentVehicleOnChain(agentId: string, vehicleId: string, type: VehicleType, minutes: number) {
    if (this.isPermissioned) {
      const hash = await this.sendContractTransaction({
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

  async processCommand(command: AgentCommand): Promise<boolean> {
    const session = this.sessions.get(command.agentId)
    if (!session) return false
    
    const now = Date.now()
    
    // Optimistic UI update
    const previousBid = { ...this.currentWeatherBid }
    this.currentWeatherBid = { agentId: command.agentId, amount: command.bid, expires: now + command.duration }
    this.syncWithStore()
    
    this.notifyWeatherListeners(command.config)
    this.gameEventListeners.forEach(l => l({ type: 'bid-won', agentId: command.agentId, preset: command.config.preset || 'custom' }))
    
    if (this.isPermissioned) {
      const hash = await this.sendContractTransaction({
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
    const session = this.sessions.get(command.agentId)
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
