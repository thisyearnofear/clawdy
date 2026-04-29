import { CloudConfig } from '../components/environment/CloudManager'
import { primaryChain } from './web3Config'

// ── Core Types ──────────────────────────────────────────────────────

export type VehicleType = 'truck' | 'tank' | 'monster' | 'speedster'
export type AgentRole = 'operator' | 'scout' | 'weather' | 'mobility' | 'treasury'

export const AGENT_ROLE_CONFIG: Record<AgentRole, { label: string; permissions: string[] }> = {
  operator: { label: 'Operator', permissions: ['wallet_connect', 'autonomy_init', 'manual_override'] },
  scout: { label: 'Scout Agent', permissions: ['asset_control', 'route_planning'] },
  weather: { label: 'Weather Agent', permissions: ['weather_control', 'bid_execution'] },
  mobility: { label: 'Mobility Agent', permissions: ['vehicle_control', 'session_extend'] },
  treasury: { label: 'Treasury Agent', permissions: ['spend_policy', 'budget_control'] },
}

// ── Session ─────────────────────────────────────────────────────────

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
  shieldUntil?: number
  strategyId?: MemeMarketStrategy['id']
  strategyAggression?: number
  strategyWeatherFocus?: number
  agentLoyalty: number
  isDead?: boolean
}

// ── World State ─────────────────────────────────────────────────────

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

export interface WeatherStatus {
  agentId: string
  amount: number
  expires: number
}

// ── Command Types ───────────────────────────────────────────────────

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

export type WeatherConfigUpdate = Partial<CloudConfig> & { spawnRate?: number }

export interface CombatNotification {
  type: 'destroy'
  assetId: number
  agentId: string
}

// ── Per-chain Contract Address Registry ─────────────────────────────

interface ChainContracts {
  weatherAuction: `0x${string}`
  vehicleRent: `0x${string}`
  memeMarket: `0x${string}`
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

export const CONTRACT_ADDRESSES: Record<number, ChainContracts> = {
  // 0G Galileo Testnet (chainId 16602)
  16602: {
    weatherAuction: '0x21506d1ba6ac219b7dbb893fdb009af62f3b25b0',
    vehicleRent: '0xd98cb26dcc3a3b01404564568cbf2de1dc3de652',
    memeMarket: '0x44c07afa8340450167796390a8cc493b1aca0dd1',
  },
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
  return {
    weatherAuction: (process.env.NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS || ZERO_ADDRESS) as `0x${string}`,
    vehicleRent: (process.env.NEXT_PUBLIC_VEHICLE_RENT_ADDRESS || ZERO_ADDRESS) as `0x${string}`,
    memeMarket: (process.env.NEXT_PUBLIC_MEME_MARKET_ADDRESS || ZERO_ADDRESS) as `0x${string}`,
  }
}

/** Check whether contracts are deployed on a given chain. */
export function isChainSupported(chainId: number): boolean {
  if (chainId in CONTRACT_ADDRESSES) return true
  const contracts = getContractsForChain(chainId)
  return contracts.weatherAuction !== ZERO_ADDRESS ||
         contracts.vehicleRent !== ZERO_ADDRESS ||
         contracts.memeMarket !== ZERO_ADDRESS
}

// Legacy single-address exports (resolve from primary chain for backward compat)
const _primary = getContractsForChain(primaryChain.id)
export const WEATHER_AUCTION_ADDRESS = _primary.weatherAuction
export const VEHICLE_RENT_ADDRESS = _primary.vehicleRent
export const MEME_MARKET_ADDRESS = _primary.memeMarket
export const DEFAULT_WEATHER_AUCTION_ADDRESS = ZERO_ADDRESS
export const DEFAULT_VEHICLE_RENT_ADDRESS = ZERO_ADDRESS
export const DEFAULT_MEME_MARKET_ADDRESS = ZERO_ADDRESS
export const CHAIN_NAME = primaryChain.name

// ── Meme Market Strategies & Abilities ──────────────────────────────

export const MEME_MARKET_ABILITIES = [
  { id: 1, key: 'speed_boost', label: 'Speed Boost', source: 'Spicy Pepper' },
  { id: 2, key: 'anti_gravity', label: 'Anti-Gravity', source: 'Floaty Marshmallow' },
  { id: 3, key: 'flood_drain', label: 'Flood Drain', source: 'Drain Plug' },
  { id: 4, key: 'air_bubble', label: 'Air Bubble', source: 'Bubble Wrap' },
  { id: 5, key: 'foam_board', label: 'Foam Board', source: 'Foam Pad' },
  { id: 6, key: 'shield', label: 'Force Field', source: 'Bubble Shield' },
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
    return { tone: 'Unclassified', moves, earnedText, compact: `${moves} moves · ${earnedText}` }
  }

  const tone = strategy.aggressive >= 0.7
    ? 'Aggressive'
    : strategy.weatherFocus >= 0.7
      ? 'Weather-led'
      : strategy.id === 'hoarder'
        ? 'Collector'
        : 'Balanced'

  return { tone, moves, earnedText, compact: `${tone} · ${moves} moves · ${earnedText}` }
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
    case 'conservative': return 'truck'
    case 'aggressive': return 'monster'
    case 'hoarder': return 'tank'
    default: return 'speedster'
  }
}

export const getMemeMarketStrategyPreset = (strategyId?: string): NonNullable<CloudConfig['preset']> => {
  const strategy = getMemeMarketStrategy(strategyId)
  if (!strategy) return 'custom'
  switch (strategy.id) {
    case 'conservative': return 'sunset'
    case 'aggressive': return 'stormy'
    case 'hoarder': return 'candy'
    default: return 'custom'
  }
}

// ── Blockchain Provider Types ────────────────────────────────────────

export interface BlockchainProvider {
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
