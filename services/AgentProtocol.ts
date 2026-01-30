import { CloudConfig } from '../components/CloudManager'
import { FoodType, FoodStats } from '../components/ProceduralFood'

export type VehicleType = 'truck' | 'tank' | 'monster' | 'speedster'

export interface WorldState {
  timestamp: number
  vehicles: {
    id: string
    type: string
    position: [number, number, number]
    rotation: [number, number, number, number]
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

export interface AgentSession {
  agentId: string
  activeUntil: number
  permissions: string[]
  totalPaid: number
  totalEarned: number
  vitality: number
  burden: number
  balance: number
  targetFoodId: number | null
}

class AgentProtocol {
  private sessions: Map<string, AgentSession> = new Map()
  private weatherListeners: ((config: any) => void)[] = []
  private vehicleListeners: ((command: VehicleCommand) => void)[] = []
  
  constructor() {
    this.authorizeAgent('Player', 3600000 * 24, 10.0)
  }

  private rentRates: Record<VehicleType, number> = {
    speedster: 0.005,
    truck: 0.002,
    tank: 0.01,
    monster: 0.008
  }

  private worldState: WorldState = {
    timestamp: Date.now(),
    vehicles: [],
    food: [],
    bounds: [0, 0, 0]
  }

  private currentWeatherBid = { agentId: '', amount: 0, expires: 0 }

  async authorizeAgent(agentId: string, duration: number, initialBalance: number = 1.0): Promise<boolean> {
    this.sessions.set(agentId, {
      agentId,
      activeUntil: Date.now() + duration,
      permissions: ['weather_control', 'food_control', 'vehicle_control'],
      totalPaid: 0,
      totalEarned: 0,
      vitality: 100,
      burden: 0,
      balance: initialBalance,
      targetFoodId: null
    })
    return true
  }

  updateWorldState(update: Partial<WorldState>) {
    this.worldState = { ...this.worldState, ...update, timestamp: Date.now() }
    
    // Auto-Targeting logic for simulation: Each agent targets the nearest food item
    this.sessions.forEach(session => {
      if (session.agentId === 'Player') return // Don't auto-target for human
      
      const agentVehicle = this.worldState.vehicles.find(v => v.id === (session.agentId === 'Agent-Zero' ? 'agent-1' : 'agent-2'))
      if (agentVehicle && this.worldState.food.length > 0) {
        let minDist = Infinity
        let nearestId = null
        
        this.worldState.food.forEach(f => {
          const dx = f.position[0] - agentVehicle.position[0]
          const dz = f.position[2] - agentVehicle.position[2]
          const dist = dx * dx + dz * dz
          if (dist < minDist) {
            minDist = dist
            nearestId = f.id
          }
        })
        session.targetFoodId = nearestId
      } else {
        session.targetFoodId = null
      }
    })
  }

  getWorldState(): WorldState {
    return this.worldState
  }

  async collectFood(agentId: string, stats: FoodStats) {
    const session = this.sessions.get(agentId)
    if (!session) return

    if (stats.nutrition === 'healthy') {
      session.vitality = Math.min(100, session.vitality + 10)
      session.burden = Math.max(0, session.burden - 5)
      const reward = 0.002
      session.totalEarned += reward
      session.balance += reward
    } else {
      session.burden = Math.min(100, session.burden + 15)
      session.vitality = Math.max(0, session.vitality - 5)
      const reward = 0.0005
      session.totalEarned += reward
      session.balance += reward
    }
    
    if (session.targetFoodId === null) { /* noop */ }
  }

  async processRent(agentId: string, vehicleType: VehicleType) {
    const session = this.sessions.get(agentId)
    if (!session) return false

    const rate = this.rentRates[vehicleType] / 60
    if (session.balance >= rate) {
      session.balance -= rate
      session.totalPaid += rate
      return true
    }
    return false
  }

  async processCommand(command: AgentCommand): Promise<boolean> {
    const session = this.sessions.get(command.agentId)
    if (!session || session.balance < command.bid) return false

    const now = Date.now()
    if (now < this.currentWeatherBid.expires && command.bid <= this.currentWeatherBid.amount) {
      return false
    }

    session.balance -= command.bid
    session.totalPaid += command.bid
    
    this.currentWeatherBid = {
      agentId: command.agentId,
      amount: command.bid,
      expires: now + command.duration
    }

    this.notifyWeatherListeners(command.config)
    return true
  }

  async processVehicleCommand(command: VehicleCommand): Promise<boolean> {
    const session = this.sessions.get(command.agentId)
    if (!session || Date.now() > session.activeUntil) return false
    this.notifyVehicleListeners(command)
    return true
  }

  subscribeToWeather(callback: (config: any) => void) {
    this.weatherListeners.push(callback)
    return () => { this.weatherListeners = this.weatherListeners.filter(l => l !== callback) }
  }

  subscribeToVehicle(callback: (command: VehicleCommand) => void) {
    this.vehicleListeners.push(callback)
    return () => { this.vehicleListeners = this.vehicleListeners.filter(l => l !== callback) }
  }

  private notifyWeatherListeners(config: any) { this.weatherListeners.forEach(l => l(config)) }
  private notifyVehicleListeners(command: VehicleCommand) { this.vehicleListeners.forEach(l => l(command)) }
  
  getSessions() { return Array.from(this.sessions.values()) }
  getSession(id: string) { return this.sessions.get(id) }
  getActiveSession(id?: string) {
    if (id) return this.sessions.get(id)
    return this.getSessions()[0]
  }
  getWeatherStatus() { return this.currentWeatherBid }
}

export const agentProtocol = new AgentProtocol()
