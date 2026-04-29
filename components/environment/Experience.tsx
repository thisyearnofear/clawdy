'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
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
import { isMobile as _isMobile } from 'react-device-detect'
import { Physics } from '@react-three/rapier'
import { ProceduralMemeAsset, MemeAssetStats, type MemeAssetType } from './MemeAssets'
import { MemeAssetSpawner, type SpawnTier } from './MemeAssetSpawner'
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
import { MemeAssetInstances } from './MemeAssetInstances'
import { VehicleType, agentProtocol, VEHICLE_RENT_ADDRESS } from '../../services/AgentProtocol'
import { QueueState } from '../../services/VehicleQueue'
import { getAgentByVehicleId } from '../../services/agents'
import { emitToast } from '../ui/GameToasts'
import { useWatchContractEvent, useReadContract } from 'wagmi'
import { VEHICLE_RENT_ABI } from '../../services/abis/VehicleRent'
import { useAccount } from 'wagmi'
import { POLL_INTERVAL } from '../../services/web3Config'
import { usePlayerQueue } from '../../hooks/usePlayerQueue'
import { useCombatEvents } from '../../hooks/useCombatEvents'

import FrameLimiter from '../utils/FrameLimiter'
import { WeatherParticles } from './WeatherParticles'
import { WeatherPostProcessing } from './WeatherPostProcessing'
import { PuddleRipples } from './PuddleRipples'
import { FloodWater } from './FloodWater'
import { MudMarkers } from './MudMarkers'
import type { RapierRigidBody } from '@react-three/rapier'
import { useGameStore, GRAVITY_FOR_PRESET, type GravityMode } from '../../services/gameStore'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { playSound } from '../ui/SoundManager'

interface VehicleData {
  id: string
  type: VehicleType
  position: [number, number, number]
  agentControlled: boolean
  playerId?: string
  isPlayerVehicle?: boolean
  isGhost?: boolean
}

