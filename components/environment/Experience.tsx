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
import { useGameStore, GRAVITY_FOR_PRESET, type GravityMode } from '../../services/gameStore'
import { RigidBody, CuboidCollider } from '@react-three/rapier'

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
  const [spectatorVehicleObj, setSpectatorVehicleObj] = useState<RapierRigidBody | null>(null)

  const getVehiclePosition = (index: number): [number, number, number] => {
    // Return a position on the edge of the map
    const angle = (index / 10) * Math.PI * 2
    const radius = cloudConfig.bounds[0] * 0.8
    return [
      Math.cos(angle) * radius,
      5,
      Math.sin(angle) * radius
    ]
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
  const spectatorVehicle = useMemo(
    () => vehicles.find(v => v.agentControlled) || vehicles[0],
    [vehicles]
  )
  const cameraTarget = isPlayerActive ? playerVehicleObj : spectatorVehicleObj
  const isCameraFollowingVehicle = Boolean(cameraTarget)

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
  const [weatherPhase, setWeatherPhase] = useState(0)

  useFrame((state) => {
    setWeatherPhase(state.clock.elapsedTime)
  })

  // Gravity tied to weather preset
  const gravityVector = useGameStore(s => s.gravityVector)
  const setGravityMode = useGameStore(s => s.setGravityMode)
  const handlingMode = useGameStore(s => s.handlingMode)
  const activeWeatherEffects = useGameStore(s => s.activeWeatherEffects)

  const activeWindEffect = activeWeatherEffects.wind
  const activeLightningEffect = activeWeatherEffects.lightning
  const activeDayNightEffect = activeWeatherEffects.dayNight
  const cameraWeatherIntensity = Math.max(
    activeWindEffect?.intensity ?? 0,
    activeLightningEffect?.intensity ?? 0,
    activeDayNightEffect?.intensity ?? 0
  )

  const windGravity: [number, number, number] = useMemo(() => {
    if (!activeWindEffect) return [0, 0, 0]
    const phase = weatherPhase * 0.8
    const strength = 2.2 * activeWindEffect.intensity
    return [Math.sin(phase) * strength, 0, Math.cos(phase * 0.8) * strength]
  }, [activeWindEffect, weatherPhase])

  const physicsGravity: [number, number, number] = useMemo(() => {
    return [
      gravityVector[0] + windGravity[0],
      gravityVector[1],
      gravityVector[2] + windGravity[2],
    ]
  }, [gravityVector, windGravity])

  const dayNightBlend = activeDayNightEffect?.intensity ?? 0
  const isNightMode = dayNightBlend > 0.55 || cloudConfig.preset === 'cosmic'
  const lightningPulse = activeLightningEffect ? (Math.sin(weatherPhase * 7) + 1) * 0.5 * activeLightningEffect.intensity : 0

  useEffect(() => {
    const preset = cloudConfig.preset || 'custom'
    const presetMode = GRAVITY_FOR_PRESET[preset] || 'normal'

    const modeByHandling: Record<typeof handlingMode, (mode: GravityMode) => GravityMode> = {
      arcade: (mode) => (mode === 'zero' ? 'low' : mode),
      offroad: (mode) => {
        if (mode === 'zero') return 'low'
        if (mode === 'hyper') return 'normal'
        return mode
      },
      chaos: (mode) => (mode === 'normal' ? 'low' : mode),
    }

    setGravityMode(modeByHandling[handlingMode](presetMode))
  }, [cloudConfig.preset, handlingMode, setGravityMode])

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
        target={cameraTarget}
        active={isCameraFollowingVehicle}
        mode={isPlayerActive ? 'active' : 'spectator'}
        intensity={cameraWeatherIntensity}
      />
      
      <Sky sunPosition={
        isNightMode
          ? [100, 1 + dayNightBlend * 2, 90]
          : cloudConfig.preset === 'stormy'
            ? [100, 5, 100]
            : cloudConfig.preset === 'sunset'
              ? [100, 8, 50]
              : [100, 20, 100]
      } />
      <Environment preset="city" />
      <ambientLight intensity={(cloudConfig.preset === 'stormy' ? 0.3 : cloudConfig.preset === 'cosmic' ? 0.15 : cloudConfig.preset === 'sunset' ? 0.6 : 0.5) * (1 - dayNightBlend * 0.55) + lightningPulse * 0.35} />
      <directionalLight position={[10, 10, 5]} intensity={(cloudConfig.preset === 'stormy' ? 0.5 : cloudConfig.preset === 'cosmic' ? 0.3 : 1) * (1 - dayNightBlend * 0.5) + lightningPulse} castShadow />
      <fog attach="fog" args={[
        isNightMode ? '#0a0a2e' : cloudConfig.preset === 'stormy' ? '#4a5568' : cloudConfig.preset === 'sunset' ? '#ffccaa' : cloudConfig.preset === 'candy' ? '#ffe0f0' : '#c9d5ff',
        cloudConfig.preset === 'stormy' ? 10 : cloudConfig.preset === 'cosmic' ? 20 : 18,
        (cloudConfig.preset === 'stormy' ? 60 : cloudConfig.preset === 'cosmic' ? 120 : 90) - (activeLightningEffect?.intensity ?? 0) * 18,
      ]} />

      <WeatherParticles config={cloudConfig} />
      <WeatherPostProcessing config={cloudConfig} />

      <Physics gravity={physicsGravity}>
        <LaunchPads />
        <SkyIslands />
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
          const isSpectatorVehicle = !isPlayerVehicle && spectatorVehicle?.id === v.id
          const props = { 
            id: v.id, 
            position: v.position, 
            agentControlled: v.agentControlled,
            // Only allow player control if this is their assigned vehicle
            playerControlled: isPlayerVehicle,
            // Pass ref for camera tracking
            onRef: isPlayerVehicle
              ? (ref: RapierRigidBody | null) => {
                setPlayerVehicleObj(ref)
              }
              : isSpectatorVehicle
                ? (ref: RapierRigidBody | null) => {
                  setSpectatorVehicleObj(ref)
                }
                : undefined
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

// Launch pads scattered around the map — ramps that fling vehicles upward
const LAUNCH_PAD_POSITIONS: [number, number, number][] = [
  [25, 0.5, 0],
  [-25, 0.5, 0],
  [0, 0.5, 25],
  [0, 0.5, -25],
  [35, 0.5, 35],
  [-35, 0.5, -35],
]

function LaunchPads() {
  return (
    <>
      {LAUNCH_PAD_POSITIONS.map((pos, i) => (
        <LaunchPad key={`pad-${i}`} position={pos} />
      ))}
    </>
  )
}

function LaunchPad({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.getElapsedTime()
      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.3
    }
  })

  return (
    <RigidBody type="fixed" position={position} rotation={[-0.35, 0, 0]}>
      <CuboidCollider args={[3, 0.15, 4]} />
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={[6, 0.3, 8]} />
        <meshStandardMaterial color="#ff6600" emissive="#ff3300" emissiveIntensity={0.5} metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Arrow indicators */}
      <mesh position={[0, 0.2, -2]}>
        <coneGeometry args={[0.5, 1.2, 4]} />
        <meshStandardMaterial color="#ffcc00" emissive="#ffcc00" emissiveIntensity={1} />
      </mesh>
    </RigidBody>
  )
}

