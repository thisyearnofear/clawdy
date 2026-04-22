'use client'

import * as THREE from 'three'
import { useRef, useEffect } from 'react'
import type { RapierRigidBody } from '@react-three/rapier'
import { RigidBody } from '@react-three/rapier'
import { useVehiclePhysics, VehicleStats } from '../../hooks/useVehiclePhysics'
import { WaterTurnSplashes } from '../environment/WaterTurnSplashes'

const VEHICLE_STATS: VehicleStats = {
  profile: 'vehicle',
  maxSpeed: 55,
  acceleration: 600,
  steerStrength: 100,
  mass: 2,
  lateralGrip: 0.7,
  frontOffset: 1.5,
  backOffset: -1.5,
  steeringMode: 'car'
}

export function Vehicle({ 
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
  const chassisRef = useRef<RapierRigidBody>(null)
  
  const { inputs } = useVehiclePhysics(id, chassisRef, VEHICLE_STATS, agentControlled, playerControlled && !isGhost)

  useEffect(() => {
    if (onRef && chassisRef.current) {
      onRef(chassisRef.current)
    }
  }, [onRef])

  const materialProps = isGhost ? {
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  } : {}

  return (
    <group>
      <RigidBody 
        ref={chassisRef} 
        position={position} 
        colliders={isGhost ? false : "cuboid"} 
        mass={VEHICLE_STATS.mass}
        restitution={0.1}
        friction={0.8}
        linearDamping={0.05}
        angularDamping={0.6}
        ccd={true}
        type={isGhost ? "fixed" : "dynamic"}
        userData={{ agentId: agentControlled ? id : undefined, isPlayer: playerControlled, isGhost }}
      >
        {/* Chassis - blue for player, red for agent, white for ghost */}
        <mesh castShadow={!isGhost} receiveShadow={!isGhost}>
          <boxGeometry args={[2, 0.5, 4]} />
          <meshStandardMaterial 
            color={isGhost ? "#ffffff" : agentControlled ? "#ff7675" : "#74b9ff"} 
            metalness={isGhost ? 0 : 0.3}
            roughness={isGhost ? 1 : 0.4}
            {...materialProps}
          />
        </mesh>
        
        {/* Cabin */}
        <mesh position={[0, 0.5, 0]} castShadow={!isGhost}>
          <boxGeometry args={[1.5, 0.6, 2]} />
          <meshStandardMaterial color="#2d3436" transparent opacity={isGhost ? 0.1 : 0.7} />
        </mesh>
        
        {/* Wheels */}
        {[[-1, -0.3, 1.5], [1, -0.3, 1.5], [-1, -0.3, -1.5], [1, -0.3, -1.5]].map((pos, i) => (
           <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.5, 0.5, 0.4, 16]} />
              <meshStandardMaterial color={isGhost ? "#ffffff" : "#1e1e1e"} {...materialProps} />
           </mesh>
        ))}
        
        {/* Headlights */}
        {!isGhost && (
          <>
            <mesh position={[-0.6, 0, -2]}>
              <boxGeometry args={[0.3, 0.2, 0.1]} />
              <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.5} />
            </mesh>
            <mesh position={[0.6, 0, -2]}>
              <boxGeometry args={[0.3, 0.2, 0.1]} />
              <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.5} />
            </mesh>
          </>
        )}
      </RigidBody>

      {!isGhost && (
        <WaterTurnSplashes
          chassisRef={chassisRef}
          enabled={playerControlled && !agentControlled}
          turnInput={inputs.turn}
          brake={inputs.brake}
        />
      )}
    </group>
  )
}
