import { create } from 'zustand'
import type { AgentSession, WorldState, WeatherStatus, VehicleType } from './AgentProtocol'
import type { CloudConfig } from '../components/environment/CloudManager'

// ── Round Structure ──────────────────────────────────────────────────
export interface RoundState {
  roundNumber: number
  startedAt: number
  endsAt: number
  durationMs: number
  isActive: boolean
  winner: string | null
  goalOKB: number
}

const ROUND_DURATION_MS = 120_000 // 2 minutes per round
const ROUND_GOAL_OKB = 0.05

function createInitialRound(): RoundState {
  const now = Date.now()
  return {
    roundNumber: 1,
    startedAt: now,
    endsAt: now + ROUND_DURATION_MS,
    durationMs: ROUND_DURATION_MS,
    isActive: true,
    winner: null,
    goalOKB: ROUND_GOAL_OKB,
  }
}

// ── Gravity Modes ────────────────────────────────────────────────────
export type GravityMode = 'normal' | 'low' | 'zero' | 'hyper'

export const GRAVITY_VALUES: Record<GravityMode, [number, number, number]> = {
  normal: [0, -9.81, 0],
  low: [0, -3.0, 0],
  zero: [0, -0.5, 0],
  hyper: [0, -18.0, 0],
}

export const GRAVITY_FOR_PRESET: Record<string, GravityMode> = {
  stormy: 'hyper',
  sunset: 'normal',
  candy: 'low',
  cosmic: 'zero',
  custom: 'normal',
}

// ── UI State ─────────────────────────────────────────────────────────
export interface UIState {
  isSidebarOpen: boolean
  activeTab: 'weather' | 'vehicles' | 'stats'
  showQuickControls: boolean
  showOnboarding: boolean
  bidWinPreset: string | null
  isLoading: boolean
  error: string | null
  showHUD: boolean
}

// ── Transactions ─────────────────────────────────────────────────────
export interface PendingTransaction {
  id: string
  type: 'weather_bid' | 'vehicle_rent' | 'food_collect'
  amount: number
  status: 'pending' | 'confirming' | 'confirmed' | 'failed'
  timestamp: number
  retryCount: number
  hash?: string
  error?: string
}

// ── Cloud / Weather Config ───────────────────────────────────────────
type WeatherConfigUpdate = Partial<CloudConfig> & { spawnRate?: number }

// ── Unified Store ────────────────────────────────────────────────────
export interface GameStore {
  // World
  worldState: WorldState
  setWorldState: (state: Partial<WorldState>) => void

  // Sessions
  sessions: Record<string, AgentSession>
  deadAgents: AgentSession[]
  syncSessions: (sessions: AgentSession[], deadAgents?: AgentSession[]) => void
  setSession: (agentId: string, session: Partial<AgentSession>) => void

  // Weather
  weatherStatus: WeatherStatus
  setWeatherStatus: (status: WeatherStatus) => void
  cloudConfig: CloudConfig
  setCloudConfig: (update: WeatherConfigUpdate) => void
  spawnRate: number
  setSpawnRate: (rate: number) => void

  // Player
  playerId: string
  setPlayerId: (id: string) => void
  playerVehicle: VehicleType
  setPlayerVehicle: (v: VehicleType) => void

  // UI
  ui: UIState
  setUI: (update: Partial<UIState>) => void

  // Round
  round: RoundState
  startNewRound: () => void
  endRound: (winner: string | null) => void
  tickRound: () => void

  // Transactions
  pendingTransactions: PendingTransaction[]
  addTransaction: (tx: PendingTransaction) => void
  updateTransaction: (id: string, update: Partial<PendingTransaction>) => void
  removeTransaction: (id: string) => void

  // Gravity
  gravityMode: GravityMode
  setGravityMode: (mode: GravityMode) => void
  gravityVector: [number, number, number]

  // Connection
  isConnected: boolean
  setConnected: (connected: boolean) => void
}

const defaultCloudConfig: CloudConfig = {
  seed: 1, segments: 40, volume: 10, growth: 4, opacity: 0.8,
  speed: 0.2, color: '#ffffff', secondaryColor: '#e0e0e0',
  bounds: [80, 5, 80], count: 12,
}