// Sky islands — floating platforms with rare food at y=30-50
const SKY_ISLAND_POSITIONS: { pos: [number, number, number]; size: [number, number, number]; color: string }[] = [
  { pos: [20, 30, 20], size: [8, 1, 8], color: '#88ccff' },
  { pos: [-20, 35, -15], size: [10, 1, 6], color: '#aaddff' },
  { pos: [0, 40, -30], size: [12, 1, 12], color: '#ccddff' },
  { pos: [-30, 45, 20], size: [6, 1, 10], color: '#99bbff' },
  { pos: [35, 50, -10], size: [8, 1, 8], color: '#bbccff' },
]

function SkyIslands() {
  return (
    <>
      {SKY_ISLAND_POSITIONS.map((island, i) => (
        <SkyIsland key={`island-${i}`} position={island.pos} size={island.size} color={island.color} />
      ))}
    </>
  )
}

function SkyIsland({ position, size, color }: { position: [number, number, number]; size: [number, number, number]; color: string }) {
  const glowRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (glowRef.current) {
      const t = state.clock.getElapsedTime()
      glowRef.current.position.y = position[1] - 0.3 + Math.sin(t * 0.5) * 0.2
    }
  })

  return (
    <group>
      <RigidBody type="fixed" position={position}>
        <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
        <mesh castShadow receiveShadow>
          <boxGeometry args={size} />
          <meshStandardMaterial color={color} metalness={0.3} roughness={0.6} transparent opacity={0.85} />
        </mesh>
        {/* Top surface glow */}
        <mesh position={[0, size[1] / 2 + 0.05, 0]}>
          <planeGeometry args={[size[0] * 0.9, size[2] * 0.9]} />
          <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.4} transparent opacity={0.5} side={2} />
        </mesh>
      </RigidBody>
      {/* Floating glow underneath */}
      <mesh ref={glowRef} position={[position[0], position[1] - 0.3, position[2]]}>
        <sphereGeometry args={[Math.max(size[0], size[2]) * 0.4, 16, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} />
      </mesh>
    </group>
  )
}

export default ExperienceWithMobileControls;
