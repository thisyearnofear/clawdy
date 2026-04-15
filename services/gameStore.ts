import { create } from 'zustand'
import type { AgentSession, WorldState, WeatherStatus } from './AgentProtocol'

interface GameState {
  // World State
  worldState: WorldState
  setWorldState: (state: Partial<WorldState>) => void
  
  // Agent Sessions
  sessions: Map<string, AgentSession>
  setSession: (agentId: string, session: Partial<AgentSession>) => void
  removeSession: (agentId: string) => void
  
  // Weather
  weatherStatus: WeatherStatus
  setWeatherStatus: (status: WeatherStatus) => void
  
  // UI State
  isLoading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void
  
  // Transaction Queue
  pendingTransactions: PendingTransaction[]
  addTransaction: (tx: PendingTransaction) => void
  updateTransaction: (id: string, update: Partial<PendingTransaction>) => void
  removeTransaction: (id: string) => void
  
  // Player State
  playerId: string
  setPlayerId: (id: string) => void
  
  // Connection State
  isConnected: boolean
  setConnected: (connected: boolean) => void
}

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

const initialWorldState: WorldState = {
  timestamp: Date.now(),
  vehicles: [],
  food: [],
  bounds: [0, 0, 0]
}

const initialWeatherStatus: WeatherStatus = {
  agentId: '',
  amount: 0,
  expires: 0
}

export const useGameStore = create<GameState>((set) => ({
  // World State
  worldState: initialWorldState,
  setWorldState: (state) => set((prev) => ({
    worldState: { ...prev.worldState, ...state, timestamp: Date.now() }
  })),
  
  // Sessions
  sessions: new Map(),
  setSession: (agentId, updates) => set((prev) => {
    const newSessions = new Map(prev.sessions)
    const existing = newSessions.get(agentId)
    newSessions.set(agentId, { ...existing, ...updates } as AgentSession)
    return { sessions: newSessions }
  }),
  removeSession: (agentId) => set((prev) => {
    const newSessions = new Map(prev.sessions)
    newSessions.delete(agentId)
    return { sessions: newSessions }
  }),
  
  // Weather
  weatherStatus: initialWeatherStatus,
  setWeatherStatus: (status) => set({ weatherStatus: status }),
  
  // UI
  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
  error: null,
  setError: (error) => set({ error }),
  
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
  
  // Player
  playerId: 'anonymous',
  setPlayerId: (playerId) => set({ playerId }),
  
  // Connection
  isConnected: false,
  setConnected: (isConnected) => set({ isConnected }),
}))