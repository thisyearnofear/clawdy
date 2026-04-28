import { agentProtocol } from './AgentProtocol'
import type { VehicleType } from './protocolTypes'
import { trackEvent } from './analytics'

export interface QueuedPlayer {
  id: string
  address?: string
  joinedAt: number
  status: 'waiting' | 'active'
  type: 'human' | 'agent'
  priority: number
  isGhost: boolean
  preferredVehicleType?: 'speedster' | 'truck'
  vehicleId?: string
  sessionStartTime?: number
  sessionEndTime?: number
}

export interface VehicleSlot {
  id: string
  type: VehicleType
  isOccupied: boolean
  allowedTypes: ('human' | 'agent')[]
  currentPlayerId?: string
  maxSessionDuration: number // in milliseconds
}

export class VehicleQueueManager {
  private queue: QueuedPlayer[] = []
  // Separate caps (recommended): humans always have room even if agents fill up, and vice versa.
  // We express caps via per-slot allowedTypes rather than a second queue system.
  private vehicles: VehicleSlot[] = [
    // Human slots
    { id: 'vehicle-1', type: 'speedster', isOccupied: false, allowedTypes: ['human'], maxSessionDuration: 5 * 60 * 1000 },
    { id: 'vehicle-2', type: 'truck', isOccupied: false, allowedTypes: ['human'], maxSessionDuration: 5 * 60 * 1000 },
    // Agent slots
    { id: 'vehicle-3', type: 'tank', isOccupied: false, allowedTypes: ['agent'], maxSessionDuration: 5 * 60 * 1000 },
    { id: 'vehicle-4', type: 'monster', isOccupied: false, allowedTypes: ['agent'], maxSessionDuration: 5 * 60 * 1000 },
  ]
  private listeners: Set<(state: QueueState) => void> = new Set()
  private checkInterval: NodeJS.Timeout | null = null

  constructor() {
    this.startQueueProcessor()
  }

  private startQueueProcessor() {
    this.checkInterval = setInterval(() => {
      this.processQueue()
      this.checkExpiredSessions()
      this.notifyListeners()
    }, 2000)
  }

  private processQueue() {
    // Sort waiting players by priority (desc) then by joinedAt (asc)
    const waitingPlayers = this.queue
      .filter(p => p.status === 'waiting')
      .sort((a, b) => b.priority - a.priority || a.joinedAt - b.joinedAt)

    for (const player of waitingPlayers) {
      const availableVehicle =
        (player.preferredVehicleType && this.vehicles.find(v => !v.isOccupied && v.allowedTypes.includes(player.type) && v.type === player.preferredVehicleType)) ||
        this.vehicles.find(v => !v.isOccupied && v.allowedTypes.includes(player.type))
      if (!availableVehicle) {
        player.isGhost = true // If waiting, they are in ghost mode
        continue
      }

      this.assignVehicle(player, availableVehicle)
    }
  }

  private assignVehicle(player: QueuedPlayer, vehicle: VehicleSlot) {
    const now = Date.now()
    
    player.status = 'active'
    player.isGhost = false
    player.vehicleId = vehicle.id
    player.sessionStartTime = now
    player.sessionEndTime = now + vehicle.maxSessionDuration
    
    vehicle.isOccupied = true
    vehicle.currentPlayerId = player.id

    // For AI agents, bind their active vehicle id to the slot id so agent commands apply.
    // (Avoids introducing a parallel “agent vehicle registry”.)
    if (player.type === 'agent') {
      const session = agentProtocol.getSession(player.id)
      if (session) {
        session.vehicleId = vehicle.id
      }
    }

    console.log(`[VehicleQueue] Assigned ${vehicle.id} to ${player.type} ${player.id}`)
    trackEvent('queue_activated', {
      playerId: player.id,
      type: player.type,
      walletAddress: player.address,
      vehicleId: vehicle.id,
      vehicleType: vehicle.type,
      waitMs: now - player.joinedAt,
      queueSizeAtActivation: this.queue.filter(p => p.status === 'waiting').length,
    })
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
    // Rotation: after a session ends, immediately return the player to the waiting lane.
    // This keeps the queue stable and prevents “stuck finished users”.
    player.status = 'waiting'
    player.isGhost = true
    player.joinedAt = Date.now()
    player.vehicleId = undefined
    player.sessionStartTime = undefined
    player.sessionEndTime = undefined
    
    vehicle.isOccupied = false
    vehicle.currentPlayerId = undefined

    console.log(`[VehicleQueue] Released ${vehicle.id} from ${player.type} ${player.id}`)
    trackEvent('queue_left', {
      playerId: player.id,
      type: player.type,
      walletAddress: player.address,
      vehicleId: vehicle.id,
      vehicleType: vehicle.type,
      reason: 'session_expired',
    })
  }

