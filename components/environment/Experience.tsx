'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
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
import { FoodSpawner } from './FoodSpawner'
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
import { POLL_INTERVAL } from '../../services/web3Config'
import { MobileControls } from '../ui/MobileControls'
import FrameLimiter from '../utils/FrameLimiter'
import { CustomFogEffect } from './CustomFogEffect'
import { WeatherParticles } from './WeatherParticles'
import { WeatherPostProcessing } from './WeatherPostProcessing'
import { getAgentByVehicleId, getControllableAgents } from '../../services/agents'
import type { RapierRigidBody } from '@react-three/rapier'

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
  spawnRate = 2
}: {
  cloudConfig: CloudConfig;
  spawnRate?: number;
}) {
  useThree() // Use WebGL renderer (removed WebGPU to fix build)
  const { address } = useAccount()
  const playerId = address || 'anonymous'

  const [foodItems, setFoodItems] = useState<{ id: number; position: [number, number, number] }[]>([])
  const [vehicles, setVehicles] = useState<VehicleData[]>([])
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [terrainSampler, setTerrainSampler] = useState<((x: number, z: number) => number) | null>(null)
  const hasJoinedQueueRef = useRef(false)
  
  const [playerVehicleObj, setPlayerVehicleObj] = useState<RapierRigidBody | null>(null)

  const getVehiclePosition = (index: number): [number, number, number] => {
    const positions: [number, number, number][] = [
      [0, 3, 0],
      [5, 3, 5],
      [-5, 3, -5],
      [5, 3, -5]
    ]
    return positions[index] || [0, 3, 0]
  }

  const foodCountRef = useRef(0)

  const handleDespawn = (id: number) => {
    setFoodItems((prev) => {
      const next = prev.filter((item) => item.id !== id)
      foodCountRef.current = next.length
      return next
    })
  }

  const handleCollect = (id: number, stats: FoodStats, collectorId?: string) => {
    const agentId = getAgentByVehicleId(collectorId)?.id || 'Player'
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
      const agentVehicles: VehicleData[] = getControllableAgents().map((profile, index) => ({
        id: profile.vehicleId || profile.id,
        type: index === 0 ? 'tank' : index === 1 ? 'speedster' : 'truck',
        position: index === 0 ? [8, 3, 8] : index === 1 ? [-8, 3, -8] : [10, 3, -4],
        agentControlled: true,
      }))
      
      setVehicles(prevVehicles => {
        const newVehicles = [...activeVehicles, ...agentVehicles];
        // Only update if vehicles actually changed to prevent unnecessary re-renders
        if (JSON.stringify(prevVehicles) === JSON.stringify(newVehicles)) {
          return prevVehicles;
        }

        // Register new vehicles in world state
        const currentWorldVehicles = agentProtocol.getWorldState().vehicles
        const worldVehicleIds = new Set(currentWorldVehicles.map(v => v.id))
        const brandNewVehicles = newVehicles
          .filter(v => !worldVehicleIds.has(v.id))
          .map(v => ({
            id: v.id,
            type: v.type,
            position: v.position,
            rotation: [0, 0, 0, 1] as [number, number, number, number],
            isRented: v.playerId !== undefined,
            rentExpiresAt: 0
          }))
        
        if (brandNewVehicles.length > 0) {
          agentProtocol.updateWorldState({
            vehicles: [...currentWorldVehicles, ...brandNewVehicles]
          })
        }

        return newVehicles;
      });
    })

    return () => unsubscribe()
  }, [playerId])

  // Auto-join queue when connected
  useEffect(() => {
    if (address && !hasJoinedQueueRef.current) {
      hasJoinedQueueRef.current = true
      queueMicrotask(() => {
        vehicleQueue.joinQueue(playerId, address)
      })
    }
  }, [address, playerId])

  useEffect(() => {
    const unsubCombat = agentProtocol.subscribeToCombat((event) => {
      if (event.type === 'destroy') {
        handleDespawn(event.foodId)
      }
    })

    const unsubscribe = agentProtocol.subscribeToVehicle((cmd) => {
      if (cmd.type) {
        setVehicles(prev => {
          const updatedVehicles = prev.map(v => v.id === cmd.vehicleId ? { ...v, type: cmd.type! } : v);
          // Only update if there's an actual change to prevent unnecessary re-renders
          const hasChanged = prev.some((v, i) => 
            i < updatedVehicles.length && v.type !== updatedVehicles[i].type
          );
          return hasChanged ? updatedVehicles : prev;
        });
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
    pollingInterval: POLL_INTERVAL,
    onLogs(logs) {
      const log = logs[0]
      const event = log?.args
      if (event && 'vehicleId' in event && 'vehicleType' in event && event.vehicleId && event.vehicleType) {
        const vehicleType = event.vehicleType as VehicleType
        setVehicles(prev => prev.map(v => v.id === event.vehicleId ? { ...v, type: vehicleType } : v))
      }
    },
  })

  // Throttle world state updates to avoid per-frame overhead
  const lastWorldUpdateRef = useRef(0)
  useFrame(() => {
    const now = Date.now()
    if (now - lastWorldUpdateRef.current < 200) return // 5 Hz max
    lastWorldUpdateRef.current = now
    
    // Only update food + bounds in this loop
    // Vehicle positions are synced per-frame by the vehicle components themselves
    agentProtocol.updateWorldState({
       food: foodItems.map(f => ({ 
         id: f.id, 
         type: 'food', 
         nutrition: 'unknown', 
         position: f.position 
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
      
      <Sky sunPosition={cloudConfig.preset === 'stormy' ? [100, 5, 100] : cloudConfig.preset === 'sunset' ? [100, 8, 50] : [100, 20, 100]} />
      <Environment preset="city" />
      <ambientLight intensity={cloudConfig.preset === 'stormy' ? 0.3 : cloudConfig.preset === 'sunset' ? 0.6 : 0.5} />
      <directionalLight position={[10, 10, 5]} intensity={cloudConfig.preset === 'stormy' ? 0.5 : 1} castShadow />
      <fog attach="fog" args={[cloudConfig.preset === 'stormy' ? '#4a5568' : cloudConfig.preset === 'sunset' ? '#ffccaa' : cloudConfig.preset === 'candy' ? '#ffe0f0' : '#c9d5ff', cloudConfig.preset === 'stormy' ? 10 : 18, cloudConfig.preset === 'stormy' ? 60 : 90]} />

      <WeatherParticles config={cloudConfig} />
      <WeatherPostProcessing config={cloudConfig} />

      <Physics gravity={[0, -9.81, 0]}>
        <CloudManager config={cloudConfig} />
        <FoodSpawner
          spawnRate={spawnRate}
          bounds={cloudConfig.bounds}
          spawnHeight={18}
          maxItems={30}
          onSpawn={(item) => setFoodItems((prev) => [...prev, item])}
        />
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
            onRef: isPlayerVehicle ? (ref: RapierRigidBody | null) => { 
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
      const time = state.clock.getElapsedTime();
      ringRef.current.rotation.y = time * 2;
      ringRef.current.position.y = 0.1 + Math.sin(time * 3) * 0.05;
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
