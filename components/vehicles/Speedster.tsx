'use client'

import * as THREE from 'three'
import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { RigidBody } from '@react-three/rapier'
import { useVehiclePhysics, VehicleStats } from '../../hooks/useVehiclePhysics'
import { WaterTurnSplashes } from '../environment/WaterTurnSplashes'
import { GhostVehicleShell } from './GhostVehicleShell'

const SPEEDSTER_STATS: VehicleStats = {
  profile: 'speedster',
  maxSpeed: 85,
  acceleration: 800,
  steerStrength: 120,
  mass: 1.5,
  lateralGrip: 0.9,
  frontOffset: 1.8,
  backOffset: -1.8,
  steeringMode: 'car'
}

function SpeedsterUnderglow({ isGhost = false }: { isGhost?: boolean }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((state) => {
    if (isGhost || !matRef.current) return
    const t = state.clock.getElapsedTime()
    matRef.current.emissiveIntensity = 1.0 + Math.sin(t * 4) * 0.8
    matRef.current.opacity = 0.25 + Math.sin(t * 4) * 0.15
  })

  if (isGhost) return null

  return (
    <mesh position={[0, -0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[2.2, 4.5]} />
      <meshStandardMaterial
        ref={matRef}
        color="#00d2d3"
        emissive="#00d2d3"
        emissiveIntensity={1.5}
        transparent
        opacity={0.4}
        depthWrite={false}
      />
    </mesh>
  )
}

export function Speedster({ 
  id, 
  position = [0, 5, 0], 
  agentControlled = false, 
  playerControlled = true,
  isGhost = false,
  onRef
}: { 
  id: string, 
  position?: [number, number, number], 
  agentControlled?: boolean, 
  playerControlled?: boolean,
  isGhost?: boolean,
  onRef?: (ref: RapierRigidBody | null) => void
}) {
  if (isGhost) {
    return <GhostVehicleShell position={position} bodyColor="#cfefff" />
  }

  return (
    <ActiveSpeedster
      id={id}
      position={position}
      agentControlled={agentControlled}
      playerControlled={playerControlled}
      onRef={onRef}
    />
  )
}

function ActiveSpeedster({
  id,
  position,
  agentControlled,
  playerControlled,
  isGhost = false,
  onRef,
}: {
  id: string
  position: [number, number, number]
  agentControlled: boolean
  playerControlled: boolean
  isGhost?: boolean
  onRef?: (ref: RapierRigidBody | null) => void
}) {
  const chassisRef = useRef<RapierRigidBody>(null)
  const wheelsRef = useRef<THREE.Group[]>([])
  
  const { inputs } = useVehiclePhysics(id, chassisRef, SPEEDSTER_STATS, agentControlled, playerControlled, true)

  useEffect(() => {
    if (!onRef) return
    onRef(chassisRef.current)
    return () => onRef(null)
  }, [onRef])

  useFrame(() => {
    if (isGhost) return
    // Visual Steering for front wheels
    wheelsRef.current.forEach((wheel, i) => {
      if (wheel && i < 2) { // Front wheels
        wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, inputs.turn * 0.6, 0.1)
      }
    })
  })

  return (
    <group>
      <RigidBody 
        ref={chassisRef} 
        position={position} 
        colliders="cuboid" 
        mass={SPEEDSTER_STATS.mass}
        restitution={0.1}
        friction={0.9}
        linearDamping={0.4}
        angularDamping={0.8}
        ccd={true}
        type="dynamic"
        userData={{ agentId: agentControlled ? id : undefined, isPlayer: !agentControlled, isGhost: false }}
      >
        {/* Main Body */}
        <mesh castShadow>
          <boxGeometry args={[1.8, 0.35, 4.2]} />
          <meshStandardMaterial color="#0984e3" metalness={0.9} roughness={0.1} />
        </mesh>
        
        {/* Tapered front nose */}
        <mesh position={[0, -0.05, -2.3]} rotation={[Math.PI / 2, 0, Math.PI / 4]} castShadow>
          <coneGeometry args={[0.9, 0.8, 4]} />
          <meshStandardMaterial color="#0984e3" metalness={0.9} roughness={0.1} />
        </mesh>
        
        {/* Cockpit canopy */}
        <mesh position={[0, 0.5, 0.2]} castShadow>
          <boxGeometry args={[1.4, 0.4, 1.8]} />
          <meshStandardMaterial color="#0984e3" metalness={0.7} />
        </mesh>
        
        {/* Windshield */}
        <mesh position={[0, 0.45, -0.7]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[1.3, 0.5, 0.05]} />
          <meshStandardMaterial color="#2c3e50" transparent opacity={0.7} metalness={0.95} roughness={0.1} />
        </mesh>
        
        {/* Side windows */}
        <mesh position={[-0.71, 0.5, 0.2]}>
          <boxGeometry args={[0.02, 0.3, 1.4]} />
          <meshStandardMaterial color="#2c3e50" transparent opacity={0.6} metalness={0.9} />
        </mesh>
        <mesh position={[0.71, 0.5, 0.2]}>
          <boxGeometry args={[0.02, 0.3, 1.4]} />
          <meshStandardMaterial color="#2c3e50" transparent opacity={0.6} metalness={0.9} />
        </mesh>
        
        {/* Rear deck */}
        <mesh position={[0, 0.25, 1.4]} rotation={[0.3, 0, 0]} castShadow>
          <boxGeometry args={[1.6, 0.1, 1.2]} />
          <meshStandardMaterial color="#0984e3" metalness={0.9} />
        </mesh>
        
        {/* LARGE REAR SPOILER */}
        <group position={[0, 0.9, 1.8]}>
          <mesh castShadow>
            <boxGeometry args={[2.2, 0.08, 0.5]} />
            <meshStandardMaterial color="#2c3e50" />
          </mesh>
          <mesh position={[-1.1, 0, 0]} castShadow>
            <boxGeometry args={[0.1, 0.4, 0.6]} />
            <meshStandardMaterial color="#2c3e50" />
          </mesh>
          <mesh position={[1.1, 0, 0]} castShadow>
            <boxGeometry args={[0.1, 0.4, 0.6]} />
            <meshStandardMaterial color="#2c3e50" />
          </mesh>
          <mesh position={[-0.6, -0.35, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.7, 8]} />
            <meshStandardMaterial color="#2c3e50" metalness={0.8} />
          </mesh>
          <mesh position={[0.6, -0.35, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.7, 8]} />
            <meshStandardMaterial color="#2c3e50" metalness={0.8} />
          </mesh>
        </group>
        
        <>
          <mesh position={[-0.6, 0.05, -2.05]}>
            <boxGeometry args={[0.35, 0.12, 0.05]} />
            <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1} />
          </mesh>
          <mesh position={[0.6, 0.05, -2.05]}>
            <boxGeometry args={[0.35, 0.12, 0.05]} />
            <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1} />
          </mesh>
          <mesh position={[0, 0.02, -2.06]}>
            <boxGeometry args={[1.4, 0.04, 0.03]} />
            <meshStandardMaterial color="#00d2d3" emissive="#00d2d3" emissiveIntensity={0.8} />
          </mesh>
        </>
        
        <SpeedsterUnderglow />
        
        <mesh position={[0, -0.15, 2.15]} castShadow>
          <boxGeometry args={[1.4, 0.15, 0.3]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>
        
        <>
          <mesh position={[-0.6, 0.15, 2.12]}>
            <boxGeometry args={[0.4, 0.1, 0.05]} />
            <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0.6, 0.15, 2.12]}>
            <boxGeometry args={[0.4, 0.1, 0.05]} />
            <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.8} />
          </mesh>
        </>

        {/* WHEELS */}
        {[[-1, -0.15, -1.4], [1, -0.15, -1.4]].map((pos, i) => (
          <group key={i} position={pos as [number, number, number]} ref={el => { if (el) wheelsRef.current[i] = el }}>
             <mesh rotation={[0, 0, Math.PI / 2]} castShadow={!isGhost}>
                <cylinderGeometry args={[0.35, 0.35, 0.35, 16]} />
                <meshStandardMaterial color="#111" />
             </mesh>
             <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.22, 0.22, 0.36, 16]} />
                <meshStandardMaterial color="#bdc3c7" metalness={0.9} roughness={0.2} />
             </mesh>
           </group>
        ))}
        
        {[[-1.05, -0.15, 1.4], [1.05, -0.15, 1.4]].map((pos, i) => (
           <group key={i} position={pos as [number, number, number]} ref={el => { if (el) wheelsRef.current[i + 2] = el }}>
             <mesh rotation={[0, 0, Math.PI / 2]} castShadow={!isGhost}>
                <cylinderGeometry args={[0.38, 0.38, 0.45, 16]} />
                <meshStandardMaterial color="#111" />
             </mesh>
             <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.24, 0.24, 0.46, 16]} />
                <meshStandardMaterial color="#bdc3c7" metalness={0.9} roughness={0.2} />
             </mesh>
           </group>
        ))}
      </RigidBody>

      <WaterTurnSplashes
        chassisRef={chassisRef}
        enabled={playerControlled && !agentControlled}
        turnInput={inputs.turn}
        brake={inputs.brake}
      />
    </group>
  )
}
