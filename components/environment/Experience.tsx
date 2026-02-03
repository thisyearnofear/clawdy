'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CameraManager } from './CameraManager'
import {
  PerspectiveCamera,
  Environment,
  Sky,
  ContactShadows,
  KeyboardControls,
  Text
} from '@react-three/drei'
import { isMobile } from 'react-device-detect'
import { Physics } from '@react-three/rapier'
import { ProceduralFood, FoodStats } from './ProceduralFood'
import { CloudManager, CloudConfig } from './CloudManager'
import { Terrain } from '../terrain/Terrain'
import { Vegetation } from '../vegetation/Vegetation'
import { IntegratedSphericalTerrain, getSphericalTerrainHeight } from '../terrain/SphericalTerrain'
import { Tank } from '../vehicles/Tank'
import { MonsterTruck } from '../vehicles/MonsterTruck'
import { Speedster } from '../vehicles/Speedster'
import { Vehicle } from '../vehicles/Vehicle'
import { AgentVision } from './AgentVision'
import { VehicleType, agentProtocol, VEHICLE_RENT_ADDRESS } from '../../services/AgentProtocol'
import { vehicleQueue, QueueState } from '../../services/VehicleQueue'
import { useWatchContractEvent } from 'wagmi'
import { VEHICLE_RENT_ABI } from '../../services/abis/VehicleRent'
import { useAccount } from 'wagmi'
import { MobileControls } from '../ui/MobileControls'
import FrameLimiter from '../utils/FrameLimiter'
import { CustomFogEffect } from './CustomFogEffect'

interface VehicleData {
  id: string
  type: VehicleType
  position: [number, number, number]
  agentControlled: boolean
  playerId?: string
  isPlayerVehicle?: boolean
}

