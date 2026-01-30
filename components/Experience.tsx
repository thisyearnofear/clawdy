'use client'

import { useState, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { 
  PerspectiveCamera, 
  OrbitControls, 
  Environment, 
  Sky, 
  ContactShadows,
  KeyboardControls
} from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { ProceduralFood, FoodStats } from './ProceduralFood'
import { CloudManager, CloudConfig } from './CloudManager'
import { Terrain } from './Terrain'
import { Tank } from './Tank'
import { MonsterTruck } from './MonsterTruck'
import { Speedster } from './Speedster'
import { Vehicle } from './Vehicle'
import { AgentVision } from './AgentVision'
import { VehicleType, agentProtocol, VEHICLE_RENT_ADDRESS } from '../services/AgentProtocol'
import { useWatchContractEvent } from 'wagmi'
import { VEHICLE_RENT_ABI } from '../services/abis/VehicleRent'

interface VehicleData {
  id: string
  type: VehicleType
  position: [number, number, number]
  agentControlled: boolean
}

export default function Experience({ 
  cloudConfig, 
  spawnRate = 2,
  playerVehicleType = 'speedster'
}: { 
  cloudConfig: CloudConfig; 
  spawnRate?: number;
  playerVehicleType?: VehicleType 
}) {
  const [foodItems, setFoodItems] = useState<{ id: number; position: [number, number, number] }[]>([])
  const [vehicles, setVehicles] = useState<VehicleData[]>([
    { id: 'player', type: playerVehicleType, position: [0, 5, 0], agentControlled: false },
    { id: 'agent-1', type: 'tank', position: [5, 5, 0], agentControlled: true },
    { id: 'agent-2', type: 'speedster', position: [-5, 5, 0], agentControlled: true }
  ])

  const lastSpawnTime = useRef(0)

  useEffect(() => {
    setVehicles(prev => prev.map(v => v.id === 'player' ? { ...v, type: playerVehicleType } : v))
  }, [playerVehicleType])

  useEffect(() => {
    const unsubscribe = agentProtocol.subscribeToVehicle((cmd) => {
      if (cmd.type) {
        setVehicles(prev => prev.map(v => v.id === cmd.vehicleId ? { ...v, type: cmd.type! } : v))
      }
    })
    return unsubscribe
  }, [])

  // Sync On-Chain Rent events
  useWatchContractEvent({
    address: VEHICLE_RENT_ADDRESS as `0x${string}`,
    abi: VEHICLE_RENT_ABI,
    eventName: 'VehicleRented',
    onLogs(logs: any) {
      const event = logs[0].args
      if (event && event.vehicleId && event.vehicleType) {
        console.log('[OnChain] Rent Event:', event.vehicleId, event.vehicleType)
        setVehicles(prev => prev.map(v => v.id === event.vehicleId ? { ...v, type: event.vehicleType as any } : v))
      }
    },
  })

  const handleDespawn = (id: number) => {
    setFoodItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleCollect = (id: number, stats: FoodStats, collectorId?: string) => {
    let agentId = 'Player'
    if (collectorId === 'agent-1') agentId = 'Agent-Zero'
    if (collectorId === 'agent-2') agentId = 'Agent-One'
    
    agentProtocol.collectFood(agentId, stats)
    handleDespawn(id)
  }

  useFrame((state) => {
    const time = state.clock.getElapsedTime()
    const interval = 1 / Math.max(0.1, spawnRate)
    
    if (time - lastSpawnTime.current > interval) {
      const newFood = {
        id: Date.now(),
        position: [
          (Math.random() - 0.5) * cloudConfig.bounds[0],
          15,
          (Math.random() - 0.5) * cloudConfig.bounds[2]
        ] as [number, number, number]
      }
      setFoodItems((prev) => [...prev, newFood])
      lastSpawnTime.current = time
    }

    agentProtocol.updateWorldState({
       food: foodItems.map(f => ({ 
         id: f.id, 
         type: 'food', 
         nutrition: 'unknown', 
         position: f.position 
       })),
       vehicles: vehicles.map(v => ({
         id: v.id,
         type: v.type,
         position: v.position,
         rotation: [0, 0, 0, 1],
         isRented: true,
         rentExpiresAt: 0
       })),
       bounds: cloudConfig.bounds
    })
  })

  return (
    <KeyboardControls
      map={[
        { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
        { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
        { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
        { name: 'right', keys: ['ArrowRight', 'KeyD'] },
        { name: 'jump', keys: ['Space'] },
      ]}
    >
      <PerspectiveCamera makeDefault position={[0, 15, 30]} />
      <OrbitControls makeDefault />
      
      <Sky sunPosition={[100, 20, 100]} />
      <Environment preset="city" />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />

      <Physics gravity={[0, -9.81, 0]}>
        <CloudManager config={cloudConfig} />
        <AgentVision />

        {foodItems.map((item) => (
          <ProceduralFood 
            key={item.id} 
            id={item.id}
            position={item.position} 
            onDespawn={() => handleDespawn(item.id)}
            onCollect={(id, stats, collector) => handleCollect(id, stats, collector)}
          />
        ))}

        {vehicles.map((v) => {
          const props = { key: v.id, id: v.id, position: v.position, agentControlled: v.agentControlled }
          if (v.type === 'tank') return <Tank {...props} />
          if (v.type === 'monster') return <MonsterTruck {...props} />
          if (v.type === 'speedster') return <Speedster {...props} />
          return <Vehicle {...props} />
        })}

        <Terrain />
      </Physics>

      <ContactShadows opacity={0.4} scale={50} blur={1} far={20} resolution={256} color="#000000" />
    </KeyboardControls>
  )
}
