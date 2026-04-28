'use client'

import { useEffect } from 'react'
import { agentProtocol } from '../services/AgentProtocol'
import { vehicleQueue } from '../services/VehicleQueue'
import { emitToast } from '../components/ui/GameToasts'
import { playSound } from '../components/ui/SoundManager'
import { useGameStore } from '../services/gameStore'
import type { VehicleType } from '../services/AgentProtocol'
import type { MemeAssetStats } from '../components/environment/MemeAssets'
import { getAgentByVehicleId } from '../services/agents'

interface UseCombatEventsOptions {
  playerId: string
  setVehicles: React.Dispatch<React.SetStateAction<{
    id: string; type: VehicleType; position: [number, number, number]
    agentControlled: boolean; playerId?: string; isPlayerVehicle?: boolean; isGhost?: boolean
  }[]>>
  handleDespawn: (id: number) => void
  freeAirBubbleUsedRef: React.MutableRefObject<boolean>
  lastPriorityToastAtRef: React.MutableRefObject<number>
  playerVehicleObjRef: React.MutableRefObject<{ translation?: () => { x: number; y: number; z: number } } | null>
  playerVehiclePosition: { x: number; y: number; z: number }
}

export function useCombatEvents({
  playerId,
  setVehicles,
  handleDespawn,
  freeAirBubbleUsedRef,
  lastPriorityToastAtRef,
  playerVehicleObjRef,
  playerVehiclePosition,
}: UseCombatEventsOptions) {
  const flood = useGameStore(s => s.flood)
  const playerWater = useGameStore(s => s.playerWater)
  const addPlayerBubbleSave = useGameStore(s => s.addPlayerBubbleSave)
  const addPlayerBoardSave = useGameStore(s => s.addPlayerBoardSave)
  const triggerFloodDrain = useGameStore(s => s.triggerFloodDrain)
  const addPlayerDrainUse = useGameStore(s => s.addPlayerDrainUse)

  const handleCollect = (id: number, stats: MemeAssetStats, collectorId?: string) => {
    const agentId = getAgentByVehicleId(collectorId)?.id || 'Player'
    if (agentId === 'Player') playSound('collect')

    if (agentId === 'Player' && !freeAirBubbleUsedRef.current) {
      freeAirBubbleUsedRef.current = true
      const sess = agentProtocol.getSession('Player')
      if (sess) {
        sess.airBubbleUntil = Date.now() + 8_000
        sess.airBubbleCount = (sess.airBubbleCount ?? 0) + 1
      }
      emitToast('milestone', '🫧 Free Air Bubble!', '8s flood immunity — collect more to earn abilities')
    }

    if (agentId === 'Player' && (stats.type as string) === 'shield') {
      const sess = agentProtocol.getSession('Player')
      if (sess) sess.shieldUntil = Date.now() + 15_000
      emitToast('milestone', '🛡️ Force Field Active', '15s of food protection!')
    }

    if (agentId === 'Player' && playerWater.inWater) {
      if (stats.type === 'air_bubble') addPlayerBubbleSave()
      if (stats.type === 'foam_board') addPlayerBoardSave()
      if (stats.type === 'air_bubble') {
        const next = vehicleQueue.bumpPriority('Player', 1, 'clutch_air_bubble')
        if (next !== null) {
          lastPriorityToastAtRef.current = Date.now()
          emitToast('milestone', 'Queue Priority +1', `Now P${next}`)
        }
      }
      if (stats.type === 'foam_board') {
        const next = vehicleQueue.bumpPriority('Player', 1, 'clutch_foam_board')
        if (next !== null) {
          lastPriorityToastAtRef.current = Date.now()
          emitToast('milestone', 'Queue Priority +1', `Now P${next}`)
        }
      }
    }

    if (agentId === 'Player' && stats.type === 'drain_plug') {
      const p = playerVehicleObjRef.current?.translation?.()
      const center: [number, number, number] = p
        ? [p.x, p.y, p.z]
        : [playerVehiclePosition.x, playerVehiclePosition.y, playerVehiclePosition.z]
      triggerFloodDrain(0.95, 8000, center)
      addPlayerDrainUse()
      const next = vehicleQueue.bumpPriority('Player', 2, 'drain_plug')
      if (Date.now() - lastPriorityToastAtRef.current > 1800 && next !== null) {
        lastPriorityToastAtRef.current = Date.now()
        emitToast('milestone', 'Queue Priority +2', `Now P${next}`)
      }
    }

    agentProtocol.collectAsset(agentId, stats)
    handleDespawn(id)
  }

  useEffect(() => {
    const unsubCombat = agentProtocol.subscribeToCombat((event) => {
      if (event.type === 'destroy') handleDespawn(event.assetId)
    })
    const unsubVehicle = agentProtocol.subscribeToVehicle((cmd) => {
      if (cmd.type) {
        setVehicles(prev => {
          const updated = prev.map(v => v.id === cmd.vehicleId ? { ...v, type: cmd.type! } : v)
          return prev.some((v, i) => i < updated.length && v.type !== updated[i].type) ? updated : prev
        })
      }
    })
    return () => { unsubCombat(); unsubVehicle() }
  }, [])

  return { handleCollect, flood }
}
