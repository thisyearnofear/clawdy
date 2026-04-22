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
import { ProceduralMemeAsset, MemeAssetStats, type MemeAssetType } from './MemeAssets'
import { MemeAssetSpawner } from './MemeAssetSpawner'
import { CloudManager, CloudConfig } from './CloudManager'
import { Terrain } from '../terrain/Terrain'
import { Vegetation } from '../vegetation/Vegetation'
import { IntegratedSphericalTerrain, getSphericalTerrainHeight } from '../terrain/SphericalTerrain'
import { Tank } from '../vehicles/Tank'
import { MonsterTruck } from '../vehicles/MonsterTruck'
import { Speedster } from '../vehicles/Speedster'
import { Vehicle } from '../vehicles/Vehicle'
import { AgentVision } from './AgentVision'
import { IntentionVisualizer } from './IntentionVisualizer'
import { VehicleType, agentProtocol, VEHICLE_RENT_ADDRESS } from '../../services/AgentProtocol'
import { vehicleQueue, QueueState } from '../../services/VehicleQueue'
import { emitToast } from '../ui/GameToasts'
import { useWatchContractEvent } from 'wagmi'
import { VEHICLE_RENT_ABI } from '../../services/abis/VehicleRent'
import { useAccount } from 'wagmi'
import { POLL_INTERVAL } from '../../services/web3Config'
import { MobileControls } from '../ui/MobileControls'
import FrameLimiter from '../utils/FrameLimiter'
import { CustomFogEffect } from './CustomFogEffect'
import { WeatherParticles } from './WeatherParticles'
import { WeatherPostProcessing } from './WeatherPostProcessing'
import { PuddleRipples } from './PuddleRipples'
import { FloodWater } from './FloodWater'
import { getAgentByVehicleId } from '../../services/agents'
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
  isGhost?: boolean
}

