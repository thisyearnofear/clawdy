'use client'

import { memo, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { ArenaCourse } from '../../services/arenaCourse'
import type { ArenaSession } from '../../services/arenaSession'
import type { ArenaAgentState, ArenaPosition } from '../../services/arenaEpisode'
import { disposeArenaTerrain, loadArenaTerrain } from '../../services/arenaTerrain'
import { createTerrainDetailTextures } from './terrainDetail'
import { createRouteRibbonGeometry, advancePoseHistory, samplePoseHistory, type PoseHistory } from '../../services/arenaPresentation'
import { planCinematicShots, shotAt, type CinematicShot } from '../../services/arenaCinematic'
import { MintModel } from './MintModel'
import { ROVER_PHYSICS } from '../../services/arenaPhysics'
import { BankBursts } from './BankBursts'
import { FloodWater } from './FloodWater'
import { FloodTelegraph } from './FloodTelegraph'
import { WorldFX, type FxCue } from './WorldFX'
import { RushEventFX } from './RushEventFX'
import { RoverStatus } from './RoverStatus'
import { VisionRing } from './VisionRing'
import { RoverGeometry, RivalRoverGeometry } from './RoverGeometry'
import { RoverFX } from './RoverFX'
import { ArenaEnvironment } from './ArenaEnvironment'
import { contactShadowTexture } from './contactShadow'
import { PracticeGhost } from './PracticeGhost'
import FrameLimiter from '../utils/FrameLimiter'
import { getMintAsset, getMintModelArtifact, getMintModelTransform, getMintModelUrl } from '../../services/mintAssets'
import { resolveForgedModel, resolveRoverModel } from '../../services/chassisAssets'
import { ModelBoundary } from './ModelBoundary'
import type { ChassisId } from '../../services/chassis'

export type ArenaCamera = 'overview' | 'champion' | 'rival' | 'compare'

type WorldProps = {
  course: ArenaCourse
  session: ArenaSession
  follow: ArenaCamera
  cinematic?: boolean
  coachOriginalEdgeId?: string | null
  coachChoices?: { edgeId: string }[]
  selectedCoachEdgeId?: string | null
  onCoachEdge?: (edgeId: string) => void
  ghostPose?: { agent: Pick<ArenaAgentState, 'position' | 'rotation'>; label: string; accent?: string } | null
  championName?: string
  /** Optional chassis per entrant id; picks the chassis body model. Absent keeps the legacy rover look. */
  chassisByEntrant?: Partial<Record<string, ChassisId>>
  /** The champion's forged look (Forge). Falls back to the standard rover if the model cannot load. */
  forgedLook?: { url: string; chassis: string } | null
  /** Champion accent for ring + rover tint (defaults to canopy green). */
  championAccent?: string
  /** Presentation-side beat detected by the scene (clash / sighting). */
  fxCue?: FxCue | null
  onReady: () => void
  onError: (error: Error) => void
}

/** Cap one display frame's sim debt so a hitch doesn't dump a multi-tick spike. */
const MAX_FRAME_DELTA_S = 0.1

function EpisodeClock({ session }: { session: ArenaSession }) {
  useFrame((_, delta) => {
    const capped = Math.min(Math.max(delta, 0), MAX_FRAME_DELTA_S)
    session.advanceMicroseconds(Math.round(capped * 1_000_000))
  }, -100)
  return null
}

/**
 * Render-layer tick interpolation. The simulation commits poses on a 50 ms
 * grid; rendering the raw commit (or exponentially chasing it) reads as
 * judder at high refresh rates. We keep the two most recent observed poses
 * per agent and render one tick behind the authority, lerped by the
 * session's tick-fraction — a constant 50 ms delay with zero ripple.
 * Pure presentation: the episode authority is never touched.
 */
const poseHistories = new WeakMap<ArenaSession, Map<string, PoseHistory>>()

function sampleInterpolatedPose(
  session: ArenaSession,
  id: string,
  nowSeconds: number,
  outPos: THREE.Vector3,
  outRot: THREE.Quaternion,
): boolean {
  const episode = session.liveEpisode()
  const agent = episode.agents.find(candidate => candidate.id === id)
  if (!agent) return false
  let byAgent = poseHistories.get(session)
  if (!byAgent) {
    byAgent = new Map()
    poseHistories.set(session, byAgent)
  }
  byAgent.set(id, advancePoseHistory(byAgent.get(id) ?? null, episode, episode.tick, agent))
  samplePoseHistory(byAgent.get(id)!, session.interpolation(), outPos, outRot, nowSeconds)
  return true
}

function FollowCamera({ session, course, follow, ghostPose }: Pick<WorldProps, 'session' | 'course' | 'follow'> & { ghostPose: WorldProps['ghostPose'] }) {
  const { camera } = useThree()
  const desired = useRef(new THREE.Vector3())
  const lookAt = useRef(new THREE.Vector3())
  const midpoint = useRef(new THREE.Vector3())
  const separation = useRef(new THREE.Vector3())
  useEffect(() => {
    if (follow === 'compare') return
    if (follow !== 'overview') return
    camera.position.set(course.center[0] + 9, course.center[1] + 11, course.center[2] + 13)
    camera.lookAt(course.center[0], course.center[1] + 0.4, course.center[2])
  }, [camera, course, follow])
  // Framing both brains is the whole point of the comparison view: with the
  // default camera the two rovers can sit on top of each other and the
  // divergence is invisible, which is the opposite of what this mode is for.
  useEffect(() => {
    if (follow !== 'compare' || !ghostPose) return
    const live = session.liveEpisode().agents.find(candidate => candidate.id === 'champion')
    if (!live) return
    midpoint.current.set(
      (live.position[0] + ghostPose.agent.position[0]) / 2,
      live.position[1],
      (live.position[2] + ghostPose.agent.position[2]) / 2,
    )
    separation.current.set(
      live.position[0] - ghostPose.agent.position[0],
      0,
      live.position[2] - ghostPose.agent.position[2],
    )
    // Frame wide enough to hold both plus margin, with a floor so two rovers on
    // the same tile do not slam the camera into the ground.
    const span = Math.max(separation.current.length(), 2.5)
    const distance = 7 + span * 2.1
    camera.position.set(midpoint.current.x + distance * 0.62, midpoint.current.y + distance * 0.66, midpoint.current.z + distance * 0.62)
    camera.lookAt(midpoint.current.x, midpoint.current.y + 0.4, midpoint.current.z)
  }, [camera, course, follow, ghostPose, session])
  const agentPos = useRef(new THREE.Vector3())
  const agentRot = useRef(new THREE.Quaternion())
  const destPos = useRef(new THREE.Vector3())
  useFrame((state, delta) => {
    if (follow === 'overview') return
    // 'compare' is framed by the effect above and intentionally never enters
    // the single-agent chase below — that path resolves `follow` as an agent id.
    if (follow === 'compare') return
    // Track the interpolated pose so camera and rover share one motion
    // curve — chasing the raw tick commit while the rover smooths it makes
    // the subject swim inside the frame.
    if (!sampleInterpolatedPose(session, follow, state.clock.elapsedTime, agentPos.current, agentRot.current)) return
    const agent = session.liveEpisode().agents.find(candidate => candidate.id === follow)
    const destNode = agent?.transit
      ? course.scenario.nodes.find(node => node.id === agent.transit!.to)
      : null
    lookAt.current.set(agentPos.current.x, agentPos.current.y + 0.35, agentPos.current.z)
    if (destNode) {
      destPos.current.set(destNode.position[0], destNode.position[1], destNode.position[2]).sub(agentPos.current)
      const distance = destPos.current.length()
      if (distance > 0.01) {
        destPos.current.multiplyScalar(Math.min(distance, 2.2) / distance * 0.4)
        lookAt.current.add(destPos.current)
      }
    }
    desired.current.set(agentPos.current.x + 3.2, agentPos.current.y + 3.8, agentPos.current.z + 4.6)
    // A negative delta would blow the lerp factor past 1 and NaN the camera for good.
    camera.position.lerp(desired.current, 1 - Math.exp(-Math.max(delta, 0) * 5))
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
 * Primary terrain. Renders the UV-carrying visual twin when the course pins
 * one, otherwise the collider GLB itself. The twin has the same geometry, so
 * there is no clipping either way; if it fails to load we fall back to the
 * collider mesh rather than leave the arena empty.
 */
function TerrainMesh({
  url,
  sha256,
  visual,
  onReady,
  onError,
}: {
  url: string
  sha256: string
  visual?: { url: string; sha256: string }
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

  const visualUrl = visual?.url
  const visualSha256 = visual?.sha256

  useEffect(() => {
    const abort = new AbortController()
    let loaded: THREE.Group | null = null
    const load = async () => {
      if (visualUrl && visualSha256) {
        try {
          return await loadArenaTerrain(visualUrl, visualSha256, abort.signal)
        } catch (error) {
          if (abort.signal.aborted) throw error
          console.warn('Visual terrain failed to load; using the collider mesh', error)
        }
      }
      return loadArenaTerrain(url, sha256, abort.signal)
    }
    load()
      .then(scene => {
        if (abort.signal.aborted) {
          disposeArenaTerrain(scene)
          return
        }
        let detail: ReturnType<typeof createTerrainDetailTextures> | null = null
        scene.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return
          object.receiveShadow = true
          object.castShadow = object.name.startsWith('Rock')
          // Only the visual twin carries UVs; the collider fallback renders flat as before.
          if (object.name.startsWith('Terrain') && object.geometry.getAttribute('uv')) {
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              if (!(material instanceof THREE.MeshStandardMaterial)) continue
              detail ??= createTerrainDetailTextures()
              material.map = detail.map
              material.bumpMap = detail.bump
              material.bumpScale = 0.6
              material.needsUpdate = true
            }
          }
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
  }, [url, sha256, visualUrl, visualSha256])

  useEffect(() => {
    if (scene) onReadyRef.current?.()
  }, [scene])

  if (!scene) return null
  return <primitive object={scene} />
}

function RoverShadow({ session, id }: { session: ArenaSession; id: string }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const pos = useRef(new THREE.Vector3())
  const rot = useRef(new THREE.Quaternion())
  const texture = useMemo(() => contactShadowTexture(), [])
  useFrame((state) => {
    if (!meshRef.current) return
    if (!sampleInterpolatedPose(session, id, state.clock.elapsedTime, pos.current, rot.current)) return
    // pos is the body centre, groundFollowHeight above the terrain.
    meshRef.current.position.set(pos.current.x, pos.current.y - ROVER_PHYSICS.groundFollowHeight + 0.02, pos.current.z)
  })
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.05, 1.05]} />
      {texture
        ? <meshBasicMaterial map={texture} transparent opacity={0.5} depthWrite={false} />
        : <meshBasicMaterial color="#000000" transparent opacity={0.4} depthWrite={false} />}
    </mesh>
  )
}

// The authority places the body centre groundFollowHeight above the terrain; the
// visual body is scaled by ROVER_BODY_SCALE, so its lowest point rests here in local units.
const ROVER_BODY_SCALE = 1.35
const ROVER_REST_Y = -ROVER_PHYSICS.groundFollowHeight / ROVER_BODY_SCALE

function Rover({ session, id, color, chassis, forged }: { session: ArenaSession; id: string; color: string; chassis?: ChassisId; forged?: { url: string; chassis: string } | null }) {
  const group = useRef<THREE.Group>(null)
  const previous = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3())
  const targetRot = useRef(new THREE.Quaternion())
  const wheelRefs = useRef<THREE.Mesh[]>([])
  const body = useRef<THREE.Group>(null)
  const lastHeading = useRef(0)

  useFrame((state, delta) => {
    if (!group.current) return
    // True tick interpolation (one tick behind the authority, lerped by the
    // session tick-fraction) — replaces exponential chasing, which left a
    // 20 Hz velocity ripple against the 50 ms commit grid.
    if (!sampleInterpolatedPose(session, id, state.clock.elapsedTime, target.current, targetRot.current)) return

    group.current.position.copy(target.current)
    group.current.quaternion.copy(targetRot.current)

    const dx = target.current.x - previous.current.x
    const dz = target.current.z - previous.current.z
    const horizontalSpeed = Math.hypot(dx, dz) / Math.max(delta, 0.001)
    const wheelRotation = horizontalSpeed * delta * 8
    for (const wheel of wheelRefs.current) {
      if (wheel) wheel.rotation.y += wheelRotation
    }

    // The visual chassis reacts to motion; the authoritative pose stays untouched.
    if (body.current) {
      const moving = horizontalSpeed > 0.15
      const heading = moving ? Math.atan2(dx, dz) : lastHeading.current
      const turn = Math.atan2(Math.sin(heading - lastHeading.current), Math.cos(heading - lastHeading.current))
      const lean = moving ? THREE.MathUtils.clamp(-turn * 0.22, -0.1, 0.1) : 0
      const easing = 1 - Math.exp(-delta * 7)
      body.current.rotation.z = THREE.MathUtils.lerp(body.current.rotation.z, lean, easing)
      body.current.rotation.x = THREE.MathUtils.lerp(body.current.rotation.x, moving ? -0.035 : 0, easing)
      if (moving) lastHeading.current = heading
    }

    previous.current.copy(target.current)
  })

  const { url: modelUrl, transform } = resolveRoverModel(id, chassis)
  const ProceduralGeometry = id === 'rival' ? RivalRoverGeometry : RoverGeometry
  const forgedSource = forged ? resolveForgedModel(forged.chassis, forged.url) : undefined

  const standardBody = modelUrl ? (
    <Suspense fallback={<ProceduralGeometry color={color} wheelRefs={wheelRefs} />}>
      <MintModel url={modelUrl} transform={transform} tint={color} restY={ROVER_REST_Y} />
    </Suspense>
  ) : (
    <ProceduralGeometry color={color} wheelRefs={wheelRefs} />
  )

  return (
    <>
      <RoverShadow session={session} id={id} />
      <group ref={group}>
        <group ref={body} scale={ROVER_BODY_SCALE}>
          {forgedSource?.url ? (
            // Forged models keep their own paint (no accent tint). Any load failure shows the standard rover.
            <ModelBoundary key={forgedSource.url} fallback={standardBody}>
              <Suspense fallback={standardBody}>
                <MintModel url={forgedSource.url} transform={forgedSource.transform} restY={ROVER_REST_Y} />
              </Suspense>
            </ModelBoundary>
          ) : standardBody}
        </group>
      </group>
    </>
  )
}

function ProceduralCoreBody() {
  return (
    <mesh castShadow>
      <octahedronGeometry args={[0.14]} />
      <meshStandardMaterial color="#ffe08a" emissive="#ff9b3a" emissiveIntensity={0.25} metalness={0.45} roughness={0.2} />
    </mesh>
  )
}

// The Tripo-generated crystal when the registry has it; the procedural gem while it loads or if it is absent.
function CoreBody() {
  const asset = getMintAsset('energyCore')
  const artifact = asset ? getMintModelArtifact(asset) : undefined
  if (!asset || !artifact) return <ProceduralCoreBody />
  return (
    <Suspense fallback={<ProceduralCoreBody />}>
      <MintModel url={getMintModelUrl(artifact)} transform={getMintModelTransform(asset)} />
    </Suspense>
  )
}

function Resource({ session, id, position }: { session: ArenaSession; id: string; position: ArenaPosition }) {
  const group = useRef<THREE.Group>(null)
  const outerRingRef = useRef<THREE.Mesh>(null)
  const innerRingRef = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (!group.current) return
    const episode = session.liveEpisode()
    group.current.visible = episode.resources.some(resource => resource.id === id && resource.collectedBy === null &&
      (resource.spawnTick === undefined || episode.tick >= resource.spawnTick))
    if (outerRingRef.current) outerRingRef.current.rotation.y += delta * 0.85
    if (innerRingRef.current) innerRingRef.current.rotation.x += delta * 0.6
    group.current.position.y = position[1] + Math.sin(performance.now() * 0.003 + position[0]) * 0.04
  })
  return (
    <group ref={group} position={position}>
      <CoreBody />
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

function PathRibbon({ session, edgeId, points, color, coachEdgeIds, selectedCoachEdgeId }: {
  session: ArenaSession
  edgeId: string
  points: ArenaPosition[]
  color: string
  coachEdgeIds?: ReadonlySet<string>
  selectedCoachEdgeId?: string | null
}) {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const geometry = useMemo(() => createRouteRibbonGeometry(points, 0.09, 0.025), [points])

  useEffect(() => () => { geometry?.dispose() }, [geometry])
  useFrame(() => {
    if (!group.current || !material.current) return
    const active = session.liveEpisode().agents.some(agent => agent.transit?.edgeId === edgeId)
    const coaching = coachEdgeIds?.has(edgeId) ?? false
    const target = active ? 0.95 : selectedCoachEdgeId === edgeId ? 0.9 : coaching ? 0.55 : 0.035
    if (Math.abs(material.current.opacity - target) > 0.01) material.current.opacity = target
  })
  if (!geometry) return null
  return (
    <group ref={group} visible>
      <mesh geometry={geometry} renderOrder={2}>
        <meshBasicMaterial ref={material} color={selectedCoachEdgeId === edgeId ? '#7fb069' : color} transparent opacity={0.035} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

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

function CoachChoiceRibbon({ points, edgeId, selected, onPick }: {
  points: ArenaPosition[]
  edgeId: string
  selected: boolean
  onPick: (edgeId: string) => void
}) {
  const geometry = useMemo(() => createRouteRibbonGeometry(points, 0.2, 0.045), [points])
  const hitGeometry = useMemo(() => createRouteRibbonGeometry(points, 0.55, 0.05), [points])
  const gl = useThree(state => state.gl)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hoverCursor = useRef<string | null>(null)
  useEffect(() => () => { geometry?.dispose(); hitGeometry?.dispose() }, [geometry, hitGeometry])
  useEffect(() => {
    canvasRef.current = gl.domElement
    return () => {
      if (hoverCursor.current !== null && canvasRef.current) {
        canvasRef.current.style.cursor = hoverCursor.current
        hoverCursor.current = null
      }
    }
  }, [gl])
  if (!geometry || !hitGeometry) return null
  return (
    <group>
      {selected && (
        <mesh geometry={geometry} renderOrder={4}>
          <meshBasicMaterial color="#7fb069" transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Faint underlay so a pickable route is visibly pickable. The hit mesh
          below is invisible, which reads as "nothing there" on touch where
          there is no hover cursor to discover it. */}
      <mesh geometry={geometry} renderOrder={3}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.14} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        geometry={hitGeometry}
        renderOrder={4}
        onClick={event => { event.stopPropagation(); onPick(edgeId) }}
        onPointerOver={event => {
          event.stopPropagation()
          const canvas = canvasRef.current
          if (!canvas) return
          if (hoverCursor.current === null) hoverCursor.current = canvas.style.cursor
          canvas.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          const canvas = canvasRef.current
          if (canvas && hoverCursor.current !== null) {
            canvas.style.cursor = hoverCursor.current
            hoverCursor.current = null
          }
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function CoachTrailLayer({ course, coachOriginalEdgeId, coachChoices, selectedCoachEdgeId, onCoachEdge }: {
  course: ArenaCourse
  coachOriginalEdgeId?: string | null
  coachChoices?: { edgeId: string }[]
  selectedCoachEdgeId?: string | null
  onCoachEdge?: (edgeId: string) => void
}) {
  const original = coachOriginalEdgeId ? course.scenario.edges.find(candidate => candidate.id === coachOriginalEdgeId) : undefined
  return (
    <group>
      {original?.path && <CoachGhostRibbon points={original.path} color="#ffd57a" />}
      {onCoachEdge && coachChoices?.map(choice => {
        const edge = course.scenario.edges.find(candidate => candidate.id === choice.edgeId)
        if (!edge?.path) return null
        return (
          <CoachChoiceRibbon
            key={edge.id}
            edgeId={edge.id}
            points={edge.path}
            selected={selectedCoachEdgeId === edge.id}
            onPick={onCoachEdge}
          />
        )
      })}
    </group>
  )
}


function ChampionFloodMarker({ session, name }: { session: ArenaSession; name: string }) {
  const group = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3())
  const rot = useRef(new THREE.Quaternion())
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.font = '600 30px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#0d3a4a'
    ctx.fillText(name, 128, 34)
    const made = new THREE.CanvasTexture(canvas)
    made.anisotropy = 2
    return made
  }, [name])
  useEffect(() => () => { texture?.dispose() }, [texture])
  const diamond = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!group.current) return
    const episode = session.liveEpisode()
    const agent = episode.agents.find(candidate => candidate.id === 'champion')
    if (!agent || !episode.weather.flooded) {
      group.current.visible = false
      return
    }
    group.current.visible = true
    if (sampleInterpolatedPose(session, 'champion', state.clock.elapsedTime, pos.current, rot.current)) {
      group.current.position.set(pos.current.x, pos.current.y + 1.15, pos.current.z)
    }
    if (diamond.current) diamond.current.rotation.y = state.clock.elapsedTime * 1.2
  })
  return (
    <group ref={group} visible={false} renderOrder={30}>
      <mesh ref={diamond} renderOrder={30}>
        <octahedronGeometry args={[0.16]} />
        <meshBasicMaterial color="#4eb4d0" transparent opacity={0.95} depthTest={false} depthWrite={false} />
      </mesh>
      {texture && (
        <sprite position={[0, 0.42, 0]} scale={[1.4, 0.35, 1]} renderOrder={31}>
          <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
        </sprite>
      )}
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
        <group position={championBase}>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.95, 40]} />
            <meshStandardMaterial color="#9ccc63" emissive="#4d7a28" emissiveIntensity={0.35} transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.55, 0.62, 32]} />
            <meshBasicMaterial color="#d2efad" transparent opacity={0.7} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.5, -0.7]} castShadow>
            <cylinderGeometry args={[0.03, 0.05, 1, 6]} />
            <meshStandardMaterial color="#4d5c48" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0, 1.04, -0.7]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshBasicMaterial color="#d2efad" />
          </mesh>
        </group>
      )}
      {rivalBase && (
        <group position={rivalBase}>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.95, 40]} />
            <meshStandardMaterial color="#efad68" emissive="#8a5520" emissiveIntensity={0.35} transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.55, 0.62, 32]} />
            <meshBasicMaterial color="#f4c98a" transparent opacity={0.7} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.5, -0.7]} castShadow>
            <cylinderGeometry args={[0.03, 0.05, 1, 6]} />
            <meshStandardMaterial color="#5c4a38" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0, 1.04, -0.7]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshBasicMaterial color="#f4c98a" />
          </mesh>
        </group>
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