  // Public API

  joinQueue(playerId: string, type: 'human' | 'agent' = 'human', priority: number = 0, address?: string, preferredVehicleType?: 'speedster' | 'truck'): { position: number; estimatedWait: number } {
    const existing = this.queue.find(p => p.id === playerId)
    if (existing) {
      if (existing.status === 'active') return { position: 0, estimatedWait: 0 }
      // Ensure they are actually queued (defensive).
      existing.status = 'waiting'
      existing.isGhost = true
      existing.type = type
      existing.priority = Math.max(existing.priority, priority)
      if (address) existing.address = address
    }

    if (!existing) {
      const player: QueuedPlayer = {
        id: playerId,
        address,
        joinedAt: Date.now(),
        status: 'waiting',
        type,
        priority,
        isGhost: true,
        preferredVehicleType,
      }
      this.queue.push(player)
    } else if (preferredVehicleType) {
      existing.preferredVehicleType = preferredVehicleType
    }
    this.notifyListeners()
    
    const waitingCount = this.queue.filter(p => p.status === 'waiting' && p.type === type).length

    const waiting = this.queue
      .filter(p => p.status === 'waiting' && p.type === type)
      .sort((a, b) => b.priority - a.priority || a.joinedAt - b.joinedAt)
    const position = waiting.findIndex(p => p.id === playerId) + 1

    trackEvent('queue_joined', {
      playerId,
      type,
      walletAddress: address,
      position,
      estimatedWait: position * 30,
    })

    return { position, estimatedWait: position * 30 }
  }

  leaveQueue(playerId: string): boolean {
    const index = this.queue.findIndex(p => p.id === playerId)
    if (index === -1) return false

    const player = this.queue[index]
    const wasActive = player.status === 'active'

    if (wasActive && player.vehicleId) {
      const vehicle = this.vehicles.find(v => v.id === player.vehicleId)
      if (vehicle) this.releaseVehicle(player, vehicle)
    }

    this.queue.splice(index, 1)
    this.notifyListeners()

    if (!wasActive) {
      trackEvent('queue_left', {
        playerId,
        type: player.type,
        walletAddress: player.address,
        reason: 'manual_leave_waiting',
      })
    }
    return true
  }

  bumpPriority(playerId: string, delta: number, reason: string): number | null {
    const player = this.queue.find(p => p.id === playerId)
    if (!player) return null
    const before = player.priority
    player.priority = Math.max(0, Math.min(10, player.priority + delta))
    this.notifyListeners()
    trackEvent('queue_priority_changed', {
      playerId,
      type: player.type,
      before,
      after: player.priority,
      delta,
      reason,
    })
    return player.priority
  }

  getPlayerStatus(playerId: string): QueuedPlayer | undefined {
    return this.queue.find(p => p.id === playerId)
  }

  getQueueState(): QueueState {
    const waitingCount = this.queue.filter(p => p.status === 'waiting').length
    const activeCount = this.queue.filter(p => p.status === 'active').length
    const waitingHumans = this.queue.filter(p => p.status === 'waiting' && p.type === 'human').length
    const waitingAgents = this.queue.filter(p => p.status === 'waiting' && p.type === 'agent').length
    const activeHumans = this.queue.filter(p => p.status === 'active' && p.type === 'human').length
    const activeAgents = this.queue.filter(p => p.status === 'active' && p.type === 'agent').length

    const humanSlots = this.vehicles.filter(v => v.allowedTypes.includes('human')).length
    const agentSlots = this.vehicles.filter(v => v.allowedTypes.includes('agent')).length
    
    return {
      queue: this.queue,
      vehicles: this.vehicles,
      waitingCount,
      activeCount,
      waitingHumans,
      waitingAgents,
      activeHumans,
      activeAgents,
      humanSlots,
      agentSlots,
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
    listener(this.getQueueState())
    return () => { this.listeners.delete(listener) }
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
    if (this.checkInterval) clearInterval(this.checkInterval)
  }
}

export interface QueueState {
  queue: QueuedPlayer[]
  vehicles: VehicleSlot[]
  waitingCount: number
  activeCount: number
  waitingHumans: number
  waitingAgents: number
  activeHumans: number
  activeAgents: number
  humanSlots: number
  agentSlots: number
  totalPlayers: number
  isPlayerActive: (playerId: string) => boolean
  getPlayerVehicle: (playerId: string) => VehicleSlot | undefined
}

export const vehicleQueue = new VehicleQueueManager()