function Experience({
  cloudConfig,
  spawnRate = 2
}: {
  cloudConfig: CloudConfig;
  spawnRate?: number;
}) {
  useThree() 
  const { address } = useAccount()
  const playerId = address || 'anonymous'

  const [memeAssets, setMemeAssets] = useState<{ id: number; position: [number, number, number]; itemType?: MemeAssetType }[]>([])
  const [vehicles, setVehicles] = useState<VehicleData[]>([])
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [terrainSampler, setTerrainSampler] = useState<((x: number, z: number) => number) | null>(null)
  const hasJoinedQueueRef = useRef(false)
  
  const [playerVehicleObj, setPlayerVehicleObj] = useState<RapierRigidBody | null>(null)
  const [spectatorVehicleObj, setSpectatorVehicleObj] = useState<RapierRigidBody | null>(null)
  const lastPriorityToastAtRef = useRef(0)

  const getVehiclePosition = (index: number, isGhost: boolean = false): [number, number, number] => {
    const angle = (index / 10) * Math.PI * 2
    const radius = cloudConfig.bounds[0] * (isGhost ? 0.9 : 0.8)
    return [
      Math.cos(angle) * radius,
      isGhost ? 8 : 5,
      Math.sin(angle) * radius
    ]
  }

  const assetCountRef = useRef(0)

  const handleDespawn = (id: number) => {
    setMemeAssets((prev) => {
      const next = prev.filter((item) => item.id !== id)
      assetCountRef.current = next.length
      return next
    })
  }

  const handleCollect = (id: number, stats: MemeAssetStats, collectorId?: string) => {
    const agentId = getAgentByVehicleId(collectorId)?.id || 'Player'
    if (agentId === 'Player' && playerWater.inWater) {
      if (stats.type === 'air_bubble') addPlayerBubbleSave()
      if (stats.type === 'foam_board') addPlayerBoardSave()
      if (stats.type === 'air_bubble') {
        const next = vehicleQueue.bumpPriority('Player', 1, 'clutch_air_bubble')
        if (next !== null) {
          // eslint-disable-next-line react-hooks/purity
          lastPriorityToastAtRef.current = Date.now()
          emitToast('milestone', 'Queue Priority +1', `Now P${next}`)
        }
      }
      if (stats.type === 'foam_board') {
        const next = vehicleQueue.bumpPriority('Player', 1, 'clutch_foam_board')
        if (next !== null) {
          // eslint-disable-next-line react-hooks/purity
          lastPriorityToastAtRef.current = Date.now()
          emitToast('milestone', 'Queue Priority +1', `Now P${next}`)
        }
      }
    }
    if (agentId === 'Player' && stats.type === 'drain_plug') {
      const p = playerVehicleObj?.translation?.()
      const center: [number, number, number] = p
        ? [p.x, p.y, p.z]
        : [playerVehiclePosition.x, playerVehiclePosition.y, playerVehiclePosition.z]
      triggerFloodDrain(0.95, 8000, center)
      addPlayerDrainUse()
      const next = vehicleQueue.bumpPriority('Player', 2, 'drain_plug')
      // eslint-disable-next-line react-hooks/purity
      if (Date.now() - lastPriorityToastAtRef.current > 1800 && next !== null) {
        // eslint-disable-next-line react-hooks/purity
        lastPriorityToastAtRef.current = Date.now()
        emitToast('milestone', 'Queue Priority +2', `Now P${next}`)
      }
    }
    agentProtocol.collectAsset(agentId, stats)
    handleDespawn(id)
  }

  const sessions = useGameStore(s => s.sessions)
  const playerSession = sessions['Player']
  const leaderEarned = Object.values(sessions).reduce((max, s) => Math.max(max, s.totalEarned ?? 0), 0)
  const playerEarned = playerSession?.totalEarned ?? 0
  const behindBy = Math.max(0, leaderEarned - playerEarned)
  const isPlayerBehind = behindBy > 0.008
  const flood = useGameStore(s => s.flood)
  const playerWater = useGameStore(s => s.playerWater)
  const addPlayerBubbleSave = useGameStore(s => s.addPlayerBubbleSave)
  const addPlayerBoardSave = useGameStore(s => s.addPlayerBoardSave)
  const triggerFloodDrain = useGameStore(s => s.triggerFloodDrain)
  const addPlayerDrainUse = useGameStore(s => s.addPlayerDrainUse)

  const chooseAssistedAssetType = (): MemeAssetType | undefined => {
    if (flood.active && flood.intensity > 0.25) {
      const pBubble = Math.min(0.12, 0.03 + flood.intensity * 0.06)
      if (Math.random() < pBubble) return 'air_bubble'
      const pBoard = Math.min(0.10, 0.02 + flood.intensity * 0.05)
      if (Math.random() < pBoard) return 'foam_board'
      const pPlug = Math.min(0.06, 0.01 + flood.intensity * 0.03)
      if (Math.random() < pPlug) return 'drain_plug'
      const p = Math.min(0.22, 0.06 + flood.intensity * 0.12)
      if (Math.random() < p) return Math.random() < 0.6 ? 'floaty_marshmallow' : 'spicy_pepper'
    }

    if (!isPlayerBehind) return undefined
    const bonus = Math.min(0.18, behindBy * 6)
    const specialChance = 0.10 + bonus
    if (Math.random() < specialChance) {
      const specials: MemeAssetType[] = ['golden_meatball', 'spicy_pepper', 'floaty_marshmallow']
      if (Math.random() < Math.min(0.55, 0.25 + behindBy * 10)) return 'golden_meatball'
      return specials[Math.floor(Math.random() * specials.length)]
    }
    return undefined
  }

  const round = useGameStore(s => s.round)
  const [remainingSec, setRemainingSec] = useState(0)

  useEffect(() => {
    const update = () => setRemainingSec(Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000)))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [round.endsAt])
  const endgameMultiplier = round.isActive && remainingSec > 0 && remainingSec <= 10 ? (remainingSec <= 5 ? 2.4 : 1.8) : 1
  const effectiveSpawnRate = Math.min(10, spawnRate * endgameMultiplier)

  useEffect(() => {
    const unsubscribe = vehicleQueue.subscribe((state) => {
      setQueueState(state)
      
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
        .slice(0, 6) // perf guardrail
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
        const newVehicles = [...activeVehicles, ...ghostVehicles];
        if (JSON.stringify(prevVehicles) === JSON.stringify(newVehicles)) return prevVehicles;

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
        return newVehicles;
      });
    })
    return () => unsubscribe()
  }, [playerId])

  useEffect(() => {
    if (address && !hasJoinedQueueRef.current) {
      hasJoinedQueueRef.current = true
      queueMicrotask(() => {
        vehicleQueue.joinQueue(playerId, 'human', 0, address)
      })
    }
  }, [address, playerId])

  useEffect(() => {
    const unsubCombat = agentProtocol.subscribeToCombat((event) => {
      if (event.type === 'destroy') handleDespawn(event.assetId)
    })
    const unsubscribe = agentProtocol.subscribeToVehicle((cmd) => {
      if (cmd.type) {
        setVehicles(prev => {
          const updatedVehicles = prev.map(v => v.id === cmd.vehicleId ? { ...v, type: cmd.type! } : v);
          return prev.some((v, i) => i < updatedVehicles.length && v.type !== updatedVehicles[i].type) ? updatedVehicles : prev;
        });
      }
    })
    return () => { unsubCombat(); unsubscribe() }
  }, [])

  useWatchContractEvent({
    address: VEHICLE_RENT_ADDRESS as `0x${string}`,
    abi: VEHICLE_RENT_ABI,
    eventName: 'VehicleRented',
    pollingInterval: POLL_INTERVAL,
    onLogs(logs) {
      const event = logs[0]?.args
      if (event && 'vehicleId' in event && 'vehicleType' in event && event.vehicleId && event.vehicleType) {
        setVehicles(prev => prev.map(v => v.id === event.vehicleId ? { ...v, type: event.vehicleType as VehicleType } : v))
      }
    },
  })

  const lastWorldUpdateRef = useRef(0)
  useFrame(() => {
    const now = Date.now()
    if (now - lastWorldUpdateRef.current < 200) return
    lastWorldUpdateRef.current = now
    agentProtocol.updateWorldState({
       assets: memeAssets.map(a => ({ id: a.id, type: a.itemType ?? 'asset', rarity: 'unknown', position: a.position })),
       bounds: cloudConfig.bounds
    })
  })

  const playerVehicle = queueState?.getPlayerVehicle(playerId)
  const isPlayerActive = queueState?.isPlayerActive(playerId) ?? false
  const spectatorVehicle = useMemo(() => vehicles.find(v => v.agentControlled && !v.isGhost) || vehicles[0], [vehicles])
  const cameraTarget = isPlayerActive ? playerVehicleObj : spectatorVehicleObj
  const isCameraFollowingVehicle = Boolean(cameraTarget)

  const playerVehiclePosition = useMemo(() => {
    if (isPlayerActive && playerVehicle) {
      const vehicle = vehicles.find(v => v.id === playerVehicle.id);
      if (vehicle) return new THREE.Vector3(...vehicle.position);
    }
    return new THREE.Vector3(0, 0, 0);
  }, [isPlayerActive, playerVehicle, vehicles]);

  const [useSphericalTerrain, setUseSphericalTerrain] = useState(false);
  const [weatherPhase, setWeatherPhase] = useState(0)
  useFrame((state) => setWeatherPhase(state.clock.elapsedTime))

  const gravityVector = useGameStore(s => s.gravityVector)
  const setGravityMode = useGameStore(s => s.setGravityMode)
  const handlingMode = useGameStore(s => s.handlingMode)
  const activeWeatherEffects = useGameStore(s => s.activeWeatherEffects)
  const cameraWeatherIntensity = Math.max(activeWeatherEffects.wind?.intensity ?? 0, activeWeatherEffects.lightning?.intensity ?? 0, activeWeatherEffects.dayNight?.intensity ?? 0)

  const windGravity: [number, number, number] = useMemo(() => {
    if (!activeWeatherEffects.wind) return [0, 0, 0]
    const phase = weatherPhase * 0.8
    const strength = 2.2 * activeWeatherEffects.wind.intensity
    return [Math.sin(phase) * strength, 0, Math.cos(phase * 0.8) * strength]
  }, [activeWeatherEffects.wind, weatherPhase])

  const physicsGravity: [number, number, number] = useMemo(() => [gravityVector[0] + windGravity[0], gravityVector[1], gravityVector[2] + windGravity[2]], [gravityVector, windGravity])
  const isNightMode = (activeWeatherEffects.dayNight?.intensity ?? 0) > 0.55 || cloudConfig.preset === 'cosmic'
  const lightningPulse = activeWeatherEffects.lightning ? (Math.sin(weatherPhase * 7) + 1) * 0.5 * activeWeatherEffects.lightning.intensity : 0

  useEffect(() => {
    const preset = cloudConfig.preset || 'custom'
    const presetMode = GRAVITY_FOR_PRESET[preset] || 'normal'
    const modeByHandling: Record<typeof handlingMode, (mode: GravityMode) => GravityMode> = {
      arcade: (mode) => (mode === 'zero' ? 'low' : mode),
      offroad: (mode) => (mode === 'zero' ? 'low' : mode === 'hyper' ? 'normal' : mode),
      chaos: (mode) => (mode === 'normal' ? 'low' : mode),
    }
    setGravityMode(modeByHandling[handlingMode](presetMode))
  }, [cloudConfig.preset, handlingMode, setGravityMode])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 't' || e.key === 'T') setUseSphericalTerrain(prev => !prev) }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []);

  return (
    <KeyboardControls
      map={[{ name: 'forward', keys: ['ArrowUp', 'KeyW'] }, { name: 'backward', keys: ['ArrowDown', 'KeyS'] }, { name: 'left', keys: ['ArrowLeft', 'KeyA'] }, { name: 'right', keys: ['ArrowRight', 'KeyD'] }, { name: 'jump', keys: ['Space'] }]}
    >
      <PerspectiveCamera makeDefault position={[0, 15, 30]} />
      <CameraManager target={cameraTarget} active={isCameraFollowingVehicle} mode={isPlayerActive ? 'active' : 'spectator'} intensity={cameraWeatherIntensity} />
      <Sky sunPosition={isNightMode ? [100, 1 + (activeWeatherEffects.dayNight?.intensity ?? 0) * 2, 90] : cloudConfig.preset === 'stormy' ? [100, 5, 100] : cloudConfig.preset === 'sunset' ? [100, 8, 50] : [100, 20, 100]} />
      <Environment preset="city" />
      <ambientLight intensity={(cloudConfig.preset === 'stormy' ? 0.3 : cloudConfig.preset === 'cosmic' ? 0.15 : cloudConfig.preset === 'sunset' ? 0.6 : 0.5) * (1 - (activeWeatherEffects.dayNight?.intensity ?? 0) * 0.55) + lightningPulse * 0.35} />
      <directionalLight position={[10, 10, 5]} intensity={(cloudConfig.preset === 'stormy' ? 0.5 : cloudConfig.preset === 'cosmic' ? 0.3 : 1) * (1 - (activeWeatherEffects.dayNight?.intensity ?? 0) * 0.5) + lightningPulse} castShadow />
      <fog attach="fog" args={[isNightMode ? '#0a0a2e' : cloudConfig.preset === 'stormy' ? '#4a5568' : cloudConfig.preset === 'sunset' ? '#ffccaa' : cloudConfig.preset === 'candy' ? '#ffe0f0' : '#c9d5ff', cloudConfig.preset === 'stormy' ? 10 : cloudConfig.preset === 'cosmic' ? 20 : 18, (cloudConfig.preset === 'stormy' ? 60 : cloudConfig.preset === 'cosmic' ? 120 : 90) - (activeWeatherEffects.lightning?.intensity ?? 0) * 18]} />
      <WeatherParticles config={cloudConfig} />
      <PuddleRipples bounds={cloudConfig.bounds} getHeightAt={terrainSampler ?? undefined} />
      <WeatherPostProcessing config={cloudConfig} />
      <FloodWater bounds={cloudConfig.bounds} />
      <Physics gravity={physicsGravity}>
        <LaunchPads />
        <SkyIslands />
        <CloudManager config={cloudConfig} />
        <MemeAssetSpawner spawnRate={effectiveSpawnRate} bounds={cloudConfig.bounds} spawnHeight={18} maxItems={30} onSpawn={(item) => setMemeAssets((prev) => [...prev, { ...item, itemType: chooseAssistedAssetType() }])} />
        <AgentVision />
        <IntentionVisualizer />
        {memeAssets.map((item) => (
          <ProceduralMemeAsset key={item.id} id={item.id} itemType={item.itemType} position={item.position} onDespawn={() => handleDespawn(item.id)} onCollect={(id, stats, collector) => handleCollect(id, stats, collector)} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => {
          const v = vehicles[i]
          const isPlayerVehicle = v?.playerId === playerId && isPlayerActive
          const isSpectatorVehicle = !isPlayerVehicle && spectatorVehicle?.id === v?.id
          
          const props = { 
            id: v?.id ?? `pool-${i}`, 
            position: v?.position ?? [0, -100, 0], 
            agentControlled: v?.agentControlled ?? false, 
            isGhost: !v || v.isGhost,
            playerControlled: isPlayerVehicle,
            onRef: isPlayerVehicle ? setPlayerVehicleObj : isSpectatorVehicle ? setSpectatorVehicleObj : undefined
          }

          return (
            <group key={`pool-${i}`} visible={!!v}>
              {isPlayerVehicle && <PlayerVehicleIndicator position={props.position} />}
              {v?.type === 'tank' ? <Tank {...props} /> : 
               v?.type === 'monster' ? <MonsterTruck {...props} /> : 
               v?.type === 'speedster' ? <Speedster {...props} /> : 
               <Vehicle {...props} />}
            </group>
          )
        })}
        <Vegetation getHeightAt={useSphericalTerrain ? getSphericalTerrainHeight : terrainSampler} />
        {useSphericalTerrain ? <IntegratedSphericalTerrain playerPosition={playerVehiclePosition} onTerrainReady={setTerrainSampler} /> : <Terrain onSamplerReady={setTerrainSampler} />}
        <group position={[0, 20, -10]}>
          <Text fontSize={0.5} color={useSphericalTerrain ? "#ff6b6b" : "#4ecdc4"} anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#000000">SPHERICAL: {useSphericalTerrain ? "ON" : "OFF"}</Text>
          <Text position={[0, -1, 0]} fontSize={0.3} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">Press &apos;T&apos; to toggle</Text>
        </group>
        {address && <InWorldQueueStatus playerId={playerId} queueState={queueState} isPlayerActive={isPlayerActive} playerVehicle={playerVehicle} />}
      </Physics>
      <ContactShadows opacity={0.4} scale={50} blur={1} far={20} resolution={256} color="#000000" />
      {isMobile && <FrameLimiter fps={30} />}
      <CustomFogEffect />
    </KeyboardControls>
  )
}

