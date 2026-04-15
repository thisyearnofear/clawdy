'use client'

import * as THREE from 'three'
import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { RigidBody } from '@react-three/rapier'
import { useVehiclePhysics, VehicleStats } from '../../hooks/useVehiclePhysics'

const VEHICLE_STATS: VehicleStats = {
  maxSpeed: 45,
  acceleration: 400,
  steerStrength: 80,
  mass: 2,
  lateralGrip: 0.6,
  frontOffset: 1.5,
  backOffset: -1.5,
  steeringMode: 'car',
}

export function Vehicle({ 
  id, 
  position = [0, 5, 0], 
  agentControlled = false, 
  playerControlled = true, 
  onRef 
}: { 
  id: string, 
  position?: [number, number, number], 
  agentControlled?: boolean, 
  playerControlled?: boolean, 
  onRef?: (ref: RapierRigidBody | null) => void 
}) {
  const chassisRef = useRef<RapierRigidBody>(null)
  
  useVehiclePhysics(id, chassisRef, VEHICLE_STATS, agentControlled, playerControlled)

  useEffect(() => {
    if (onRef && chassisRef.current) {
      onRef(chassisRef.current)
    }
  }, [onRef])

  return (
    <group>
      <RigidBody 
        ref={chassisRef} 
        position={position} 
        colliders="cuboid" 
        mass={VEHICLE_STATS.mass}
        restitution={0.1}
        friction={0.8}
        linearDamping={0.05}
        angularDamping={0.6}
        ccd={true}
        userData={{ agentId: agentControlled ? id : undefined, isPlayer: playerControlled }}
      >
        {/* Chassis - blue for player, red for agent */}
        <mesh castShadow>
          <boxGeometry args={[2, 0.5, 4]} />
          <meshStandardMaterial 
            color={agentControlled ? "#ff7675" : "#74b9ff"} 
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>
        
        {/* Cabin */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[1.5, 0.6, 2]} />
          <meshStandardMaterial color="#2d3436" transparent opacity={0.7} />
        </mesh>
        
        {/* Wheels */}
        {[[-1, -0.3, 1.5], [1, -0.3, 1.5], [-1, -0.3, -1.5], [1, -0.3, -1.5]].map((pos, i) => (
           <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.5, 0.5, 0.4, 16]} />
              <meshStandardMaterial color="#1e1e1e" />
           </mesh>
        ))}
        
        {/* Headlights */}
        <mesh position={[-0.6, 0, -2]}>
          <boxGeometry args={[0.3, 0.2, 0.1]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0.6, 0, -2]}>
          <boxGeometry args={[0.3, 0.2, 0.1]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.5} />
        </mesh>
      </RigidBody>
    </group>
  )
}