function BasinSky() {
  return (
    <mesh scale={95} renderOrder={-100}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        vertexShader={`varying vec3 vDirection;
          void main() {
            vDirection = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`}
        fragmentShader={`varying vec3 vDirection;
          void main() {
            float elevation = clamp(vDirection.y * 0.7 + 0.26, 0.0, 1.0);
            vec3 horizon = vec3(0.83, 0.73, 0.59);
            vec3 zenith = vec3(0.43, 0.62, 0.74);
            vec3 sky = mix(horizon, zenith, smoothstep(0.0, 1.0, elevation));
            gl_FragColor = vec4(sky, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`}
      />
    </mesh>
  )
}

function BasinSun({ course, lite }: { course: ArenaCourse; lite: boolean }) {
  const { scene } = useThree()
  const target = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    target.position.set(...course.center)
    scene.add(target)
    return () => { scene.remove(target) }
  }, [course, scene, target])
  return (
    <directionalLight
      target={target}
      position={[course.center[0] - 11, course.center[1] + 13, course.center[2] - 8]}
      intensity={2.8}
      color="#ffe1ad"
      castShadow={!lite}
      shadow-mapSize-width={lite ? 512 : 2048}
      shadow-mapSize-height={lite ? 512 : 2048}
      shadow-camera-left={-15}
      shadow-camera-right={15}
      shadow-camera-top={15}
      shadow-camera-bottom={-15}
      shadow-camera-near={1}
      shadow-camera-far={50}
      shadow-bias={-0.0002}
    />
  )
}