const EMPTY_VEHICLE_POSITION: [number, number, number] = [0, -100, 0]

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
  const [terrainSampler, setTerrainSampler] = useState<((x: number, z: number) => number) | null>(null)
  const [isMobileClient, setIsMobileClient] = useState(false)
  useEffect(() => { setIsMobileClient(_isMobile) }, [])
  const freeAirBubbleUsedRef = useRef(false)
  const preferredVehicle = useGameStore(s => s.ui.preferredVehicleType)

  const playerVehicleObjRef = useRef<RapierRigidBody | null>(null)
  const spectatorVehicleObjRef = useRef<RapierRigidBody | null>(null)
  const lastPriorityToastAtRef = useRef(0)

  const { vehicles, setVehicles, queueState, getVehiclePosition } = usePlayerQueue(
    playerId, address, cloudConfig, preferredVehicle
  )

  const currentPlayerVehicleId = queueState?.getPlayerVehicle(playerId)?.id

  const { data: onChainVehicleRentStatus } = useReadContract({
    address: VEHICLE_RENT_ADDRESS as `0x${string}`,
    abi: VEHICLE_RENT_ABI,
    functionName: 'getRentStatus',
    args: currentPlayerVehicleId ? ([currentPlayerVehicleId] as const) : undefined,
    query: {
      enabled: Boolean(currentPlayerVehicleId) && VEHICLE_RENT_ADDRESS !== '0x0000000000000000000000000000000000000000',
      refetchInterval: POLL_INTERVAL,
    },
  })

  useEffect(() => {
    if (!currentPlayerVehicleId || !onChainVehicleRentStatus) return

    const [, expiresAt, vehicleType] = onChainVehicleRentStatus as unknown as [string, bigint, string]
    if (Number(expiresAt) * 1000 <= Date.now()) return

    setVehicles((prev) => prev.map((vehicle) => (
      vehicle.id === currentPlayerVehicleId
        ? { ...vehicle, type: vehicleType as VehicleType, agentControlled: true }
        : vehicle
    )))
  }, [currentPlayerVehicleId, onChainVehicleRentStatus])

  const assetCountRef = useRef(0)

  const handleDespawn = (id: number) => {
    const playerSess = agentProtocol.getSession('Player')
    if (playerSess?.shieldUntil && playerSess.shieldUntil > Date.now()) {
      emitToast('milestone', '🛡️ BLOCKED', 'Force Field absorbed the attack!')
      playSound('collect')
      return
    }
    setMemeAssets((prev) => {
      const next = prev.filter((item) => item.id !== id)
      assetCountRef.current = next.length
      return next
    })
  }

  const sessions = useGameStore(s => s.sessions)
  const playerSession = sessions['Player']
  const leaderEarned = Object.values(sessions).reduce((max, s) => Math.max(max, s.totalEarned ?? 0), 0)
  const playerEarned = playerSession?.totalEarned ?? 0
  const behindBy = Math.max(0, leaderEarned - playerEarned)
  const isPlayerBehind = behindBy > 0.008
  const flood = useGameStore(s => s.flood)

  const chooseAssistedAssetType = (tier: SpawnTier = 'ground'): MemeAssetType | undefined => {
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

    // Elevated tier items tend to be more valuable/special
    if (tier === 'elevated') {
      if (Math.random() < 0.45) return 'golden_meatball'
      if (Math.random() < 0.4) return 'spicy_pepper'
      return 'floaty_marshmallow'
    }

    // Peak tier - moderate special chance
    if (tier === 'peak' && Math.random() < 0.25) {
      return 'spicy_pepper'
    }

    // Mud tier - more survival items due to hazard
    if (tier === 'mud' && Math.random() < 0.3) {
      return Math.random() < 0.6 ? 'air_bubble' : 'foam_board'
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
  const ENDGAME_RAMP_START = 30 // seconds before round end when spawn rate starts ramping
  const endgameMultiplier = round.isActive && remainingSec > 0 && remainingSec <= ENDGAME_RAMP_START
    ? 1 + (1.4 * (1 - remainingSec / ENDGAME_RAMP_START)) // 1.0 at 30s → 2.4 at 0s
    : 1
  const effectiveSpawnRate = Math.min(10, spawnRate * endgameMultiplier)

  const playerVehicle = queueState?.getPlayerVehicle(playerId)
  const isPlayerActive = queueState?.isPlayerActive(playerId) ?? false
  const spectatorVehicle = useMemo(() => vehicles.find(v => v.agentControlled && !v.isGhost), [vehicles])

  const playerVehiclePosition = useMemo(() => {
    if (isPlayerActive && playerVehicle) {
      const vehicle = vehicles.find(v => v.id === playerVehicle.id)
      if (vehicle) return new THREE.Vector3(...vehicle.position)
    }
    return new THREE.Vector3(0, 0, 0)
  }, [isPlayerActive, playerVehicle, vehicles])

  const { handleCollect } = useCombatEvents({
    playerId,
    setVehicles,
    handleDespawn,
    freeAirBubbleUsedRef,
    lastPriorityToastAtRef,
    playerVehicleObjRef,
    playerVehiclePosition,
  })

  // ── world asset sync (vehicle/queue state managed by usePlayerQueue) ──
  useEffect(() => {
    agentProtocol.updateWorldState({
      assets: memeAssets.map(a => ({ id: a.id, type: a.itemType ?? 'asset', rarity: 'unknown', position: a.position })),
      bounds: cloudConfig.bounds
    })
  }, [memeAssets, cloudConfig.bounds])

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


  const isCameraFollowingVehicle = Boolean(isPlayerActive ? playerVehicle : spectatorVehicle)

  const [useSphericalTerrain, setUseSphericalTerrain] = useState(false);
  const [weatherPhase, setWeatherPhase] = useState(0)
  const setCameraY = useGameStore(s => s.setCameraY)
  const lastWeatherPhaseUpdateRef = useRef(0)
  useFrame((state) => {
    const elapsedTime = state.clock.elapsedTime
    setCameraY(state.camera.position.y)
    if (elapsedTime - lastWeatherPhaseUpdateRef.current < 0.25) return
    lastWeatherPhaseUpdateRef.current = elapsedTime
    setWeatherPhase(elapsedTime)
  })

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
      <CameraManager
        targetRef={isPlayerActive ? playerVehicleObjRef : spectatorVehicleObjRef}
        active={isCameraFollowingVehicle}
        mode={isPlayerActive ? 'active' : 'spectator'}
        intensity={cameraWeatherIntensity}
      />
      <Sky sunPosition={isNightMode ? [100, 1 + (activeWeatherEffects.dayNight?.intensity ?? 0) * 2, 90] : cloudConfig.preset === 'stormy' ? [100, 5, 100] : cloudConfig.preset === 'sunset' ? [100, 8, 50] : [100, 20, 100]} />
      <Environment preset="city" />
      <ambientLight intensity={(cloudConfig.preset === 'stormy' ? 0.3 : cloudConfig.preset === 'cosmic' ? 0.15 : cloudConfig.preset === 'sunset' ? 0.6 : 0.5) * (1 - (activeWeatherEffects.dayNight?.intensity ?? 0) * 0.55) + lightningPulse * 0.35} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={(cloudConfig.preset === 'stormy' ? 0.5 : cloudConfig.preset === 'cosmic' ? 0.3 : 1) * (1 - (activeWeatherEffects.dayNight?.intensity ?? 0) * 0.5) + lightningPulse}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-bias={-0.0005}
      />
      <fog attach="fog" args={[isNightMode ? '#0a0a2e' : cloudConfig.preset === 'stormy' ? '#4a5568' : cloudConfig.preset === 'sunset' ? '#ffccaa' : cloudConfig.preset === 'candy' ? '#ffe0f0' : '#c9d5ff', cloudConfig.preset === 'stormy' ? 10 : cloudConfig.preset === 'cosmic' ? 20 : 18, (cloudConfig.preset === 'stormy' ? 60 : cloudConfig.preset === 'cosmic' ? 120 : 90) - (activeWeatherEffects.lightning?.intensity ?? 0) * 18]} />
      <WeatherParticles config={cloudConfig} />
      <PuddleRipples bounds={cloudConfig.bounds} getHeightAt={terrainSampler ?? undefined} />
      <WeatherPostProcessing config={cloudConfig} />
      <FloodWater bounds={cloudConfig.bounds} />
      <Physics gravity={physicsGravity}>
        <LaunchPads />
        <SkyIslands />
        <CloudManager config={cloudConfig} />
        <MemeAssetSpawner spawnRate={effectiveSpawnRate} bounds={[50, 5, 50]} spawnHeight={18} maxItems={55} onSpawn={(item) => setMemeAssets((prev) => [...prev, { ...item, itemType: chooseAssistedAssetType(item.tier) }])} />
        <AgentVision />
        <IntentionVisualizer />
        <MemeAssetInstances assets={memeAssets} />
        {memeAssets.map((item) => (
          <ProceduralMemeAsset key={item.id} id={item.id} itemType={item.itemType} position={item.position} onDespawn={() => handleDespawn(item.id)} onCollect={(id, stats, collector) => handleCollect(id, stats, collector)} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => {
          const v = vehicles[i]
          const isPlayerVehicle = v?.playerId === playerId && isPlayerActive
          const isSpectatorVehicle = !isPlayerVehicle && spectatorVehicle?.id === v?.id
          
          const props = { 
            id: v?.id ?? `pool-${i}`, 
            position: v?.position ?? EMPTY_VEHICLE_POSITION, 
            agentControlled: v?.agentControlled ?? false, 
            isGhost: !v || v.isGhost,
            playerControlled: isPlayerVehicle,
            onRef: isPlayerVehicle
              ? (ref: RapierRigidBody | null) => { playerVehicleObjRef.current = ref }
              : isSpectatorVehicle
                ? (ref: RapierRigidBody | null) => { spectatorVehicleObjRef.current = ref }
                : undefined
          }

          const agentProfile = v?.agentControlled && v?.playerId ? getAgentByVehicleId(v.playerId) : null
          const labelText = isPlayerVehicle ? '▶ YOU' : agentProfile ? agentProfile.id : null

          return (
            <group key={`pool-${i}`} visible={!!v}>
              {isPlayerVehicle && <PlayerVehicleIndicator position={props.position} />}
              {v?.type === 'tank' ? <Tank {...props} /> : 
               v?.type === 'monster' ? <MonsterTruck {...props} /> : 
               v?.type === 'speedster' ? <Speedster {...props} /> : 
               <Vehicle {...props} />}
              {labelText && v && !v.isGhost && (
                <group position={[v.position[0], v.position[1] + 5, v.position[2]]}>
                  <Text
                    fontSize={0.55}
                    color={isPlayerVehicle ? '#00ff88' : '#fbbf24'}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.06}
                    outlineColor="#000000"
                    renderOrder={999}
                  >
                    {labelText}
                  </Text>
                </group>
              )}
            </group>
          )
        })}
        <MudMarkers />
        <Vegetation getHeightAt={useSphericalTerrain ? getSphericalTerrainHeight : terrainSampler} />
        {useSphericalTerrain ? <IntegratedSphericalTerrain playerPosition={playerVehiclePosition} onTerrainReady={setTerrainSampler} /> : <Terrain onSamplerReady={setTerrainSampler} />}
        <group position={[0, 20, -10]}>
          <Text fontSize={0.5} color={useSphericalTerrain ? "#ff6b6b" : "#4ecdc4"} anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#000000">SPHERICAL: {useSphericalTerrain ? "ON" : "OFF"}</Text>
          <Text position={[0, -1, 0]} fontSize={0.3} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">Press &apos;T&apos; to toggle</Text>
        </group>
        {address && <InWorldQueueStatus playerId={playerId} queueState={queueState} isPlayerActive={isPlayerActive} playerVehicle={playerVehicle} />}
      </Physics>
      <ContactShadows opacity={0.4} scale={50} blur={1} far={20} resolution={256} color="#000000" />
      {isMobileClient && <FrameLimiter fps={30} />}
    </KeyboardControls>
  )
}