function Experience({
  cloudConfig,
  spawnRate = 2,
  playerVehicleType = 'speedster'
}: {
  cloudConfig: CloudConfig;
  spawnRate?: number;
  playerVehicleType?: VehicleType
}) {
  const { address } = useAccount()
  const playerId = address || 'anonymous'
  
  const [foodItems, setFoodItems] = useState<{ id: number; position: [number, number, number] }[]>([])
  const [vehicles, setVehicles] = useState<VehicleData[]>([])
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [hasJoinedQueue, setHasJoinedQueue] = useState(false)
  const [playerStatus, setPlayerStatus] = useState<{ position: number; estimatedWait: number } | null>(null)
  const [terrainSampler, setTerrainSampler] = useState<((x: number, z: number) => number) | null>(null)
  
  const lastSpawnTime = useRef(0)
  const playerVehicleRef = useRef<THREE.Object3D | null>(null)
  const [playerVehicleObj, setPlayerVehicleObj] = useState<THREE.Object3D | null>(null)

  const getVehiclePosition = (index: number): [number, number, number] => {
    const positions: [number, number, number][] = [
      [0, 3, 0],
      [5, 3, 5],
      [-5, 3, -5],
      [5, 3, -5]
    ]
    return positions[index] || [0, 3, 0]
  }

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

  // Subscribe to queue updates
  useEffect(() => {
    const unsubscribe = vehicleQueue.subscribe((state) => {
      setQueueState(state)
      
      // Update vehicles based on queue state
      const activeVehicles: VehicleData[] = state.vehicles
        .filter(v => v.isOccupied && v.currentPlayerId)
        .map((v, index) => ({
          id: v.id,
          type: v.type,
          position: getVehiclePosition(index),
          agentControlled: false,
          playerId: v.currentPlayerId,
          isPlayerVehicle: v.currentPlayerId === playerId
        }))
      
      // Add agent vehicles (always available for AI)
      const agentVehicles: VehicleData[] = [
        { id: 'agent-1', type: 'tank', position: [8, 3, 8], agentControlled: true },
        { id: 'agent-2', type: 'speedster', position: [-8, 3, -8], agentControlled: true }
      ]
      
      setVehicles([...activeVehicles, ...agentVehicles])
    })

    return () => unsubscribe()
  }, [playerId])

  // Auto-join queue when connected
  useEffect(() => {
    if (address && !hasJoinedQueue) {
      const status = vehicleQueue.joinQueue(playerId, address)
      setPlayerStatus(status)
      setHasJoinedQueue(true)
    }
  }, [address, playerId, hasJoinedQueue])

  useEffect(() => {
    const unsubCombat = agentProtocol.subscribeToCombat((event) => {
      if (event.type === 'destroy') {
        handleDespawn(event.foodId)
      }
    })

    const unsubscribe = agentProtocol.subscribeToVehicle((cmd) => {
      if (cmd.type) {
        setVehicles(prev => prev.map(v => v.id === cmd.vehicleId ? { ...v, type: cmd.type! } : v))
      }
    })
    return () => {
      unsubCombat()
      unsubscribe()
    }
  }, [])

  // Sync On-Chain Rent events
  useWatchContractEvent({
    address: VEHICLE_RENT_ADDRESS as `0x${string}`,
    abi: VEHICLE_RENT_ABI,
    eventName: 'VehicleRented',
    onLogs(logs: any) {
      const event = logs[0].args
      if (event && event.vehicleId && event.vehicleType) {
        setVehicles(prev => prev.map(v => v.id === event.vehicleId ? { ...v, type: event.vehicleType as any } : v))
      }
    },
  })

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
         isRented: v.playerId !== undefined,
         rentExpiresAt: 0
       })),
       bounds: cloudConfig.bounds
    })
  })

  // Check if current player has an active vehicle
  const playerVehicle = queueState?.getPlayerVehicle(playerId)
  const isPlayerActive = queueState?.isPlayerActive(playerId) ?? false

  // Get player vehicle position for spherical terrain
  const playerVehiclePosition = useMemo(() => {
    if (isPlayerActive && playerVehicle) {
      const vehicle = vehicles.find(v => v.id === playerVehicle.id);
      if (vehicle) {
        return new THREE.Vector3(...vehicle.position);
      }
    }
    return new THREE.Vector3(0, 0, 0);
  }, [isPlayerActive, playerVehicle, vehicles]);

  const [useSphericalTerrain, setUseSphericalTerrain] = useState(false);

  // Keyboard handler for toggling spherical terrain
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') {
        setUseSphericalTerrain(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      <CameraManager 
        target={playerVehicleObj}
        active={isPlayerActive}
      />
      
      <Sky sunPosition={[100, 20, 100]} />
      <Environment preset="city" />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <fog attach="fog" args={['#c9d5ff', 18, 90]} />

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
          const isPlayerVehicle = v.playerId === playerId && isPlayerActive
          const props = { 
            id: v.id, 
            position: v.position, 
            agentControlled: v.agentControlled,
            // Only allow player control if this is their assigned vehicle
            playerControlled: isPlayerVehicle,
            // Pass ref for camera tracking
            onRef: isPlayerVehicle ? (ref: any) => { 
              playerVehicleRef.current = ref
              setPlayerVehicleObj(ref)
            } : undefined
          }
          
          return (
            <group key={v.id}>
              {/* Player vehicle indicator ring */}
              {isPlayerVehicle && (
                <PlayerVehicleIndicator position={v.position} />
              )}
              {v.type === 'tank' && <Tank key={v.id} {...props} />}
              {v.type === 'monster' && <MonsterTruck key={v.id} {...props} />}
              {v.type === 'speedster' && <Speedster key={v.id} {...props} />}
              {v.type !== 'tank' && v.type !== 'monster' && v.type !== 'speedster' && (
                <Vehicle key={v.id} {...props} />
              )}
            </group>
          )
        })}

        <Vegetation getHeightAt={useSphericalTerrain ?
          getSphericalTerrainHeight :
          terrainSampler
        } />
        
        {useSphericalTerrain ? (
          <IntegratedSphericalTerrain 
            playerPosition={playerVehiclePosition} 
            onTerrainReady={setTerrainSampler}
          />
        ) : (
          <Terrain onSamplerReady={setTerrainSampler} />
        )}
        
        {/* Toggle button for spherical terrain */}
        <group position={[0, 20, -10]}>
          <Text
            position={[0, 0, 0]}
            fontSize={0.5}
            color={useSphericalTerrain ? "#ff6b6b" : "#4ecdc4"}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.03}
            outlineColor="#000000"
          >
            SPHERICAL: {useSphericalTerrain ? "ON" : "OFF"}
          </Text>
          <Text
            position={[0, -1, 0]}
            fontSize={0.3}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            Press &apos;T&apos; to toggle
          </Text>
        </group>
        
        {/* 3D UI Elements */}
        {address && (
          <InWorldQueueStatus 
            playerId={playerId}
            queueState={queueState}
            isPlayerActive={isPlayerActive}
            playerVehicle={playerVehicle}
          />
        )}
      </Physics>

      <ContactShadows opacity={0.4} scale={50} blur={1} far={20} resolution={256} color="#000000" />

      {/* Performance optimization for mobile devices */}
      {isMobile && <FrameLimiter fps={30} />}

      {/* Custom fog effect for enhanced atmosphere */}
      <CustomFogEffect />
    </KeyboardControls>
  )
}

