import { VehicleType } from './AgentProtocol'

export interface QueuedPlayer {
  id: string
  address?: string
  joinedAt: number
  status: 'waiting' | 'active' | 'finished'
  vehicleId?: string
  sessionStartTime?: number
  sessionEndTime?: number
}

export interface VehicleSlot {
  id: string
  type: VehicleType
  isOccupied: boolean
  currentPlayerId?: string
  maxSessionDuration: number // in milliseconds
}

export class VehicleQueueManager {
  private queue: QueuedPlayer[] = []
  private vehicles: VehicleSlot[] = [
    { id: 'vehicle-1', type: 'speedster', isOccupied: false, maxSessionDuration: 5 * 60 * 1000 }, // 5 min
    { id: 'vehicle-2', type: 'tank', isOccupied: false, maxSessionDuration: 5 * 60 * 1000 },
    { id: 'vehicle-3', type: 'monster', isOccupied: false, maxSessionDuration: 5 * 60 * 1000 },
    { id: 'vehicle-4', type: 'truck', isOccupied: false, maxSessionDuration: 5 * 60 * 1000 },
  ]
  private activePlayerId: string | null = null
  private listeners: Set<(state: QueueState) => void> = new Set()
  private checkInterval: NodeJS.Timeout | null = null

  constructor() {
    this.startQueueProcessor()
  }

  private startQueueProcessor() {
    // Check queue every 2 seconds
    this.checkInterval = setInterval(() => {
      this.processQueue()
      this.checkExpiredSessions()
      this.notifyListeners()
    }, 2000)
  }

  private processQueue() {
    // Find waiting players and available vehicles
    const waitingPlayers = this.queue.filter(p => p.status === 'waiting')
    const availableVehicles = this.vehicles.filter(v => !v.isOccupied)

    for (const player of waitingPlayers) {
      if (availableVehicles.length === 0) break

      const vehicle = availableVehicles.shift()!
      this.assignVehicle(player, vehicle)
    }
  }

  private assignVehicle(player: QueuedPlayer, vehicle: VehicleSlot) {
    const now = Date.now()
    
    player.status = 'active'
    player.vehicleId = vehicle.id
    player.sessionStartTime = now
    player.sessionEndTime = now + vehicle.maxSessionDuration
    
    vehicle.isOccupied = true
    vehicle.currentPlayerId = player.id
    this.activePlayerId = player.id

    console.log(`[VehicleQueue] Assigned ${vehicle.id} to player ${player.id}`)
  }

  private checkExpiredSessions() {
    const now = Date.now()
    
    for (const vehicle of this.vehicles) {
      if (vehicle.isOccupied && vehicle.currentPlayerId) {
        const player = this.queue.find(p => p.id === vehicle.currentPlayerId)
        if (player && player.sessionEndTime && now > player.sessionEndTime) {
          this.releaseVehicle(player, vehicle)
        }
      }
    }
  }

  private releaseVehicle(player: QueuedPlayer, vehicle: VehicleSlot) {
    player.status = 'finished'
    player.sessionEndTime = Date.now()
    
    vehicle.isOccupied = false
    vehicle.currentPlayerId = undefined
    
    if (this.activePlayerId === player.id) {
      this.activePlayerId = null
    }

    console.log(`[VehicleQueue] Released ${vehicle.id} from player ${player.id}`)
  }

  // Public API

  joinQueue(playerId: string, address?: string): { position: number; estimatedWait: number } {
    // Check if already in queue
    const existing = this.queue.find(p => p.id === playerId)
    if (existing) {
      if (existing.status === 'active') {
        return { position: 0, estimatedWait: 0 }
      }
      const position = this.queue.filter(p => p.status === 'waiting').indexOf(existing) + 1
      return { position, estimatedWait: position * 30 } // 30 sec estimate per player
    }

    const player: QueuedPlayer = {
      id: playerId,
      address,
      joinedAt: Date.now(),
      status: 'waiting'
    }

    this.queue.push(player)
    
    const position = this.queue.filter(p => p.status === 'waiting').length
    this.notifyListeners()

    return { position, estimatedWait: position * 30 }
  }

  leaveQueue(playerId: string): boolean {
    const index = this.queue.findIndex(p => p.id === playerId)
    if (index === -1) return false

    const player = this.queue[index]
    
    // If active, release vehicle
    if (player.status === 'active' && player.vehicleId) {
      const vehicle = this.vehicles.find(v => v.id === player.vehicleId)
      if (vehicle) {
        this.releaseVehicle(player, vehicle)
      }
    }

    this.queue.splice(index, 1)
    this.notifyListeners()
    return true
  }

  getPlayerStatus(playerId: string): QueuedPlayer | undefined {
    return this.queue.find(p => p.id === playerId)
  }

  getQueueState(): QueueState {
    const waitingCount = this.queue.filter(p => p.status === 'waiting').length
    const activeCount = this.queue.filter(p => p.status === 'active').length
    
    return {
      queue: this.queue,
      vehicles: this.vehicles,
      waitingCount,
      activeCount,
      totalPlayers: this.queue.length,
      isPlayerActive: (playerId: string) => {
        const player = this.queue.find(p => p.id === playerId)
        return player?.status === 'active'
      },
      getPlayerVehicle: (playerId: string) => {
        const player = this.queue.find(p => p.id === playerId)
        if (player?.status === 'active' && player.vehicleId) {
          return this.vehicles.find(v => v.id === player.vehicleId)
        }
        return undefined
      }
    }
  }

  subscribe(listener: (state: QueueState) => void): () => void {
    this.listeners.add(listener)
    // Immediately notify with current state
    listener(this.getQueueState())
    
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notifyListeners() {
    const state = this.getQueueState()
    this.listeners.forEach(listener => listener(state))
  }

  extendSession(playerId: string, additionalMinutes: number): boolean {
    const player = this.queue.find(p => p.id === playerId)
    if (!player || player.status !== 'active') return false

    player.sessionEndTime = (player.sessionEndTime || Date.now()) + (additionalMinutes * 60 * 1000)
    this.notifyListeners()
    return true
  }

  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }
  }
}

export interface QueueState {
  queue: QueuedPlayer[]
  vehicles: VehicleSlot[]
  waitingCount: number
  activeCount: number
  totalPlayers: number
  isPlayerActive: (playerId: string) => boolean
  getPlayerVehicle: (playerId: string) => VehicleSlot | undefined
}

// Singleton instance
export const vehicleQueue = new VehicleQueueManager()
