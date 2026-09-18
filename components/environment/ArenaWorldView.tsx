'use client'

import { memo, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { ArenaCourse } from '../../services/arenaCourse'
import type { ArenaSession } from '../../services/arenaSession'
import type { ArenaPosition } from '../../services/arenaEpisode'
import { disposeArenaTerrain, loadArenaTerrain } from '../../services/arenaTerrain'
import { createRouteRibbonGeometry } from '../../services/arenaPresentation'
import { planCinematicShots, shotAt, type CinematicShot } from '../../services/arenaCinematic'
import { MintModel } from './MintModel'
import FrameLimiter from '../utils/FrameLimiter'
import { getMintAsset, getMintModelArtifact, getMintModelTransform, getMintModelUrl } from '../../services/mintAssets'

export type ArenaCamera = 'overview' | 'champion' | 'rival'

type WorldProps = {
  course: ArenaCourse
  session: ArenaSession
  follow: ArenaCamera
  cinematic?: boolean
  coachSuggestion?: { edgeId: string } | null
  onReady: () => void
  onError: (error: Error) => void
}

function EpisodeClock({ session }: { session: ArenaSession }) {
  useFrame((_, delta) => session.advanceMicroseconds(Math.round(delta * 1_000_000)), -100)
  return null
}

function FollowCamera({ session, course, follow }: Pick<WorldProps, 'session' | 'course' | 'follow'>) {
  const { camera } = useThree()
  const desired = useRef(new THREE.Vector3())
  const lookAt = useRef(new THREE.Vector3())
  useEffect(() => {
    if (follow !== 'overview') return
    camera.position.set(course.center[0] + 9, course.center[1] + 11, course.center[2] + 13)
    camera.lookAt(course.center[0], course.center[1] + 0.4, course.center[2])
  }, [camera, course, follow])
  useFrame((_, delta) => {
    if (follow === 'overview') return
    const agent = session.getSnapshot().episode.agents.find(candidate => candidate.id === follow)
    if (!agent) return
    desired.current.set(agent.position[0] + 3.2, agent.position[1] + 3.8, agent.position[2] + 4.6)
    lookAt.current.set(agent.position[0], agent.position[1] + 0.35, agent.position[2])
    camera.position.lerp(desired.current, 1 - Math.exp(-delta * 5))
    camera.lookAt(lookAt.current)
  })
  return null
}

/** Replay checkpoints advanced per second of playback (2x real-time). */
const CINEMATIC_FPS = 8

/**
 * Advances the replay frame while a cinematic is playing. The recording is
 * the authority — this only scrubs `session.seek()`, never the simulation.
 */
function CinematicPlayback({ session }: { session: ArenaSession }) {
  const carry = useRef(0)
  useFrame((_, delta) => {
    carry.current += delta * CINEMATIC_FPS
    const frames = Math.floor(carry.current)
    if (frames < 1) return
    carry.current -= frames
    const view = session.getSnapshot()
    if (view.phase !== 'review') return
    const next = Math.min(view.replayIndex + frames, view.replayLength - 1)
    if (next !== view.replayIndex) session.seek(next)
  })
  return null
}

/**
 * Camera director for replay cinematics. The storyboard is a deterministic
 * function of the recording (see docs/SCENES.md); shots hard-cut on their
 * boundaries and drift gently inside a span.
 */
function CinematicCamera({ session, course }: Pick<WorldProps, 'session' | 'course'>) {
  const { camera } = useThree()
  // Replan when the recording under review changes (e.g. a different
  // tournament match is loaded while the cinematic stays mounted).
  const storyboard = useRef<{ recording: unknown; shots: CinematicShot[] } | null>(null)
  const lastShot = useRef<CinematicShot | null>(null)
  const desired = useRef(new THREE.Vector3())
  const lookAt = useRef(new THREE.Vector3())
  const elapsed = useRef(0)
  useFrame((_, delta) => {
    elapsed.current += delta
    const view = session.getSnapshot()
    if (view.phase !== 'review') return
    const recording = session.activeRecording()
    if (storyboard.current?.recording !== recording) {
      storyboard.current = { recording, shots: planCinematicShots(recording) }
      lastShot.current = null
    }
    const shots = storyboard.current.shots
    const shot = shotAt(shots, view.replayIndex) ?? shots.at(-1)
    if (!shot) return
    const focus = view.episode.agents.find(agent => agent.id === shot.agentId)
    const floodZone = course.floodZones[0]?.position ?? course.center
    switch (shot.kind) {
      case 'flood':
        desired.current.set(floodZone[0] + 5.5, floodZone[1] + 5, floodZone[2] + 5.5)
        lookAt.current.set(floodZone[0], floodZone[1] + 0.2, floodZone[2])
        break
      case 'finish': {
        const angle = elapsed.current * 0.25
        desired.current.set(course.center[0] + Math.cos(angle) * 9, course.center[1] + 6.5, course.center[2] + Math.sin(angle) * 9)
        lookAt.current.set(course.center[0], course.center[1] + 0.4, course.center[2])
        break
      }
      case 'establish':
        desired.current.set(course.center[0] + 10, course.center[1] + 8, course.center[2] + 12)
        lookAt.current.set(course.center[0], course.center[1] + 0.4, course.center[2])
        break
      default: {
        const position = focus?.position ?? course.center
        desired.current.set(position[0] + 3, position[1] + 3, position[2] + 4)
        lookAt.current.set(position[0], position[1] + 0.35, position[2])
      }
    }
    if (lastShot.current !== shot) {
      camera.position.copy(desired.current)
      lastShot.current = shot
    } else {
      camera.position.lerp(desired.current, 1 - Math.exp(-delta * 4))
    }
    camera.lookAt(lookAt.current)
  })
  return null
}

/**
 * Primary terrain: the authored Sandstone Basin GLB, the same file the physics
 * collider is extracted from, so no clipping or fallback layer is needed.
 */
function TerrainMesh({
  url,
  sha256,
  onReady,
  onError,
}: {
  url: string
  sha256: string
  onReady?: () => void
  onError?: (error: Error) => void
}) {
  const [scene, setScene] = useState<THREE.Group | null>(null)
  // The effect owns the loaded scene lifetime (abort + dispose); callbacks go
  // through refs so prop identity changes never trigger a reload.
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onReadyRef.current = onReady
    onErrorRef.current = onError
  })

  useEffect(() => {
    const abort = new AbortController()
    let loaded: THREE.Group | null = null
    loadArenaTerrain(url, sha256, abort.signal)
      .then(scene => {
        if (abort.signal.aborted) {
          disposeArenaTerrain(scene)
          return
        }
        scene.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return
          object.receiveShadow = true
          object.castShadow = object.name.startsWith('Rock')
        })
        loaded = scene
        setScene(scene)
      })
      .catch(error => {
        if (abort.signal.aborted) return
        onErrorRef.current?.(error instanceof Error ? error : new Error('Terrain mesh failed to load'))
      })
    return () => {
      abort.abort()
      if (loaded) disposeArenaTerrain(loaded)
    }
  }, [url, sha256])

  useEffect(() => {
    if (scene) onReadyRef.current?.()
  }, [scene])

  if (!scene) return null
  return <primitive object={scene} />
}