export const useGameStore = create<GameStore>((set, get) => ({
  // World
  worldState: { timestamp: Date.now(), vehicles: [], food: [], bounds: [0, 0, 0] },
  setWorldState: (state) => set((prev) => ({
    worldState: { ...prev.worldState, ...state, timestamp: Date.now() },
  })),

  // Sessions
  sessions: {},
  deadAgents: [],
  syncSessions: (sessions, deadAgents = []) => {
    const map: Record<string, AgentSession> = {}
    sessions.forEach(s => { map[s.agentId] = s })
    set({ sessions: map, deadAgents })
  },
  setSession: (agentId, updates) => set((prev) => {
    const existing = prev.sessions[agentId]
    if (!existing) return prev
    return {
      sessions: {
        ...prev.sessions,
        [agentId]: { ...existing, ...updates }
      }
    }
  }),

  // Weather
  weatherStatus: { agentId: '', amount: 0, expires: 0 },
  setWeatherStatus: (status) => set({ weatherStatus: status }),
  cloudConfig: defaultCloudConfig,
  setCloudConfig: (update) => set((prev) => ({
    cloudConfig: { ...prev.cloudConfig, ...update, preset: update.preset ?? 'custom' },
    spawnRate: update.spawnRate ?? prev.spawnRate,
  })),
  spawnRate: 2,
  setSpawnRate: (spawnRate) => set({ spawnRate }),

  // Player
  playerId: 'anonymous',
  setPlayerId: (playerId) => set({ playerId }),
  playerVehicle: 'speedster',
  setPlayerVehicle: (playerVehicle) => set({ playerVehicle }),

  // UI
  ui: {
    isSidebarOpen: false,
    activeTab: 'weather',
    showQuickControls: false,
    showOnboarding: false,
    bidWinPreset: null,
    isLoading: false,
    error: null,
    showHUD: true,
  },
  setUI: (update) => set((prev) => ({ ui: { ...prev.ui, ...update } })),

  // Round
  round: createInitialRound(),
  startNewRound: () => set((prev) => {
    const now = Date.now()
    return {
      round: {
        roundNumber: prev.round.roundNumber + 1,
        startedAt: now,
        endsAt: now + ROUND_DURATION_MS,
        durationMs: ROUND_DURATION_MS,
        isActive: true,
        winner: null,
        goalOKB: ROUND_GOAL_OKB,
      },
    }
  }),
  endRound: (winner) => set((prev) => ({
    round: { ...prev.round, isActive: false, winner },
  })),
  tickRound: () => {
    const { round, sessions, endRound, startNewRound } = get()
    if (!round.isActive) return
    const now = Date.now()
    // Check if someone hit the goal
    for (const s of Object.values(sessions)) {
      if (s.totalEarned >= round.goalOKB && round.winner === null) {
        endRound(s.agentId)
        setTimeout(() => startNewRound(), 5000) // 5s celebration then new round
        return
      }
    }
    // Check time expiry
    if (now >= round.endsAt) {
      // Find leader
      let leader: string | null = null
      let maxEarned = 0
      for (const s of Object.values(sessions)) {
        if (s.totalEarned > maxEarned) { maxEarned = s.totalEarned; leader = s.agentId }
      }
      endRound(leader)
      setTimeout(() => startNewRound(), 5000)
    }
  },

  // Transactions
  pendingTransactions: [],
  addTransaction: (tx) => set((prev) => ({
    pendingTransactions: [...prev.pendingTransactions, tx]
  })),
  updateTransaction: (id, update) => set((prev) => ({
    pendingTransactions: prev.pendingTransactions.map((t) => 
      t.id === id ? { ...t, ...update } : t
    )
  })),
  removeTransaction: (id) => set((prev) => ({
    pendingTransactions: prev.pendingTransactions.filter((t) => t.id !== id)
  })),

  // Gravity
  gravityMode: 'normal' as GravityMode,
  gravityVector: GRAVITY_VALUES.normal,
  setGravityMode: (mode) => set({ gravityMode: mode, gravityVector: GRAVITY_VALUES[mode] }),

  // Connection
  isConnected: false,
  setConnected: (isConnected) => set({ isConnected }),
}))