function ExperienceWithMobileControls(props: { cloudConfig: CloudConfig; spawnRate?: number; playerVehicleType?: VehicleType }) {
  return (
    <>
      <Experience {...props} />
      {isMobile && <MobileControls />}
    </>
  )
}

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

function InWorldQueueStatus({ playerId, queueState, isPlayerActive, playerVehicle }: { playerId: string; queueState: QueueState | null; isPlayerActive: boolean; playerVehicle: { id: string; type: VehicleType } | undefined }) {
  if (!queueState) return null
  const player = queueState.queue.find(p => p.id === playerId)
  if (isPlayerActive && playerVehicle) {
    return (
      <group position={[0, 6, 0]}>
        <Text fontSize={0.8} color="#00ff00" anchorX="center" anchorY="middle" outlineWidth={0.05} outlineColor="#000000">YOU ARE DRIVING</Text>
        <Text position={[0, -1, 0]} fontSize={0.5} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#000000">WASD / Arrows to drive • Space to brake/action</Text>
      </group>
    )
  }
  if (player?.status === 'waiting') {
    const position = queueState.queue.filter(p => p.status === 'waiting').findIndex(p => p.id === playerId) + 1
    return (
      <group position={[0, 8, -15]}>
        <Text fontSize={1} color="#fbbf24" anchorX="center" anchorY="middle" outlineWidth={0.05} outlineColor="#000000">WAITING IN QUEUE</Text>
        <Text position={[0, -1.2, 0]} fontSize={0.6} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#000000">Position: {position} / {queueState.waitingCount}</Text>
      </group>
    )
  }
  return (
    <group position={[0, 8, -15]}>
      <Text fontSize={0.6} color="#60a5fa" anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#000000">Connect wallet to drive vehicles</Text>
    </group>
  )
}