function RoverGeometry({ color, wheelRefs }: { color: string; wheelRefs: React.RefObject<THREE.Mesh[]> }) {
  return (
    <>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.34, 0.14, 0.45]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.32, -0.04]} castShadow>
        <boxGeometry args={[0.24, 0.12, 0.24]} />
        <meshStandardMaterial color="#17292d" roughness={0.2} metalness={0.6} />
      </mesh>
      {[-1, 1].flatMap((x, xi) => [-1, 1].map((z, zi) => {
        const index = xi * 2 + zi
        return (
          <mesh
            key={`${x}-${z}`}
            ref={(mesh) => { if (mesh && wheelRefs.current) wheelRefs.current[index] = mesh }}
            position={[x * 0.18, 0.105, z * 0.15]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.1, 0.1, 0.075, 12]} />
            <meshStandardMaterial color="#172124" roughness={0.8} />
          </mesh>
        )
      }))}
      <mesh position={[0, 0.23, 0.23]}>
        <boxGeometry args={[0.22, 0.035, 0.015]} />
        <meshBasicMaterial color="#f8f5d9" />
      </mesh>
      <mesh position={[0, 0.48, -0.1]}>
        <cylinderGeometry args={[0.012, 0.012, 0.24, 6]} />
        <meshStandardMaterial color="#243a3b" />
      </mesh>
      <mesh position={[0, 0.62, -0.1]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.34, 0.39, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
      </mesh>
    </>
  )
}

