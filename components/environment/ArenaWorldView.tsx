'use client'

import { memo, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { ArenaCourse } from '../../services/arenaCourse'
import type { ArenaSession } from '../../services/arenaSession'
import type { ArenaPosition } from '../../services/arenaEpisode'
import { MarbleWorldLayer } from './MarbleWorldLayer'

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

function Rover({ session, id, color }: { session: ArenaSession; id: string; color: string }) {
  const group = useRef<THREE.Group>(null)
  const previous = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3())
  const lastTick = useRef(-1)
  useFrame((_, delta) => {
    if (!group.current) return
    const view = session.getSnapshot()
    const agent = view.episode.agents.find(candidate => candidate.id === id)
    if (!agent) return
    target.current.fromArray(agent.position)
    const dx = target.current.x - previous.current.x
    const dz = target.current.z - previous.current.z
    if (lastTick.current >= 0 && Math.hypot(dx, dz) > 0.001) group.current.rotation.y = Math.atan2(dx, dz)
    if (view.phase !== 'running' || view.episode.tick < lastTick.current || lastTick.current < 0) {
      group.current.position.copy(target.current)
    } else {
      group.current.position.lerp(target.current, 1 - Math.exp(-delta * 24))
    }
    previous.current.copy(target.current)
    lastTick.current = view.episode.tick
  })
  return (
    <group ref={group}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.34, 0.14, 0.45]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.32, -0.04]} castShadow>
        <boxGeometry args={[0.24, 0.12, 0.24]} />
        <meshStandardMaterial color="#17292d" roughness={0.2} metalness={0.6} />
      </mesh>
      {[-1, 1].flatMap(x => [-1, 1].map(z => (
        <mesh key={`${x}-${z}`} position={[x * 0.18, 0.105, z * 0.15]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.075, 12]} />
          <meshStandardMaterial color="#172124" roughness={0.8} />
        </mesh>
      )))}
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
    </group>
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
      <directionalLight position={[8, 16, 4]} intensity={2} />
      <MarbleWorldLayer config={course.config} onLoad={onReady} onError={onError} />
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
    <Canvas camera={{ position: [18, 15, 18], fov: 45, near: 0.05, far: 180 }} dpr={[1, 1.5]} gl={{ antialias: false, alpha: false }} fallback={<p role="alert">This device could not create a WebGL view.</p>}>
      <World {...props} />
    </Canvas>
  )
})
