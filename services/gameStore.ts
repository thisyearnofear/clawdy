import { create } from 'zustand'
import type { AgentSession, WorldState, WeatherStatus, VehicleType } from './protocolTypes'
import type { CloudConfig } from '../components/environment/CloudManager'
import { logger } from './logger'

// ── Local-storage helpers (safe for SSR) ──────────────────────────────
function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch (err) { logger.debug('[gameStore] loadFromStorage failed for', key, err); return fallback }
}
function saveToStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    if (value && typeof value === 'object' && Object.keys(value).length === 0) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  } catch (err) { logger.debug('[gameStore] saveToStorage failed for', key, err) }
}

// ── Round Structure ──────────────────────────────────────────────────
export interface RoundState {
  roundNumber: number
  startedAt: number
  endsAt: number
  endedAt?: number
  nextRoundAt?: number
  durationMs: number
  isActive: boolean
  winner: string | null
  goal: number
  isFinalRush: boolean
  finalRushMultiplier: number
  totalEarnedAtRoundStart: Record<string, number> // per-agent earnings snapshot at round start
}

const ROUND_DURATION_MS = 120_000 // 2 minutes per round
const BASE_ROUND_GOAL = 0.08 // base goal; scales with active agents
const FINAL_RUSH_SECONDS = 30 // last 30s of round
const FINAL_RUSH_MULTIPLIER = 1.5 // scoring boost in final rush

function computeRoundGoal(activeSessionCount: number): number {
  // Scale goal with active agents so rounds stay competitive
  // 1 agent: 0.08, 4 agents: 0.155, 8 agents: 0.255
  return Number((BASE_ROUND_GOAL + 0.025 * Math.max(0, activeSessionCount - 1)).toFixed(3))
}

