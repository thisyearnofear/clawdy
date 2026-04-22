'use client'

import * as THREE from 'three'
import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { RigidBody } from '@react-three/rapier'
import { useVehiclePhysics, VehicleStats } from '../../hooks/useVehiclePhysics'
import { WaterTurnSplashes } from '../environment/WaterTurnSplashes'
import { GhostVehicleShell } from './GhostVehicleShell'

const TRUCK_STATS: VehicleStats = {
  profile: 'monster',
  maxSpeed: 50,
  acceleration: 1000,
  steerStrength: 150,
  mass: 4,
  lateralGrip: 0.4,
  frontOffset: 1.5,
  backOffset: -1.5,
  steeringMode: 'car'
}

function TruckEngineGlow({ isGhost = false }: { isGhost?: boolean }) {
  const lightRef = useRef<THREE.PointLight>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((state) => {
    if (isGhost) return
    const t = state.clock.getElapsedTime()
    const flicker = 1.5 + Math.sin(t * 8) * 0.5 + Math.sin(t * 13) * 0.3
    if (lightRef.current) lightRef.current.intensity = flicker * 2
    if (matRef.current) {
      matRef.current.emissiveIntensity = flicker
      matRef.current.opacity = 0.3 + Math.sin(t * 8) * 0.15
    }
  })

  if (isGhost) return null

  return (
    <group position={[0, 1.2, 2]}>
      <pointLight ref={lightRef} color="#ff4400" intensity={3} distance={6} />
      <mesh>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshStandardMaterial
          ref={matRef}
          color="#ff6600"
          emissive="#ff4400"
          emissiveIntensity={2}
          transparent
          opacity={0.6}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export function MonsterTruck({ 
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
    return <GhostVehicleShell position={position} bodyColor="#f2d1c9" />
  }

  return (
    <ActiveMonsterTruck
      id={id}
      position={position}
      agentControlled={agentControlled}
      playerControlled={playerControlled}
      onRef={onRef}
    />
  )
}

function ActiveMonsterTruck({
  id,
  position,
  agentControlled,
  playerControlled,
  isGhost = false,
  onRef,
}: {
  id: string,
  position: [number, number, number],
  agentControlled: boolean,
  playerControlled: boolean,
  isGhost?: boolean,
  onRef?: (ref: RapierRigidBody | null) => void
}) {
  const chassisRef = useRef<RapierRigidBody>(null)
  const bodyRef = useRef<THREE.Group>(null)
  
  const { inputs } = useVehiclePhysics(id, chassisRef, TRUCK_STATS, agentControlled, playerControlled, true)

  useEffect(() => {
    if (!onRef) return
    onRef(chassisRef.current)
    return () => onRef(null)
  }, [onRef])

  useFrame((state) => {
    if (bodyRef.current && !isGhost) {
        const time = state.clock.getElapsedTime()
        bodyRef.current.position.y = 0.8 + Math.sin(time * 10) * (inputs.forward !== 0 ? 0.15 : 0.03)
        bodyRef.current.rotation.x = inputs.forward * -0.15
        bodyRef.current.rotation.z = inputs.turn * 0.15
    }
  })

  const materialProps = isGhost ? {
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    color: "#ffffff"
  } : {}

  return (
    <group>
      <RigidBody 
        ref={chassisRef} 
        position={position} 
        colliders="cuboid" 
        mass={TRUCK_STATS.mass}
        restitution={0.2}
        friction={1.0}
        linearDamping={0.4}
        angularDamping={0.6}
        ccd={true}
        type="dynamic"
        userData={{ agentId: agentControlled ? id : undefined, isPlayer: !agentControlled, isGhost: false }}
      >
        {/* MASSIVE Wheels */}
        {[[-1.8, -0.3, 1.8], [1.8, -0.3, 1.8], [-1.8, -0.3, -1.8], [1.8, -0.3, -1.8]].map((pos, i) => (
           <group key={i} position={pos as [number, number, number]}>
             <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[1.2, 1.2, 1, 16]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.9} {...materialProps} />
             </mesh>
             <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.6, 0.6, 1.05, 8]} />
                <meshStandardMaterial color="#c0392b" metalness={0.6} />
             </mesh>
             {[0, 1, 2, 3].map((j) => (
               <mesh key={j} rotation={[0, 0, Math.PI / 2]} position={[0, Math.cos(j * Math.PI / 2) * 1.1, Math.sin(j * Math.PI / 2) * 1.1]}>
                  <boxGeometry args={[0.3, 1.1, 0.4]} />
                  <meshStandardMaterial color="#0a0a0a" />
               </mesh>
             ))}
           </group>
        ))}

        {/* Suspension Struts */}
        {[[-1.8, 0.5, 1.8], [1.8, 0.5, 1.8], [-1.8, 0.5, -1.8], [1.8, 0.5, -1.8]].map((pos, i) => (
           <mesh key={i} position={pos as [number, number, number]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 1.2, 8]} />
              <meshStandardMaterial color="#f39c12" metalness={0.8} {...materialProps} />
           </mesh>
        ))}

        {/* Main Body */}
        <group ref={bodyRef}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[2.5, 0.4, 4]} />
            <meshStandardMaterial color="#2c3e50" metalness={0.4} {...materialProps} />
          </mesh>
          <mesh position={[0, 1.8, 0]} castShadow>
            <boxGeometry args={[2.2, 1.2, 3.5]} />
            <meshStandardMaterial color="#d63031" metalness={0.3} roughness={0.4} {...materialProps} />
          </mesh>
          <mesh position={[0, 2.4, -1.2]} castShadow>
            <boxGeometry args={[1.2, 0.4, 0.8]} />
            <meshStandardMaterial color="#c0392b" {...materialProps} />
          </mesh>
          <TruckEngineGlow isGhost={isGhost} />
          <mesh position={[0, 2, -0.8]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[2, 0.8, 0.1]} />
            <meshStandardMaterial color="#74b9ff" transparent opacity={0.4} metalness={0.9} />
          </mesh>
          <mesh position={[-1.11, 2, 0.2]}>
            <boxGeometry args={[0.05, 0.6, 1.5]} />
            <meshStandardMaterial color="#74b9ff" transparent opacity={0.4} />
          </mesh>
          <mesh position={[1.11, 2, 0.2]}>
            <boxGeometry args={[0.05, 0.6, 1.5]} />
            <meshStandardMaterial color="#74b9ff" transparent opacity={0.4} />
          </mesh>
          {[[-1, 2.8, 1], [1, 2.8, 1], [-1, 2.8, -1], [1, 2.8, -1]].map((pos, i) => (
             <mesh key={i} position={pos as [number, number, number]} castShadow>
                <cylinderGeometry args={[0.08, 0.08, 1.2, 8]} />
                <meshStandardMaterial color="#f39c12" metalness={0.8} {...materialProps} />
             </mesh>
          ))}
          <mesh position={[0, 3.4, 0]} castShadow>
            <boxGeometry args={[2, 0.1, 2.2]} />
            <meshStandardMaterial color="#d63031" {...materialProps} />
          </mesh>
          <mesh position={[0, 2.8, 1.8]} castShadow>
            <boxGeometry args={[2.4, 0.1, 0.6]} />
            <meshStandardMaterial color="#c0392b" {...materialProps} />
          </mesh>
          <mesh position={[-1, 2.4, 1.8]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.8, 8]} />
            <meshStandardMaterial color="#c0392b" {...materialProps} />
          </mesh>
          <mesh position={[1, 2.4, 1.8]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.8, 8]} />
            <meshStandardMaterial color="#c0392b" {...materialProps} />
          </mesh>
          <>
            <mesh position={[-0.8, 1.6, -1.76]}>
              <boxGeometry args={[0.4, 0.3, 0.1]} />
              <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.8} />
            </mesh>
            <mesh position={[0.8, 1.6, -1.76]}>
              <boxGeometry args={[0.4, 0.3, 0.1]} />
              <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.8} />
            </mesh>
            <mesh position={[0, 1.4, -1.76]}>
              <boxGeometry args={[1.6, 0.4, 0.05]} />
              <meshStandardMaterial color="#2c3e50" />
            </mesh>
          </>
        </group>
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
