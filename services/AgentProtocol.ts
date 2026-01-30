import { CloudConfig } from '../components/CloudManager'
import { FoodType, FoodStats } from '../components/ProceduralFood'
import { parseEther, encodeFunctionData } from 'viem'
import { WEATHER_AUCTION_ABI } from './abis/WeatherAuction'

export type VehicleType = 'truck' | 'tank' | 'monster' | 'speedster'

export const WEATHER_AUCTION_ADDRESS = '0x0000000000000000000000000000000000000000' // REPLACE AFTER DEPLOY

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
  autoPilot: boolean
}

class AgentProtocol {
  private sessions: Map<string, AgentSession> = new Map()
  private weatherListeners: ((config: any) => void)[] = []
  private vehicleListeners: ((command: VehicleCommand) => void)[] = []
  private isPermissioned: boolean = false
  
  constructor() {
    this.authorizeAgent('Player', 3600000 * 24, 10.0)
  }

  async requestSessionPermissions(address: string) {
    if (typeof window === 'undefined' || !(window as any).ethereum) return

    try {
      const ethereum = (window as any).ethereum
      const permissions = await ethereum.request({
        method: 'wallet_requestExecutionPermissions',
        params: [{
          permission: {
            calls: [
              { to: WEATHER_AUCTION_ADDRESS, data: '0x' }
            ],
            isAdjustmentAllowed: true,
            rules: [
              {
                type: 'allowance',
                limit: parseEther('0.1').toString(),
                period: 'session'
              }
            ]
          },
          expiry: Math.floor(Date.now() / 1000) + 3600
        }]
      })

      this.isPermissioned = true
      return permissions
    } catch (error) {
      console.error('[AgentProtocol] Session Denied:', error)
      return null
    }
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
      targetFoodId: null,
      autoPilot: false
    })
    return true
  }

  toggleAutoPilot(agentId: string) {
    const session = this.sessions.get(agentId)
    if (session) session.autoPilot = !session.autoPilot
  }

  updateWorldState(update: Partial<WorldState>) {
    this.worldState = { ...this.worldState, ...update, timestamp: Date.now() }
    
    this.sessions.forEach(session => {
      if (session.agentId === 'Player') return
      const agentVehicleId = session.agentId === 'Agent-Zero' ? 'agent-1' : 'agent-2'
      const agentVehicle = this.worldState.vehicles.find(v => v.id === agentVehicleId)
      
      if (agentVehicle && this.worldState.food.length > 0) {
        let minDist = Infinity
        let nearestId: number | null = null
        
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
      }
    })
  }

  getWorldState(): WorldState { return this.worldState }

  async collectFood(agentId: string, stats: FoodStats) {
    const session = this.sessions.get(agentId)
    if (!session) return

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

  // Unified Bid: Real On-Chain or Local Simulation
  async processCommand(command: AgentCommand): Promise<boolean> {
    const session = this.sessions.get(command.agentId)
    if (!session) return false

    if (this.isPermissioned) {
      console.log(`[Base] Submitting real on-chain bid for ${command.agentId}`)
      try {
        const ethereum = (window as any).ethereum
        // @ts-ignore - Real ERC-7715 Call Execution
        await ethereum.request({
          method: 'wallet_sendCalls',
          params: [{
            calls: [{
              to: WEATHER_AUCTION_ADDRESS,
              data: encodeFunctionData({
                abi: WEATHER_AUCTION_ABI,
                functionName: 'bid',
                args: [
                  BigInt(60), // 1 minute
                  command.config.preset || 'custom',
                  BigInt(command.config.volume || 10),
                  BigInt(command.config.growth || 4),
                  BigInt((command.config.speed || 0.2) * 100),
                  0 // Color packed
                ]
              }),
              value: parseEther(command.bid.toString())
            }]
          }]
        })
      } catch (e) {
        console.error('On-chain bid failed', e)
      }
    }

    // Still update local simulation state for responsiveness
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
  isAutonomyEnabled() { return this.isPermissioned }
}

export const agentProtocol = new AgentProtocol()