function createInitialRound(activeSessionCount: number = 1, sessions?: Record<string, AgentSession>): RoundState {
  const now = Date.now()
  const totalEarnedAtRoundStart: Record<string, number> = {}
  if (sessions) {
    for (const [id, s] of Object.entries(sessions)) {
      totalEarnedAtRoundStart[id] = s.totalEarned ?? 0
    }
  }
  return {
    roundNumber: 1,
    startedAt: now,
    endsAt: now + ROUND_DURATION_MS,
    endedAt: undefined,
    nextRoundAt: undefined,
    durationMs: ROUND_DURATION_MS,
    isActive: true,
    winner: null,
    goal: computeRoundGoal(activeSessionCount),
    isFinalRush: false,
    finalRushMultiplier: 1,
    totalEarnedAtRoundStart,
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

// ── Handling Modes ───────────────────────────────────────────────────
export type HandlingMode = 'arcade' | 'offroad' | 'chaos'
export type VehicleHandlingProfile = 'vehicle' | 'speedster' | 'monster' | 'tank'

export interface HandlingTuning {
  speedScale: number
  accelerationScale: number
  steerScale: number
  gripScale: number
  baseLinearDamping: number
  surfaceDampingInfluence: number
  angularDamping: number
  brakingDamping: number
  carSteerResponse: number
  tankTurnResponse: number
  pitchTorqueMultiplier: number
  leanTorqueMultiplier: number
  stabilizerStrength: number
  stabilizerThreshold: number
  angularVelocityRetention: number
  speedBoostMultiplier: number
  antiGravityLift: number
}

export const HANDLING_MATRIX: Record<HandlingMode, HandlingTuning> = {
  arcade: {
    speedScale: 0.85,
    accelerationScale: 0.9,
    steerScale: 0.9,
    gripScale: 1.15,
    baseLinearDamping: 0.5,
    surfaceDampingInfluence: 1.8,
    angularDamping: 2.8,
    brakingDamping: 5.5,
    carSteerResponse: 1.1,
    tankTurnResponse: 0.75,
    pitchTorqueMultiplier: 0,
    leanTorqueMultiplier: 0,
    stabilizerStrength: 155,
    stabilizerThreshold: 0.03,
    angularVelocityRetention: 0.75,
    speedBoostMultiplier: 1.6,
    antiGravityLift: 5.5,
  },
  offroad: {
    speedScale: 0.92,
    accelerationScale: 0.9,
    steerScale: 0.95,
    gripScale: 1.0,
    baseLinearDamping: 0.4,
    surfaceDampingInfluence: 1.4,
    angularDamping: 2.2,
    brakingDamping: 5.0,
    carSteerResponse: 1.0,
    tankTurnResponse: 0.9,
    pitchTorqueMultiplier: 0.12,
    leanTorqueMultiplier: 0.08,
    stabilizerStrength: 130,
    stabilizerThreshold: 0.02,
    angularVelocityRetention: 0.80,
    speedBoostMultiplier: 1.9,
    antiGravityLift: 7.0,
  },
  chaos: {
    speedScale: 1.15,
    accelerationScale: 1.35,
    steerScale: 1.35,
    gripScale: 0.78,
    baseLinearDamping: 0.12,
    surfaceDampingInfluence: 0.9,
    angularDamping: 1.2,
    brakingDamping: 4.0,
    carSteerResponse: 1.45,
    tankTurnResponse: 1.3,
    pitchTorqueMultiplier: 0.8,
    leanTorqueMultiplier: 0.6,
    stabilizerStrength: 110,
    stabilizerThreshold: 0.01,
    angularVelocityRetention: 0.85,
    speedBoostMultiplier: 2.6,
    antiGravityLift: 10.0,
  },
}

// ── UI State ─────────────────────────────────────────────────────────
export interface UIState {
  isSidebarOpen: boolean
  activeTab: 'weather' | 'vehicles' | 'stats'
  showOnboarding: boolean
  preferredVehicleType: 'speedster' | 'truck' | null
  bidWinPreset: string | null
  isLoading: boolean
  error: string | null
  showHUD: boolean
  hideSpectatorCta: boolean
  showQuickControls: boolean
  cameraMode: 'chase' | 'wide' | 'hood' | 'free'
  vehiclesTabPulseAt: number
  modals: {
    wallet: boolean
    onboarding: boolean
    recap: boolean
    spectatorCta: boolean
  }
}

// ── Transactions ─────────────────────────────────────────────────────
export interface PendingTransaction {
  id: string
  type: 'weather_bid' | 'vehicle_rent' | 'asset_collect' | 'mint_ability' | 'mint_ability_proof'
  amount: number
  status: 'pending' | 'confirming' | 'confirmed' | 'failed'
  timestamp: number
  retryCount: number
  hash?: string
  error?: string
}

export type WeatherDomain = 'wind' | 'lightning' | 'dayNight'

export interface WeatherDomainEffect {
  domain: WeatherDomain
  label: string
  intensity: number
  startedAt: number
  expiresAt: number
  source: 'auction' | 'drop-in' | 'system'
}

// ── 0G Storage (Persistence) ─────────────────────────────────────────
export interface ZgStorageStatus {
  checkedAt?: number
  available: boolean | null
  configured: boolean | null
  network?: string
  indexer?: string
  lastError?: string
  lastUpload?: {
    key: string
    rootHash: string
    txHash?: string
    timestamp: number
  }
  lastRestore?: {
    timestamp: number
    rootHash?: string
  }
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
  activeWeatherEffects: Partial<Record<WeatherDomain, WeatherDomainEffect>>
  setWeatherEffect: (effect: WeatherDomainEffect | null, domain?: WeatherDomain) => void
  clearExpiredWeatherEffects: (now?: number) => void

  // Player
  playerId: string
  setPlayerId: (id: string) => void
  playerVehicle: VehicleType
  setPlayerVehicle: (v: VehicleType) => void
  activeHumans: number
  setActiveHumans: (count: number) => void

  // UI
  ui: UIState
  setUI: (update: Partial<UIState>) => void
  setModalOpen: (modal: keyof UIState['modals'], open: boolean) => void

  // Round
  round: RoundState
  startNewRound: () => void
  endRound: (winner: string | null) => void
  tickRound: () => void

  // Cross-round progression
  cumulativeScore: number
  addCumulativeScore: (amount: number) => void

  // Transactions
  pendingTransactions: PendingTransaction[]
  addTransaction: (tx: PendingTransaction) => void
  updateTransaction: (id: string, update: Partial<PendingTransaction>) => void
  removeTransaction: (id: string) => void

  // 0G Storage (Persistence)
  zgStorage: ZgStorageStatus
  setZgStorage: (update: Partial<ZgStorageStatus>) => void

  // Camera feedback (micro shake for impact moments)
  cameraShake: { until: number; intensity: number }
  triggerCameraShake: (intensity?: number, durationMs?: number) => void

  // Camera tracking
  cameraY: number
  setCameraY: (y: number) => void

  // Flood (visual + light gameplay hooks)
  flood: { active: boolean; intensity: number; level: number; phase: 'idle' | 'rising' | 'peak' | 'draining'; phaseChangedAt: number }
  setFlood: (update: Partial<GameStore['flood']>) => void
  floodControl: { drainStartedAt: number; drainUntil: number; drainStrength: number; drainCenter: [number, number, number] }
  triggerFloodDrain: (strength?: number, durationMs?: number, center?: [number, number, number]) => void

  // Player water interaction (readable moment-to-moment feedback)
  playerWater: { inWater: boolean; depth: number }
  setPlayerWater: (update: Partial<GameStore['playerWater']>) => void

  // Mud zone proximity warning
  nearMud: boolean
  setNearMud: (near: boolean) => void

  // Flood recap stats (per-round, player-only)
  playerFloodStats: { waterTimeMs: number; bubbleSaves: number; boardSaves: number; drainUses: number }
  addPlayerWaterTime: (deltaMs: number) => void
  addPlayerBubbleSave: () => void
  addPlayerBoardSave: () => void
  addPlayerDrainUse: () => void
  resetPlayerFloodStats: () => void

  // Gravity
  gravityMode: GravityMode
  setGravityMode: (mode: GravityMode) => void
  gravityVector: [number, number, number]

  // Handling
  handlingMode: HandlingMode
  setHandlingMode: (mode: HandlingMode) => void
  steerRetentionOverrides: Partial<Record<VehicleHandlingProfile, number>>
  setSteerRetentionOverride: (profile: VehicleHandlingProfile, value: number) => void
  clearSteerRetentionOverride: (profile: VehicleHandlingProfile) => void
  lateralGripOverrides: Partial<Record<VehicleHandlingProfile, number>>
  setLateralGripOverride: (profile: VehicleHandlingProfile, value: number) => void
  clearLateralGripOverride: (profile: VehicleHandlingProfile) => void
  accelerationOverrides: Partial<Record<VehicleHandlingProfile, number>>
  setAccelerationOverride: (profile: VehicleHandlingProfile, value: number) => void
  clearAccelerationOverride: (profile: VehicleHandlingProfile) => void
  maxSpeedOverrides: Partial<Record<VehicleHandlingProfile, number>>
  setMaxSpeedOverride: (profile: VehicleHandlingProfile, value: number) => void
  clearMaxSpeedOverride: (profile: VehicleHandlingProfile) => void
  clearAllHandlingOverrides: () => void

  // Connection
  isConnected: boolean
  setConnected: (connected: boolean) => void
}

const defaultCloudConfig: CloudConfig = {
  seed: 1, segments: 40, volume: 10, growth: 4, opacity: 0.8,
  speed: 0.2, color: '#ffffff', secondaryColor: '#e0e0e0',
  bounds: [80, 5, 80], count: 20,
  clusterBounds: [12, 3, 12],
  preset: 'stormy',
}

export const useGameStore = create<GameStore>((set, get) => ({
  // World
  worldState: { timestamp: Date.now(), vehicles: [], assets: [], bounds: [0, 0, 0] },
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
  spawnRate: 4,
  setSpawnRate: (spawnRate) => set({ spawnRate }),
  activeWeatherEffects: {},
  setWeatherEffect: (effect, domain) => set((prev) => {
    if (!effect && !domain) return prev
    const next = { ...prev.activeWeatherEffects }
    if (!effect && domain) {
      delete next[domain]
      return { activeWeatherEffects: next }
    }
    if (effect) {
      next[effect.domain] = effect
    }
    return { activeWeatherEffects: next }
  }),
  clearExpiredWeatherEffects: (now = Date.now()) => set((prev) => {
    let changed = false
    const next = { ...prev.activeWeatherEffects }
    for (const domain of Object.keys(next) as WeatherDomain[]) {
      const effect = next[domain]
      if (effect && effect.expiresAt <= now) {
        delete next[domain]
        changed = true
      }
    }
    return changed ? { activeWeatherEffects: next } : prev
  }),

  // Player
  playerId: 'anonymous',
  setPlayerId: (playerId) => set({ playerId }),
  playerVehicle: 'speedster',
  setPlayerVehicle: (playerVehicle) => set({ playerVehicle }),
  activeHumans: 0,
  setActiveHumans: (activeHumans) => set({ activeHumans }),

  // UI
  ui: {
    isSidebarOpen: false,
    activeTab: 'weather',
    showOnboarding: false,
    preferredVehicleType: null,
    bidWinPreset: null,
    isLoading: false,
    error: null,
    showHUD: true,
    hideSpectatorCta: false,
    showQuickControls: false,
    cameraMode: 'chase' as const,
    vehiclesTabPulseAt: 0,
    modals: { wallet: false, onboarding: false, recap: false, spectatorCta: false },
  },
  setUI: (update) => set((prev) => ({ ui: { ...prev.ui, ...update } })),
  setModalOpen: (modal, open) =>
    set((prev) => ({ ui: { ...prev.ui, modals: { ...prev.ui.modals, [modal]: open } } })),

  // Round
  round: createInitialRound(),
  startNewRound: () => set((prev) => {
    const now = Date.now()
    const activeCount = Object.keys(prev.sessions).length
    // Snapshot each agent's totalEarned at round start for per-round tracking
    const totalEarnedAtRoundStart: Record<string, number> = {}
    for (const [id, s] of Object.entries(prev.sessions)) {
      totalEarnedAtRoundStart[id] = s.totalEarned ?? 0
    }
    return {
      round: {
        roundNumber: prev.round.roundNumber + 1,
        startedAt: now,
        endsAt: now + ROUND_DURATION_MS,
        endedAt: undefined,
        nextRoundAt: undefined,
        durationMs: ROUND_DURATION_MS,
        isActive: true,
        winner: null,
        goal: computeRoundGoal(activeCount),
        isFinalRush: false,
        finalRushMultiplier: 1,
        totalEarnedAtRoundStart,
      },
      playerFloodStats: { waterTimeMs: 0, bubbleSaves: 0, boardSaves: 0, drainUses: 0 },
    }
  }),
  endRound: (winner) => set((prev) => {
    const now = Date.now()
    // Calculate per-round earnings: current totalEarned minus what they had at round start
    let roundEarned = 0
    if (winner) {
      const currentTotal = prev.sessions[winner]?.totalEarned ?? 0
      const startTotal = prev.round.totalEarnedAtRoundStart[winner] ?? 0
      roundEarned = currentTotal - startTotal
    }
    return {
      round: {
        ...prev.round,
        isActive: false,
        winner,
        endedAt: now,
        nextRoundAt: now + 5000,
        isFinalRush: false,
        finalRushMultiplier: 1,
      },
      cumulativeScore: prev.cumulativeScore + roundEarned,
    }
  }),
  tickRound: () => {
    const { round, sessions, endRound, startNewRound } = get()
    if (!round.isActive) return
    const now = Date.now()
    const remainingSec = Math.max(0, (round.endsAt - now) / 1000)

    // Update Final Rush state
    const isFinalRush = remainingSec <= FINAL_RUSH_SECONDS && remainingSec > 0
    if (isFinalRush !== round.isFinalRush) {
      set((prev) => ({
        round: {
          ...prev.round,
          isFinalRush,
          finalRushMultiplier: isFinalRush ? FINAL_RUSH_MULTIPLIER : 1,
        },
      }))
    }

    // Check if someone hit the goal (per-round earnings, not lifetime)
    for (const s of Object.values(sessions)) {
      const roundEarned = s.totalEarned - (round.totalEarnedAtRoundStart[s.agentId] ?? 0)
      if (roundEarned >= round.goal && round.winner === null) {
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

  // 0G Storage (Persistence)
  zgStorage: {
    available: null,
    configured: null,
  },
  setZgStorage: (update) => set((prev) => ({
    zgStorage: { ...prev.zgStorage, ...update },
  })),

  // Camera feedback
  cameraShake: { until: 0, intensity: 0 },
  triggerCameraShake: (intensity = 0.6, durationMs = 350) => set(() => ({
    cameraShake: { until: Date.now() + durationMs, intensity },
  })),

  cameraY: 0,
  setCameraY: (cameraY) => set({ cameraY }),

  // Flood
  flood: { active: false, intensity: 0, level: -2, phase: 'idle', phaseChangedAt: 0 },
  setFlood: (update) => set((prev) => ({
    flood: { ...prev.flood, ...update },
  })),
  floodControl: { drainStartedAt: 0, drainUntil: 0, drainStrength: 0, drainCenter: [0, 0, 0] },
  triggerFloodDrain: (strength = 0.9, durationMs = 7000, center: [number, number, number] = [0, 0, 0]) => set(() => ({
    floodControl: {
      drainStartedAt: Date.now(),
      drainUntil: Date.now() + durationMs,
      drainStrength: Math.max(0, Math.min(1, strength)),
      drainCenter: center,
    },
  })),

  // Player water
  playerWater: { inWater: false, depth: 0 },
  setPlayerWater: (update) => set((prev) => ({
    playerWater: { ...prev.playerWater, ...update },
  })),

  // Mud proximity warning
  nearMud: false,
  setNearMud: (nearMud) => set({ nearMud }),

  // Flood stats
  playerFloodStats: { waterTimeMs: 0, bubbleSaves: 0, boardSaves: 0, drainUses: 0 },
  addPlayerWaterTime: (deltaMs) => set((prev) => ({
    playerFloodStats: { ...prev.playerFloodStats, waterTimeMs: prev.playerFloodStats.waterTimeMs + deltaMs },
  })),
  addPlayerBubbleSave: () => set((prev) => ({
    playerFloodStats: { ...prev.playerFloodStats, bubbleSaves: prev.playerFloodStats.bubbleSaves + 1 },
  })),
  addPlayerBoardSave: () => set((prev) => ({
    playerFloodStats: { ...prev.playerFloodStats, boardSaves: prev.playerFloodStats.boardSaves + 1 },
  })),
  addPlayerDrainUse: () => set((prev) => ({
    playerFloodStats: { ...prev.playerFloodStats, drainUses: prev.playerFloodStats.drainUses + 1 },
  })),
  resetPlayerFloodStats: () => set(() => ({
    playerFloodStats: { waterTimeMs: 0, bubbleSaves: 0, boardSaves: 0, drainUses: 0 },
  })),

  // Gravity
  gravityMode: 'normal' as GravityMode,
  gravityVector: GRAVITY_VALUES.normal,
  setGravityMode: (mode) => set({ gravityMode: mode, gravityVector: GRAVITY_VALUES[mode] }),

  // Handling
  handlingMode: 'arcade' as HandlingMode,
  setHandlingMode: (handlingMode) => set({ handlingMode }),
  steerRetentionOverrides: loadFromStorage('clawdy:handling:steerRetention', {}),
  setSteerRetentionOverride: (profile, value) => set((prev) => {
    const next = { ...prev.steerRetentionOverrides, [profile]: value }
    saveToStorage('clawdy:handling:steerRetention', next)
    return { steerRetentionOverrides: next }
  }),
  clearSteerRetentionOverride: (profile) => set((prev) => {
    const next = { ...prev.steerRetentionOverrides }
    delete next[profile]
    saveToStorage('clawdy:handling:steerRetention', next)
    return { steerRetentionOverrides: next }
  }),
  lateralGripOverrides: loadFromStorage('clawdy:handling:lateralGrip', {}),
  setLateralGripOverride: (profile, value) => set((prev) => {
    const next = { ...prev.lateralGripOverrides, [profile]: value }
    saveToStorage('clawdy:handling:lateralGrip', next)
    return { lateralGripOverrides: next }
  }),
  clearLateralGripOverride: (profile) => set((prev) => {
    const next = { ...prev.lateralGripOverrides }
    delete next[profile]
    saveToStorage('clawdy:handling:lateralGrip', next)
    return { lateralGripOverrides: next }
  }),
  accelerationOverrides: loadFromStorage('clawdy:handling:acceleration', {}),
  setAccelerationOverride: (profile, value) => set((prev) => {
    const next = { ...prev.accelerationOverrides, [profile]: value }
    saveToStorage('clawdy:handling:acceleration', next)
    return { accelerationOverrides: next }
  }),
  clearAccelerationOverride: (profile) => set((prev) => {
    const next = { ...prev.accelerationOverrides }
    delete next[profile]
    saveToStorage('clawdy:handling:acceleration', next)
    return { accelerationOverrides: next }
  }),
  maxSpeedOverrides: loadFromStorage('clawdy:handling:maxSpeed', {}),
  setMaxSpeedOverride: (profile, value) => set((prev) => {
    const next = { ...prev.maxSpeedOverrides, [profile]: value }
    saveToStorage('clawdy:handling:maxSpeed', next)
    return { maxSpeedOverrides: next }
  }),
  clearMaxSpeedOverride: (profile) => set((prev) => {
    const next = { ...prev.maxSpeedOverrides }
    delete next[profile]
    saveToStorage('clawdy:handling:maxSpeed', next)
    return { maxSpeedOverrides: next }
  }),
  clearAllHandlingOverrides: () => set(() => {
    saveToStorage('clawdy:handling:steerRetention', {})
    saveToStorage('clawdy:handling:lateralGrip', {})
    saveToStorage('clawdy:handling:acceleration', {})
    saveToStorage('clawdy:handling:maxSpeed', {})
    return {
      steerRetentionOverrides: {},
      lateralGripOverrides: {},
      accelerationOverrides: {},
      maxSpeedOverrides: {},
    }
  }),

  // Cross-round progression
  cumulativeScore: 0,
  addCumulativeScore: (amount) => set((prev) => ({
    cumulativeScore: prev.cumulativeScore + amount,
  })),

  // Connection
  isConnected: false,
  setConnected: (isConnected) => set({ isConnected }),
}))
