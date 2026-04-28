'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { vehicleQueue, QueueState } from '../services/VehicleQueue'
import { agentProtocol } from '../services/AgentProtocol'
import { emitToast } from '../components/ui/GameToasts'
import { playSound } from '../components/ui/SoundManager'
import { useGameStore } from '../services/gameStore'
import type { VehicleType } from '../services/AgentProtocol'
import type { CloudConfig } from '../components/environment/CloudManager'

interface VehicleData {
  id: string
  type: VehicleType
  position: [number, number, number]
  agentControlled: boolean
  playerId?: string
  isPlayerVehicle?: boolean
  isGhost?: boolean
}

export function usePlayerQueue(
  playerId: string,
  address: `0x${string}` | undefined,
  cloudConfig: CloudConfig,
  preferredVehicle: VehicleType | null
) {
  type PreferredType = 'speedster' | 'truck'
  const safePreferred: PreferredType | undefined =
    preferredVehicle === 'speedster' || preferredVehicle === 'truck' ? preferredVehicle : undefined

  const [vehicles, setVehicles] = useState<VehicleData[]>([])
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const hasJoinedQueueRef = useRef(false)
  const wasActiveRef = useRef(false)

  const getVehiclePosition = useCallback((index: number, isGhost: boolean = false): [number, number, number] => {
    const angle = (index / 10) * Math.PI * 2
    const radius = cloudConfig.bounds[0] * (isGhost ? 0.9 : 0.8)
    return [
      Math.cos(angle) * radius,
      isGhost ? 8 : 5,
      Math.sin(angle) * radius
    ]
  }, [cloudConfig.bounds])

  useEffect(() => {
    const unsubscribe = vehicleQueue.subscribe((state) => {
      setQueueState(state)
      useGameStore.getState().setActiveHumans(state.activeHumans + state.waitingHumans)

      const isNowActive = state.vehicles.some(v => v.currentPlayerId === playerId && v.isOccupied)
      if (wasActiveRef.current && !isNowActive) {
        emitToast('milestone', '💨 Session Ended', 'Back in queue — you\'ll respawn shortly!')
        playSound('collect')
      }
      wasActiveRef.current = isNowActive

      const activeVehicles: VehicleData[] = state.vehicles
        .filter(v => v.isOccupied && v.currentPlayerId)
        .map((v, index) => {
          const occupant = state.queue.find(p => p.id === v.currentPlayerId)
          const occupantType = occupant?.type ?? 'human'
          return {
            id: v.id,
            type: v.type,
            position: getVehiclePosition(index),
            agentControlled: occupantType === 'agent',
            playerId: v.currentPlayerId,
            isPlayerVehicle: v.currentPlayerId === playerId,
            isGhost: false
          }
        })

      const waiting = state.queue
        .filter(p => p.status === 'waiting')
        .sort((a, b) => b.priority - a.priority || a.joinedAt - b.joinedAt)
      const ghostVehicles: VehicleData[] = waiting
        .slice(0, 6)
        .map((p, index) => ({
          id: `ghost-${p.id}`,
          type: p.type === 'agent' ? 'tank' : 'speedster',
          position: getVehiclePosition(index + activeVehicles.length, true),
          agentControlled: p.type === 'agent',
          playerId: p.id,
          isPlayerVehicle: p.id === playerId,
          isGhost: true
        }))

      setVehicles(prevVehicles => {
        const newVehicles = [...activeVehicles, ...ghostVehicles]
        if (JSON.stringify(prevVehicles) === JSON.stringify(newVehicles)) return prevVehicles

        const currentWorldVehicles = agentProtocol.getWorldState().vehicles
        const worldVehicleIds = new Set(currentWorldVehicles.map(v => v.id))
        const brandNewVehicles = newVehicles
          .filter(v => !worldVehicleIds.has(v.id))
          .map(v => ({
            id: v.id,
            type: v.type,
            position: v.position,
            rotation: [0, 0, 0, 1] as [number, number, number, number],
            isRented: v.playerId !== undefined && !v.isGhost,
            rentExpiresAt: 0
          }))

        if (brandNewVehicles.length > 0) {
          agentProtocol.updateWorldState({ vehicles: [...currentWorldVehicles, ...brandNewVehicles] })
        }
        return newVehicles
      })
    })
    return () => unsubscribe()
  }, [playerId, getVehiclePosition])

  useEffect(() => {
    if (!hasJoinedQueueRef.current) {
      hasJoinedQueueRef.current = true
      queueMicrotask(() => {
        emitToast('bid-win', 'Joining Arena', 'Adding you to the queue...')
        vehicleQueue.joinQueue(playerId, 'human', 0, address ?? playerId, safePreferred)
        if (preferredVehicle) emitToast('bid-win', `${preferredVehicle === 'speedster' ? '🏎️' : '🚛'} Vehicle Ready`, `Your ${preferredVehicle} is queued!`)
        setTimeout(() => emitToast('bid-win', 'Status Update', 'Spawning vehicle...'), 2000)
      })
    }
  }, [address, playerId])

  return { vehicles, setVehicles, queueState, getVehiclePosition }
}