function ExperienceWithMobileControls(props: { cloudConfig: CloudConfig; spawnRate?: number; playerVehicleType?: VehicleType }) {
  return (
    <>
      <Experience {...props} />
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
    const eta = position * 30
    const etaText = eta >= 60 ? `~${Math.ceil(eta / 60)}m` : `~${eta}s`
    return (
      <group position={[0, 8, -15]}>
        <Text fontSize={1} color="#fbbf24" anchorX="center" anchorY="middle" outlineWidth={0.05} outlineColor="#000000">👻 SCOUTING MODE</Text>
        <Text position={[0, -1.4, 0]} fontSize={0.6} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#000000">Queue position {position} of {queueState.waitingCount} · spawning {etaText}</Text>
        <Text position={[0, -2.4, 0]} fontSize={0.5} color="#94a3b8" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">Watch the arena — learn food spawn patterns before you drive!</Text>
      </group>
    )
  }
  // Pure spectator — show controls hint so they know what to expect
  return (
    <group position={[0, 6, 0]}>
      <Text fontSize={0.6} color="#94a3b8" anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#000000">WASD / Arrows to drive · Space to brake</Text>
    </group>
  )
}

import { LaunchPad } from './LaunchPad'
// ...
function LaunchPads() { 
  return (
    <>
      <LaunchPad position={[15, 0.25, 15]} target={[20, 30, 20]} />
      <LaunchPad position={[-15, 0.25, -15]} target={[-20, 35, -15]} />
      <LaunchPad position={[0, 0.25, -20]} target={[0, 40, -30]} />
      <LaunchPad position={[-22, 0.25, 15]} target={[-30, 45, 20]} />
      <LaunchPad position={[25, 0.25, -8]} target={[35, 50, -10]} />
    </>
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
        <mesh receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} metalness={0.3} roughness={0.6} transparent opacity={0.85} /></mesh>
        <mesh position={[0, size[1] / 2 + 0.05, 0]}><planeGeometry args={[size[0] * 0.9, size[2] * 0.9]} /><meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.4} transparent opacity={0.5} side={2} /></mesh>
      </RigidBody>
      <mesh ref={glowRef} position={[position[0], position[1] - 0.3, position[2]]}><sphereGeometry args={[Math.max(size[0], size[2]) * 0.4, 16, 8]} /><meshBasicMaterial color={color} transparent opacity={0.15} /></mesh>
    </group>
  )
}

export default ExperienceWithMobileControls;
