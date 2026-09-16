'use client'

import { memo, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ArenaCourse } from '../../services/arenaCourse'
import type { ArenaSession } from '../../services/arenaSession'
import type { ArenaPosition } from '../../services/arenaEpisode'
import { MarbleWorldLayer } from './MarbleWorldLayer'
import { MintModel } from './MintModel'
import FrameLimiter from '../utils/FrameLimiter'
import { getMintAsset, getMintModelArtifact, getMintModelTransform, getMintModelUrl } from '../../services/mintAssets'

export type ArenaCamera = 'overview' | 'champion' | 'rival'

type WorldProps = {
  course: ArenaCourse
  session: ArenaSession
  follow: ArenaCamera
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

/**
 * Primary terrain: HQ textured mesh, clipped to the playable volume so Marble
 * sky/background floaters do not dominate the frame.
 */
function HqTerrainMesh({
  url,
  clipBox,
  onReady,
  onError,
}: {
  url: string
  clipBox: { min: THREE.Vector3; max: THREE.Vector3 }
  onReady?: () => void
  onError?: (error: Error) => void
}) {
  const [scene, setScene] = useState<THREE.Group | null>(null)
  const { gl } = useThree()

  // R3F idiom: enable clipping before materials with clipping planes are constructed.
  // Mutating a WebGLRenderer property from a hook callback trips react-hooks/immutability;
  // this is the documented escape hatch for renderer configuration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    gl.localClippingEnabled = true
  }, [gl])

  useEffect(() => {
    let cancelled = false
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (cancelled) return
        const planes = [
          new THREE.Plane(new THREE.Vector3(1, 0, 0), -clipBox.min.x),
          new THREE.Plane(new THREE.Vector3(-1, 0, 0), clipBox.max.x),
          new THREE.Plane(new THREE.Vector3(0, 1, 0), -clipBox.min.y),
          new THREE.Plane(new THREE.Vector3(0, -1, 0), clipBox.max.y),
          new THREE.Plane(new THREE.Vector3(0, 0, 1), -clipBox.min.z),
          new THREE.Plane(new THREE.Vector3(0, 0, -1), clipBox.max.z),
        ]
        gltf.scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return
          obj.castShadow = false
          obj.receiveShadow = true
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const material of materials) {
            if (!material) continue
            material.side = THREE.FrontSide
            material.clippingPlanes = planes
            material.clipShadows = true
            if ('envMapIntensity' in material) material.envMapIntensity = 0.25
          }
        })
        setScene(gltf.scene)
        onReady?.()
      },
      undefined,
      (err) => {
        if (cancelled) return
        console.warn('[HqTerrainMesh] Failed to load HQ mesh:', err)
        onError?.(err instanceof Error ? err : new Error('Terrain mesh failed to load'))
      },
    )
    return () => { cancelled = true }
  }, [clipBox.max.x, clipBox.max.y, clipBox.max.z, clipBox.min.x, clipBox.min.y, clipBox.min.z, onError, onReady, url])

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

    if (view.phase !== 'running' || view.episode.tick < lastTick.current || lastTick.current < 0) {
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
        <meshStandardMaterial color="#ffe08a" emissive="#ff9b3a" emissiveIntensity={0.55} metalness={0.45} roughness={0.2} />
      </mesh>
      <mesh ref={outerRingRef} castShadow>
        <torusGeometry args={[0.22, 0.018, 12, 32]} />
        <meshStandardMaterial color="#ffb14d" emissive="#ff8c1a" emissiveIntensity={0.65} metalness={0.4} roughness={0.25} />
      </mesh>
      <mesh ref={innerRingRef} castShadow>
        <torusGeometry args={[0.18, 0.012, 10, 24]} />
        <meshStandardMaterial color="#ffe08a" emissive="#c98520" emissiveIntensity={0.55} metalness={0.45} roughness={0.2} />
      </mesh>
      <pointLight color="#ffcf6b" intensity={0.85} distance={2.6} decay={2} />
    </group>
  )
}

function PathRibbon({ points, color, width = 0.22 }: { points: ArenaPosition[]; color: string; width?: number }) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(point[0], point[1] + 0.04, point[2])))
    return new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), width / 2, 6, false)
  }, [points, width])

  useEffect(() => () => { geometry?.dispose() }, [geometry])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.28}
        transparent
        opacity={0.88}
        roughness={0.45}
        metalness={0.1}
        depthWrite={false}
      />
    </mesh>
  )
}

/**
 * Coach-time ghost ribbon. A translucent emissive stripe along the edge the
 * safe-baseline policy would have taken at the coach-selected frame. The
 * visual lives in the same Spark-rendered scene; the "tool synergy" claim
 * with World Labs / Spark is documented in the build log post rather than
 * encoded as the runtime class of the overlay.
 */
