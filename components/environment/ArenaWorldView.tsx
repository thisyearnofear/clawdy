'use client'

import { memo, Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ArenaCourse } from '../../services/arenaCourse'
import type { ArenaSession } from '../../services/arenaSession'
import type { ArenaPosition } from '../../services/arenaEpisode'
import { MarbleWorldLayer } from './MarbleWorldLayer'
import { MintModel } from './MintModel'
import { getMintAsset, getMintModelArtifact, getMintModelTransform, getMintModelUrl } from '../../services/mintAssets'

export type ArenaCamera = 'overview' | 'champion' | 'rival'

type WorldProps = {
  course: ArenaCourse
  session: ArenaSession
  follow: ArenaCamera
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
    camera.position.set(course.center[0] + 11, course.center[1] + 14, course.center[2] + 14)
    camera.lookAt(...course.center)
  }, [camera, course, follow])
  useFrame((_, delta) => {
    if (follow === 'overview') return
    const agent = session.getSnapshot().episode.agents.find(candidate => candidate.id === follow)
    if (!agent) return
    desired.current.set(agent.position[0] + 3.5, agent.position[1] + 4.5, agent.position[2] + 5)
    lookAt.current.set(agent.position[0], agent.position[1] + 0.3, agent.position[2])
    camera.position.lerp(desired.current, 1 - Math.exp(-delta * 5))
    camera.lookAt(lookAt.current)
  })
  return null
}

/**
 * Loads the collider GLB and renders it as a semi-transparent overlay so players
 * can see the drivable surface that the physics engine uses.
 */
function ColliderOverlay({ url }: { url: string }) {
  const [scene, setScene] = useState<THREE.Group | null>(null)
  useEffect(() => {
    let cancelled = false
    new GLTFLoader().load(url, (gltf) => {
      if (cancelled) return
      // Make all materials semi-transparent so the splat is visible underneath
      gltf.scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return
        const mat = obj.material
        if (Array.isArray(mat)) {
          for (const m of mat) {
            m.transparent = true
            m.opacity = 0.15
            m.depthWrite = false
            m.color = new THREE.Color('#7ec8a0')
          }
        } else if (mat) {
          mat.transparent = true
          mat.opacity = 0.15
          mat.depthWrite = false
          mat.color = new THREE.Color('#7ec8a0')
        }
      })
      setScene(gltf.scene)
    }, undefined, (err) => {
      if (!cancelled) console.warn('[ColliderOverlay] Failed to load collider:', err)
    })
    return () => { cancelled = true }
  }, [url])

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
 * Contact shadow that sits flat on the ground under the rover.
 * Follows the rover's x/z position and snaps to the ground y.
 */
function RoverShadow({ session, id }: { session: ArenaSession; id: string }) {
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!meshRef.current) return
    const agent = session.getSnapshot().episode.agents.find(candidate => candidate.id === id)
    if (!agent) return
    const ground = session.sampleGround([agent.position[0], agent.position[1] + 2, agent.position[2]])
    const y = ground ? ground.point[1] + 0.02 : agent.position[1] + 0.02
    meshRef.current.position.set(agent.position[0], y, agent.position[2])
  })
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.38, 24]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.25} depthWrite={false} />
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

    // Apply physics rotation (quaternion) directly from the chassis
    if (agent.rotation) {
      targetRot.current.set(agent.rotation[0], agent.rotation[1], agent.rotation[2], agent.rotation[3])
    }

    // Position: snap on reset/teleport, lerp during running
    if (view.phase !== 'running' || view.episode.tick < lastTick.current || lastTick.current < 0) {
      group.current.position.copy(target.current)
      group.current.quaternion.copy(targetRot.current)
    } else {
      group.current.position.lerp(target.current, 1 - Math.exp(-delta * 40))
      group.current.quaternion.slerp(targetRot.current, 1 - Math.exp(-delta * 30))
    }

    // Wheel rotation: spin wheels based on movement speed
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

  return (
    <>
      <RoverShadow session={session} id={id} />
      <group ref={group}>
        {modelUrl ? (
          <Suspense fallback={<RoverGeometry color={color} wheelRefs={wheelRefs} />}>
            <MintModel url={modelUrl} transform={transform} />
          </Suspense>
        ) : (
          <RoverGeometry color={color} wheelRefs={wheelRefs} />
        )}
      </group>
    </>
  )
}

function Resource({ session, id, position }: { session: ArenaSession; id: string; position: ArenaPosition }) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!group.current) return
    group.current.visible = session.getSnapshot().episode.resources.some(resource => resource.id === id && resource.collectedBy === null)
    group.current.rotation.y += delta * 0.5
  })
  return (
    <group ref={group} position={position}>
      <mesh>
        <octahedronGeometry args={[0.11]} />
        <meshStandardMaterial color="#f4dd85" emissive="#7c5520" emissiveIntensity={0.2} metalness={0.5} roughness={0.25} />
      </mesh>
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
        <mesh key={index} position={zone.position} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={zone.size} />
          <meshStandardMaterial color="#72b8cc" emissive="#175566" emissiveIntensity={0.3} transparent opacity={0.65} roughness={0.25} metalness={0.2} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function World({ course, session, follow, onReady, onError }: WorldProps) {
  return (
    <>
      <EpisodeClock session={session} />
      <color attach="background" args={['#c7d3ce']} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[8, 16, 4]} intensity={2} castShadow />
      <MarbleWorldLayer config={course.config} onLoad={onReady} onError={onError} />
      {/* Semi-transparent collider overlay so players can see the drivable surface */}
      <Suspense fallback={null}>
        <ColliderOverlay url={course.config.collider!.url} />
      </Suspense>
      <OrbitControls makeDefault target={course.center} enabled={follow === 'overview'} minDistance={5} maxDistance={35} maxPolarAngle={Math.PI * 0.47} />
      <FollowCamera course={course} session={session} follow={follow} />
      {course.scenario.edges.map(edge => (
        <Line key={edge.id} points={edge.path!.map(point => [point[0], point[1] + 0.055, point[2]] as ArenaPosition)} color={edge.floodable ? '#d9904a' : '#438b79'} lineWidth={2} transparent opacity={0.8} />
      ))}
      {course.scenario.entrants.map(entrant => {
        const position = course.scenario.nodes.find(node => node.id === entrant.baseNode)!.position
        const color = entrant.id === 'champion' ? '#bce478' : '#efad68'
        return (
          <group key={entrant.id}>
            <mesh position={[position[0], position[1] + 0.04, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.55, 0.7, 40]} />
              <meshBasicMaterial color={color} side={THREE.DoubleSide} />
            </mesh>
            <Rover session={session} id={entrant.id} color={color} />
          </group>
        )
      })}
      {course.scenario.resources.map((resource, index) => {
        const node = course.scenario.nodes.find(candidate => candidate.id === resource.nodeId)!
        const angle = index * Math.PI / 2
        const position: ArenaPosition = [node.position[0] + Math.cos(angle) * 0.42, node.position[1] + 0.6 + Math.floor(index / 4) * 0.22, node.position[2] + Math.sin(angle) * 0.42]
        return <Resource key={resource.id} session={session} id={resource.id} position={position} />
      })}
      <Flood course={course} session={session} />
    </>
  )
}

export default memo(function ArenaWorldView(props: WorldProps) {
  return (
    <Canvas shadows camera={{ position: [18, 15, 18], fov: 45, near: 0.05, far: 180 }} dpr={[1, 1.5]} gl={{ antialias: false, alpha: false }} fallback={<p role="alert">This device could not create a WebGL view.</p>}>
      <World {...props} />
    </Canvas>
  )
})