function World({
  course,
  session,
  follow,
  cinematic = false,
  coachOriginalEdgeId,
  coachChoices,
  selectedCoachEdgeId,
  onCoachEdge,
  ghostPose,
  championName = 'You',
  chassisByEntrant,
  forgedLook,
  championAccent = '#bce478',
  fxCue,
  onReady,
  onError,
  lite,
}: WorldProps & { lite: boolean }) {
  // Mesh terrain is the same authored GLB the collider extracts from, so the
  // scene needs no splat layer or fallback mesh.
  const [terrainReady, setTerrainReady] = useState(false)
  const coachEdgeIds = useMemo(
    () => (onCoachEdge && coachChoices?.length ? new Set(coachChoices.map(choice => choice.edgeId)) : undefined),
    [onCoachEdge, coachChoices],
  )

  return (
    <>
      <EpisodeClock session={session} />
      <ReadyOnce ready={terrainReady} onReady={onReady} />
      <color attach="background" args={['#d4baa0']} />
      <BasinSky />
      <fog attach="fog" args={['#c7b19b', 43, 105]} />
      <hemisphereLight args={['#b5d5e0', '#9c7960', 0.85]} />
      <ambientLight intensity={0.18} />
      <BasinSun course={course} lite={lite} />
      <directionalLight position={[9, 7, 13]} color="#b0ccdc" intensity={0.35} />

      <TerrainMesh
        key={`${course.config.terrain.url}:${course.config.terrain.sha256}:${course.config.visual?.sha256 ?? ''}`}
        url={course.config.terrain.url}
        sha256={course.config.terrain.sha256}
        visual={course.config.visual}
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
        <FollowCamera course={course} session={session} follow={follow} ghostPose={ghostPose} />
      )}

      {course.scenario.edges.map(edge => (
        <PathRibbon
          key={edge.id}
          session={session}
          edgeId={edge.id}
          points={edge.path!}
          color={edge.floodable ? '#e29a45' : '#4f9d86'}
          coachEdgeIds={coachEdgeIds}
          selectedCoachEdgeId={selectedCoachEdgeId}
        />
      ))}

      <CourseLandmarks course={course} />
      <CoachTrailLayer
        course={course}
        coachOriginalEdgeId={coachOriginalEdgeId}
        coachChoices={coachChoices}
        selectedCoachEdgeId={selectedCoachEdgeId}
        onCoachEdge={onCoachEdge}
      />
      <ChampionFloodMarker session={session} name={championName} />
      {ghostPose && <PracticeGhost agent={ghostPose.agent} label={ghostPose.label} accent={ghostPose.accent} />}
      <BankBursts session={session} course={course} lite={lite} />

      {course.scenario.entrants.map(entrant => {
        const position = course.scenario.nodes.find(node => node.id === entrant.baseNode)!.position
        const color = entrant.id === 'champion' ? championAccent : '#efad68'
        return (
          <group key={entrant.id}>
            <mesh position={[position[0], position[1] + 0.05, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.62, 0.82, 40]} />
              <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.7} />
            </mesh>
            <Rover session={session} id={entrant.id} color={color} chassis={chassisByEntrant?.[entrant.id]} forged={entrant.id === 'champion' ? forgedLook : null} />
            <RoverStatus session={session} id={entrant.id} tint={color} />
            <VisionRing session={session} scenario={course.scenario} id={entrant.id} tint={color} />
            <RoverFX session={session} id={entrant.id} />
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
      <FloodWater course={course} session={session} />
      <FloodTelegraph course={course} session={session} />
      <WorldFX session={session} course={course} cue={fxCue ?? null} />
      <RushEventFX session={session} course={course} />
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
      // "percentage" = PCFShadowMap explicitly: fiber maps bare `true` to
      // PCFSoftShadowMap, which three r186 removed (console warning + fallback).
      shadows={lite ? false : 'percentage'}
      camera={{ position: [16, 12, 16], fov: 42, near: 0.05, far: 180 }}
      dpr={lite ? [1, 1] : [1, 1.25]}
      // Simulation time advances in useFrame (EpisodeClock). "never" would
      // freeze rovers on coarse/narrow devices, so always pump frames and let
      // FrameLimiter cap the rate on lite hardware instead.
      frameloop="always"
      // preserveDrawingBuffer is required for the gift-card share capture
      // (canvas.toDataURL in ArenaScene.handleShareCard). Cost is one buffer
      // copy per frame — negligible next to the terrain draw.
      gl={{ antialias: !lite, alpha: false, powerPreference: lite ? 'low-power' : 'high-performance', preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.25
      }}
      fallback={<p role="alert">This device could not create a WebGL view.</p>}
    >
      {lite ? <FrameLimiter fps={30} /> : null}
      <ArenaEnvironment lite={lite} />
      <World {...props} lite={lite} />
    </Canvas>
  )
})