function CoachGhostRibbon({ points, color }: { points: ArenaPosition[]; color: string }) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(point[0], point[1] + 0.06, point[2])))
    return new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), 0.14, 8, false)
  }, [points])

  useEffect(() => () => { geometry?.dispose() }, [geometry])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} renderOrder={3}>
      <meshBasicMaterial color={color} transparent opacity={0.72} depthWrite={false} />
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
      {/* Central orientation spire */}
      <group position={[course.center[0], course.center[1], course.center[2]]}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.22, 3.2, 6]} />
          <meshStandardMaterial color="#9fd6ef" emissive="#3d7ea2" emissiveIntensity={0.4} metalness={0.55} roughness={0.2} />
        </mesh>
        <mesh position={[0, 3.35, 0]} castShadow>
          <octahedronGeometry args={[0.38]} />
          <meshStandardMaterial color="#e8fbff" emissive="#6eb8d8" emissiveIntensity={0.65} metalness={0.4} roughness={0.15} />
        </mesh>
        <pointLight color="#9ad7f0" intensity={1.1} distance={10} decay={2} position={[0, 2.8, 0]} />
      </group>

      {ridgeCenter && (
        <group position={ridgeCenter}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <boxGeometry args={[0.28, 1.8, 0.28]} />
            <meshStandardMaterial color="#3d4a52" emissive="#1f2a30" emissiveIntensity={0.15} metalness={0.3} roughness={0.55} />
          </mesh>
          <mesh position={[0, 1.95, 0]}>
            <boxGeometry args={[0.5, 0.12, 0.5]} />
            <meshStandardMaterial color="#5f8f7a" emissive="#2f5d48" emissiveIntensity={0.35} />
          </mesh>
        </group>
      )}

      {valleyCenter && (
        <group position={valleyCenter}>
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.28, 1.1, 8]} />
            <meshStandardMaterial color="#c4a16a" emissive="#6d4d24" emissiveIntensity={0.2} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.2, 0]}>
            <sphereGeometry args={[0.2, 12, 12]} />
            <meshStandardMaterial color="#f0c27a" emissive="#b8732a" emissiveIntensity={0.35} />
          </mesh>
        </group>
      )}

      {championBase && (
        <mesh position={[championBase[0], championBase[1] + 0.03, championBase[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.95, 40]} />
          <meshStandardMaterial color="#9ccc63" emissive="#4d7a28" emissiveIntensity={0.35} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
      {rivalBase && (
        <mesh position={[rivalBase[0], rivalBase[1] + 0.03, rivalBase[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.95, 40]} />
          <meshStandardMaterial color="#efad68" emissive="#8a5520" emissiveIntensity={0.35} transparent opacity={0.55} depthWrite={false} />
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

function World({ course, session, follow, coachSuggestion, onReady, onError, lite }: WorldProps & { lite: boolean }) {
  // Cloud-era Marble HQ mesh is full of sky floaters. Keep splat as the scene,
  // optionally layer a clipped mesh underlay, and rely on path/landmark overlays.
  const [splatReady, setSplatReady] = useState(false)
  const [meshFailed, setMeshFailed] = useState(false)
  const useClippedMesh = Boolean(course.config.hqMesh) && !lite && !meshFailed
  const clipBox = useMemo(() => {
    const xs = course.scenario.nodes.map(node => node.position[0])
    const ys = course.scenario.nodes.map(node => node.position[1])
    const zs = course.scenario.nodes.map(node => node.position[2])
    return {
      min: new THREE.Vector3(Math.min(...xs) - 3, Math.min(...ys) - 1.5, Math.min(...zs) - 3),
      max: new THREE.Vector3(Math.max(...xs) + 3, Math.max(...ys) + 4, Math.max(...zs) + 3),
    }
  }, [course.scenario.nodes])

  return (
    <>
      {lite && <FrameLimiter fps={30} />}
      <EpisodeClock session={session} />
      <ReadyOnce ready={splatReady} onReady={onReady} />
      <color attach="background" args={['#5d7278']} />
      <fog attach="fog" args={['#5d7278', 22, 55]} />
      <hemisphereLight args={['#d7e6ef', '#2f3b34', lite ? 0.9 : 0.65]} />
      <ambientLight intensity={lite ? 0.75 : 0.55} />
      <directionalLight
        position={[10, 18, 6]}
        intensity={lite ? 1.55 : 1.9}
        castShadow={!lite}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-8, 8, -4]} intensity={0.5} color="#b7d4ea" />

      {course.config.splat && (
        <MarbleWorldLayer
          config={course.config}
          lite={lite}
          visible
          onLoad={() => setSplatReady(true)}
          onError={onError}
        />
      )}

      {useClippedMesh && course.config.hqMesh && (
        <Suspense fallback={null}>
          <HqTerrainMesh
            url={course.config.hqMesh.url}
            clipBox={clipBox}
            onError={() => setMeshFailed(true)}
          />
        </Suspense>
      )}

      <OrbitControls makeDefault target={course.center} enabled={follow === 'overview'} minDistance={5} maxDistance={35} maxPolarAngle={Math.PI * 0.47} />
      <FollowCamera course={course} session={session} follow={follow} />

      {course.scenario.edges.map(edge => (
        <PathRibbon
          key={edge.id}
          points={edge.path!}
          color={edge.floodable ? '#e29a45' : '#4f9d86'}
          width={edge.floodable ? 0.26 : 0.3}
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
              <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.9} />
            </mesh>
            <Rover session={session} id={entrant.id} color={color} />
          </group>
        )
      })}
      {course.scenario.resources.map((resource, index) => {
        const node = course.scenario.nodes.find(candidate => candidate.id === resource.nodeId)!
        const angle = index * Math.PI / 2
        const position: ArenaPosition = [node.position[0] + Math.cos(angle) * 0.42, node.position[1] + 0.55 + Math.floor(index / 4) * 0.22, node.position[2] + Math.sin(angle) * 0.42]
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
      gl={{ antialias: false, alpha: false, powerPreference: lite ? 'low-power' : 'high-performance', preserveDrawingBuffer: true }}
      fallback={<p role="alert">This device could not create a WebGL view.</p>}
    >
      <World {...props} lite={lite} />
    </Canvas>
  )
})