/**
 * Distinct procedural geometry for the rival rover: a low, wide tracked cargo
 * hauler. The silhouette is intentionally different from the champion's cab +
 * 4-wheel layout so a side-by-side comparison reads as "two distinct vehicles"
 * rather than "two tinted copies of the same GLB". Used whenever the rival
 * registry entry is missing.
 */
function RivalRoverGeometry({ color, wheelRefs }: { color: string; wheelRefs: React.RefObject<THREE.Mesh[]> }) {
  return (
    <>
      {/* Lower hull */}
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.4, 0.18, 0.5]} />
        <meshStandardMaterial color="#38424d" roughness={0.55} metalness={0.45} />
      </mesh>
      {/* Side track housings */}
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * 0.27, 0.13, 0]} castShadow>
          <boxGeometry args={[0.13, 0.18, 0.52]} />
          <meshStandardMaterial color="#1c2128" roughness={0.75} metalness={0.2} />
        </mesh>
      ))}
      {/* Cargo bay on top */}
      <mesh position={[0, 0.36, 0.02]} castShadow>
        <boxGeometry args={[0.36, 0.18, 0.38]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.3} />
      </mesh>
      {/* Cab window at the front */}
      <mesh position={[0, 0.34, 0.24]} castShadow>
        <boxGeometry args={[0.28, 0.14, 0.05]} />
        <meshStandardMaterial color="#6bc8ff" emissive="#1f5b8a" emissiveIntensity={0.4} roughness={0.2} metalness={0.6} />
      </mesh>
      {/* Drive wheels: 4 thick cylinders along the side tracks, animated as wheels */}
      {[-1, 1].flatMap((x, xi) => [-1, 1].map((z, zi) => {
        const index = xi * 2 + zi
        return (
          <mesh
            key={`${x}-${z}`}
            ref={(mesh) => { if (mesh && wheelRefs.current) wheelRefs.current[index] = mesh }}
            position={[x * 0.34, 0.13, z * 0.21]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.11, 0.11, 0.1, 12]} />
            <meshStandardMaterial color="#0e1218" roughness={0.85} metalness={0.3} />
          </mesh>
        )
      }))}
      {/* Roof crate */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.2, 0.08, 0.2]} />
        <meshStandardMaterial color="#7b5526" roughness={0.8} />
      </mesh>
      {/* Twin amber warning lights */}
      {[-1, 1].map(side => (
        <mesh key={`light-${side}`} position={[side * 0.1, 0.6, 0.16]}>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshBasicMaterial color="#ffb14d" />
        </mesh>
      ))}
      {/* Ground ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.36, 0.42, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </>
  )
}

function RoverShadow({ session, id }: { session: ArenaSession; id: string }) {
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!meshRef.current) return
    const agent = session.getSnapshot().episode.agents.find(candidate => candidate.id === id)
    if (!agent) return
    meshRef.current.position.set(agent.position[0], agent.position[1] + 0.02, agent.position[2])
  })
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.42, 24]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
    </mesh>
  )
}

function Rover({ session, id, color }: { session: ArenaSession; id: string; color: string }) {
  const group = useRef<THREE.Group>(null)
  const previous = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3())
  const targetRot = useRef(new THREE.Quaternion())
  const lastTick = useRef(-1)
  const wheelRefs = useRef<THREE.Mesh[]>([])

  useFrame((_, delta) => {
    if (!group.current) return
    const view = session.getSnapshot()
    const agent = view.episode.agents.find(candidate => candidate.id === id)
    if (!agent) return
    target.current.fromArray(agent.position)

    if (agent.rotation) {
      targetRot.current.set(agent.rotation[0], agent.rotation[1], agent.rotation[2], agent.rotation[3])
    }

    if ((view.phase !== 'running' && view.phase !== 'review') || view.episode.tick < lastTick.current || lastTick.current < 0) {
      group.current.position.copy(target.current)
      group.current.quaternion.copy(targetRot.current)
    } else {
      group.current.position.lerp(target.current, 1 - Math.exp(-delta * 40))
      group.current.quaternion.slerp(targetRot.current, 1 - Math.exp(-delta * 30))
    }

    const dx = target.current.x - previous.current.x
    const dz = target.current.z - previous.current.z
    const horizontalSpeed = Math.hypot(dx, dz) / Math.max(delta, 0.001)
    const wheelRotation = horizontalSpeed * delta * 8
    for (const wheel of wheelRefs.current) {
      if (wheel) wheel.rotation.y += wheelRotation
    }

    previous.current.copy(target.current)
    lastTick.current = view.episode.tick
  })

  const assetKey = `${id}Rover`
  const asset = getMintAsset(assetKey)
  const artifact = asset ? getMintModelArtifact(asset) : undefined
  const modelUrl = artifact ? getMintModelUrl(artifact) : undefined
  const transform = asset ? getMintModelTransform(asset) : undefined
  const ProceduralGeometry = id === 'rival' ? RivalRoverGeometry : RoverGeometry

  return (
    <>
      <RoverShadow session={session} id={id} />
      <group ref={group}>
        {modelUrl ? (
          <Suspense fallback={<ProceduralGeometry color={color} wheelRefs={wheelRefs} />}>
            <MintModel url={modelUrl} transform={transform} tint={id === 'rival' ? color : undefined} />
          </Suspense>
        ) : (
          <ProceduralGeometry color={color} wheelRefs={wheelRefs} />
        )}
      </group>
    </>
  )
}

function Resource({ session, id, position }: { session: ArenaSession; id: string; position: ArenaPosition }) {
  const group = useRef<THREE.Group>(null)
  const outerRingRef = useRef<THREE.Mesh>(null)
  const innerRingRef = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (!group.current) return
    group.current.visible = session.getSnapshot().episode.resources.some(resource => resource.id === id && resource.collectedBy === null)
    if (outerRingRef.current) outerRingRef.current.rotation.y += delta * 0.85
    if (innerRingRef.current) innerRingRef.current.rotation.x += delta * 0.6
    group.current.position.y = position[1] + Math.sin(performance.now() * 0.003 + position[0]) * 0.04
  })
  return (
    <group ref={group} position={position}>
      <mesh castShadow>
        <octahedronGeometry args={[0.14]} />
        <meshStandardMaterial color="#ffe08a" emissive="#ff9b3a" emissiveIntensity={0.25} metalness={0.45} roughness={0.2} />
      </mesh>
      <mesh ref={outerRingRef} castShadow>
        <torusGeometry args={[0.22, 0.018, 12, 32]} />
        <meshStandardMaterial color="#ffb14d" emissive="#ff8c1a" emissiveIntensity={0.25} metalness={0.4} roughness={0.25} />
      </mesh>
      <mesh ref={innerRingRef} castShadow>
        <torusGeometry args={[0.18, 0.012, 10, 24]} />
        <meshStandardMaterial color="#ffe08a" emissive="#c98520" emissiveIntensity={0.25} metalness={0.45} roughness={0.2} />
      </mesh>
    </group>
  )
}

function PathRibbon({ session, edgeId, points, color }: { session: ArenaSession; edgeId: string; points: ArenaPosition[]; color: string }) {
  const group = useRef<THREE.Group>(null)
  const geometry = useMemo(() => createRouteRibbonGeometry(points, 0.09, 0.025), [points])

  useEffect(() => () => { geometry?.dispose() }, [geometry])
  useFrame(() => {
    if (!group.current) return
    group.current.visible = session.getSnapshot().episode.agents.some(agent => agent.transit?.edgeId === edgeId)
  })
  if (!geometry) return null
  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry} renderOrder={2}>
        <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/**
 * Coach-time ghost ribbon. A translucent stripe along the edge the
 * safe-baseline policy would have taken at the coach-selected frame.
 */
function CoachGhostRibbon({ points, color }: { points: ArenaPosition[]; color: string }) {
  const geometry = useMemo(() => createRouteRibbonGeometry(points, 0.18, 0.035), [points])

  useEffect(() => () => { geometry?.dispose() }, [geometry])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} renderOrder={3}>
      <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

function CoachTrailLayer({ course, coachSuggestion }: { course: ArenaCourse; coachSuggestion?: { edgeId: string } | null }) {
  const edge = coachSuggestion ? course.scenario.edges.find(candidate => candidate.id === coachSuggestion.edgeId) : undefined
  const points = edge?.path
  return (
    <group visible={!!points}>
      {points && <CoachGhostRibbon points={points} color="#ffd57a" />}
    </group>
  )
}

function Flood({ session, course }: Pick<WorldProps, 'session' | 'course'>) {
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (group.current) group.current.visible = session.getSnapshot().episode.weather.flooded
  })
  return (
    <group ref={group} visible={false}>
      {course.floodZones.map((zone, index) => (
        <mesh key={index} position={[zone.position[0], zone.position[1] - 0.05, zone.position[2]]}>
          <boxGeometry args={[zone.size[0], 0.22, zone.size[1]]} />
          <meshStandardMaterial
            color="#4eb4d0"
            emissive="#146988"
            emissiveIntensity={0.45}
            transparent
            opacity={0.72}
            roughness={0.15}
            metalness={0.25}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

function CourseLandmarks({ course }: { course: ArenaCourse }) {
  const championBase = course.scenario.nodes.find(node => node.id === 'champion-base')?.position
  const rivalBase = course.scenario.nodes.find(node => node.id === 'rival-base')?.position
  const ridgeCenter = course.scenario.nodes.find(node => node.id === 'ridge-center')?.position
  const valleyCenter = course.scenario.nodes.find(node => node.id === 'valley-center')?.position

  return (
    <group>
      {/* Central orientation marker */}
      <group position={[course.center[0], course.center[1], course.center[2]]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.24, 0.4, 6]} />
          <meshStandardMaterial color="#8a7a5f" emissive="#4a3f2c" emissiveIntensity={0.2} metalness={0.3} roughness={0.6} />
        </mesh>
      </group>

      {ridgeCenter && (
        <group position={ridgeCenter}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <boxGeometry args={[0.24, 0.45, 0.24]} />
            <meshStandardMaterial color="#3d4a52" emissive="#1f2a30" emissiveIntensity={0.15} metalness={0.3} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.41, 0]}>
            <boxGeometry args={[0.4, 0.08, 0.4]} />
            <meshStandardMaterial color="#5f8f7a" emissive="#2f5d48" emissiveIntensity={0.3} />
          </mesh>
        </group>
      )}

      {valleyCenter && (
        <group position={valleyCenter}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.24, 0.4, 8]} />
            <meshStandardMaterial color="#c4a16a" emissive="#6d4d24" emissiveIntensity={0.2} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.4, 0]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshStandardMaterial color="#f0c27a" emissive="#b8732a" emissiveIntensity={0.3} />
          </mesh>
        </group>
      )}

      {championBase && (
        <mesh position={[championBase[0], championBase[1] + 0.03, championBase[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.95, 40]} />
          <meshStandardMaterial color="#9ccc63" emissive="#4d7a28" emissiveIntensity={0.35} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      {rivalBase && (
        <mesh position={[rivalBase[0], rivalBase[1] + 0.03, rivalBase[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.95, 40]} />
          <meshStandardMaterial color="#efad68" emissive="#8a5520" emissiveIntensity={0.35} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

function ReadyOnce({ ready, onReady }: { ready: boolean; onReady: () => void }) {
  const sent = useRef(false)
  useEffect(() => {
    if (!ready || sent.current) return
    sent.current = true
    onReady()
  }, [onReady, ready])
  return null
}

function World({ course, session, follow, cinematic = false, coachSuggestion, onReady, onError, lite }: WorldProps & { lite: boolean }) {
  // Mesh terrain is the same authored GLB the collider extracts from, so the
  // scene needs no splat layer or fallback mesh.
  const [terrainReady, setTerrainReady] = useState(false)

  return (
    <>
      {lite && <FrameLimiter fps={30} />}
      <EpisodeClock session={session} />
      <ReadyOnce ready={terrainReady} onReady={onReady} />
      <color attach="background" args={['#d9d4c6']} />
      <fog attach="fog" args={['#d9d4c6', 32, 65]} />
      <hemisphereLight args={['#edf2ef', '#8c7259', 1.1]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 16, -5]}
        intensity={2}
        color="#fff1d6"
        castShadow={!lite}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-8, 8, -4]} intensity={0.35} />

      <TerrainMesh
        key={`${course.config.terrain.url}:${course.config.terrain.sha256}`}
        url={course.config.terrain.url}
        sha256={course.config.terrain.sha256}
        onReady={() => setTerrainReady(true)}
        onError={onError}
      />

      <OrbitControls
        makeDefault
        target={course.center}
        enabled={follow === 'overview' && !cinematic}
        minDistance={6}
        maxDistance={26}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI * 0.43}
      />
      {cinematic ? (
        <>
          <CinematicPlayback session={session} />
          <CinematicCamera course={course} session={session} />
        </>
      ) : (
        <FollowCamera course={course} session={session} follow={follow} />
      )}

      {course.scenario.edges.map(edge => (
        <PathRibbon
          key={edge.id}
          session={session}
          edgeId={edge.id}
          points={edge.path!}
          color={edge.floodable ? '#e29a45' : '#4f9d86'}
        />
      ))}

      <CourseLandmarks course={course} />
      <CoachTrailLayer course={course} coachSuggestion={coachSuggestion} />

      {course.scenario.entrants.map(entrant => {
        const position = course.scenario.nodes.find(node => node.id === entrant.baseNode)!.position
        const color = entrant.id === 'champion' ? '#bce478' : '#efad68'
        return (
          <group key={entrant.id}>
            <mesh position={[position[0], position[1] + 0.05, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.62, 0.82, 40]} />
              <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.7} />
            </mesh>
            <Rover session={session} id={entrant.id} color={color} />
          </group>
        )
      })}
      {course.scenario.resources.map((resource, index) => {
        const node = course.scenario.nodes.find(candidate => candidate.id === resource.nodeId)!
        const localIndex = course.scenario.resources.slice(0, index).filter(candidate => candidate.nodeId === resource.nodeId).length
        const angle = (localIndex % 4) * Math.PI / 2
        const position: ArenaPosition = [node.position[0] + Math.cos(angle) * 0.42, node.position[1] + 0.45 + Math.floor(localIndex / 4) * 0.22, node.position[2] + Math.sin(angle) * 0.42]
        return <Resource key={resource.id} session={session} id={resource.id} position={position} />
      })}
      <Flood course={course} session={session} />
    </>
  )
}

function detectLiteGraphics() {
  if (typeof window === 'undefined') return true
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.matchMedia('(max-width: 760px)').matches
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return Boolean(coarse || narrow || reduce || connection?.saveData)
}

export default memo(function ArenaWorldView(props: WorldProps) {
  const [lite] = useState(detectLiteGraphics)
  return (
    <Canvas
      shadows={!lite}
      camera={{ position: [16, 12, 16], fov: 42, near: 0.05, far: 180 }}
      dpr={lite ? [1, 1] : [1, 1.5]}
      frameloop={lite ? 'never' : 'always'}
      gl={{ antialias: true, alpha: false, powerPreference: lite ? 'low-power' : 'high-performance', preserveDrawingBuffer: false }}
      fallback={<p role="alert">This device could not create a WebGL view.</p>}
    >
      <World {...props} lite={lite} />
    </Canvas>
  )
})