// Wrapper component to handle mobile controls overlay
function ExperienceWithMobileControls(props: {
  cloudConfig: CloudConfig;
  spawnRate?: number;
  playerVehicleType?: VehicleType
}) {
  return (
    <>
      <Experience {...props} />
      {/* Mobile controls overlay */}
      {isMobile && <MobileControls />}
    </>
  )
}

// Visual indicator under player's vehicle
function PlayerVehicleIndicator({ position }: { position: [number, number, number] }) {
  const ringRef = useRef<THREE.Mesh>(null)
  
  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.y = state.clock.getElapsedTime() * 2
      ringRef.current.position.y = 0.1 + Math.sin(state.clock.getElapsedTime() * 3) * 0.05
    }
  })
  
  return (
    <mesh ref={ringRef} position={[position[0], 0.1, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[2.5, 3, 32]} />
      <meshBasicMaterial color="#00ff00" transparent opacity={0.6} />
    </mesh>
  )
}

// 3D Queue status display in the world
function InWorldQueueStatus({ 
  playerId, 
  queueState, 
  isPlayerActive,
  playerVehicle 
}: { 
  playerId: string
  queueState: QueueState | null
  isPlayerActive: boolean
  playerVehicle: { id: string; type: VehicleType } | undefined
}) {
  if (!queueState) return null
  
  const player = queueState.queue.find(p => p.id === playerId)
  
  if (isPlayerActive && playerVehicle) {
    // Show controls hint above the vehicle
    return (
      <group position={[0, 6, 0]}>
        <Text
          fontSize={0.8}
          color="#00ff00"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#000000"
        >
          YOU ARE DRIVING
        </Text>
        <Text
          position={[0, -1, 0]}
          fontSize={0.5}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#000000"
        >
          WASD / Arrows to drive • Space to brake/action
        </Text>
      </group>
    )
  }
  
  if (player?.status === 'waiting') {
    const position = queueState.queue.filter(p => p.status === 'waiting').findIndex(p => p.id === playerId) + 1
    return (
      <group position={[0, 8, -15]}>
        <Text
          fontSize={1}
          color="#fbbf24"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#000000"
        >
          WAITING IN QUEUE
        </Text>
        <Text
          position={[0, -1.2, 0]}
          fontSize={0.6}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#000000"
        >
          Position: {position} / {queueState.waitingCount}
        </Text>
      </group>
    )
  }
  
  return (
    <group position={[0, 8, -15]}>
      <Text
        fontSize={0.6}
        color="#60a5fa"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.03}
        outlineColor="#000000"
      >
        Connect wallet to drive vehicles
      </Text>
    </group>
  )
}

export default ExperienceWithMobileControls;