const LAUNCH_PAD_POSITIONS: [number, number, number][] = [[25, 0.5, 0], [-25, 0.5, 0], [0, 0.5, 25], [0, 0.5, -25], [35, 0.5, 35], [-35, 0.5, -35]]
function LaunchPads() { return <>{LAUNCH_PAD_POSITIONS.map((pos, i) => <LaunchPad key={`pad-${i}`} position={pos} />)}</> }
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
      <mesh ref={meshRef} castShadow receiveShadow><boxGeometry args={[6, 0.3, 8]} /><meshStandardMaterial color="#ff6600" emissive="#ff3300" emissiveIntensity={0.5} metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0, 0.2, -2]}><coneGeometry args={[0.5, 1.2, 4]} /><meshStandardMaterial color="#ffcc00" emissive="#ffcc00" emissiveIntensity={1} /></mesh>
    </RigidBody>
  )
}

const SKY_ISLAND_POSITIONS: { pos: [number, number, number]; size: [number, number, number]; color: string }[] = [{ pos: [20, 30, 20], size: [8, 1, 8], color: '#88ccff' }, { pos: [-20, 35, -15], size: [10, 1, 6], color: '#aaddff' }, { pos: [0, 40, -30], size: [12, 1, 12], color: '#ccddff' }, { pos: [-30, 45, 20], size: [6, 1, 10], color: '#99bbff' }, { pos: [35, 50, -10], size: [8, 1, 8], color: '#bbccff' }]
function SkyIslands() { return <>{SKY_ISLAND_POSITIONS.map((island, i) => <SkyIsland key={`island-${i}`} position={island.pos} size={island.size} color={island.color} />)}</> }
function SkyIsland({ position, size, color }: { position: [number, number, number]; size: [number, number, number]; color: string }) {
  const glowRef = useRef<THREE.Mesh>(null)
  useFrame((state) => { if (glowRef.current) { const t = state.clock.getElapsedTime(); glowRef.current.position.y = position[1] - 0.3 + Math.sin(t * 0.5) * 0.2 } })
  return (
    <group>
      <RigidBody type="fixed" position={position}>
        <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
        <mesh castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.6} transparent opacity={0.85} /></mesh>
        <mesh position={[0, size[1] / 2 + 0.05, 0]}><planeGeometry args={[size[0] * 0.9, size[2] * 0.9]} /><meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.4} transparent opacity={0.5} side={2} /></mesh>
      </RigidBody>
      <mesh ref={glowRef} position={[position[0], position[1] - 0.3, position[2]]}><sphereGeometry args={[Math.max(size[0], size[2]) * 0.4, 16, 8]} /><meshBasicMaterial color={color} transparent opacity={0.15} /></mesh>
    </group>
  )
}

export default ExperienceWithMobileControls;
