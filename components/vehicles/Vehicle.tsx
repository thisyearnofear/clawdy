'use client'

import { useRef, useEffect } from 'react'
import type { RapierRigidBody } from '@react-three/rapier'
import { RigidBody } from '@react-three/rapier'
import { useVehiclePhysics, VehicleStats } from '../../hooks/useVehiclePhysics'
import { WaterTurnSplashes } from '../environment/WaterTurnSplashes'
import { GhostVehicleShell } from './GhostVehicleShell'

export const VEHICLE_STATS: VehicleStats = {
  profile: 'vehicle',
  maxSpeed: 55,
  acceleration: 360,
  steerStrength: 40,
  mass: 2,
  lateralGrip: 0.7,
  frontOffset: 1.5,
  backOffset: -1.5,
  steeringMode: 'car',
  steerRetention: 1.0
}

export function Vehicle({ 
  id, 
  position = [0, 5, 0], 
  agentControlled = false, 
  playerControlled = true, 
  isGhost = false,
  isPractice = false,
  onRef 
}: { 
  id: string, 
  position?: [number, number, number], 
  agentControlled?: boolean, 
  playerControlled?: boolean, 
  isGhost?: boolean,
  isPractice?: boolean,
  onRef?: (ref: RapierRigidBody | null) => void 
}) {
  if (isGhost) {
    return <GhostVehicleShell position={position} />
  }

  return (
    <ActiveVehicle
      id={id}
      position={position}
      agentControlled={agentControlled}
      playerControlled={playerControlled}
      isPractice={isPractice}
      onRef={onRef}
    />
  )
}

function ActiveVehicle({
  id,
  position,
  agentControlled,
  playerControlled,
  isPractice = false,
  onRef,
}: {
  id: string
  position: [number, number, number]
  agentControlled: boolean
  playerControlled: boolean
  isPractice?: boolean
  onRef?: (ref: RapierRigidBody | null) => void
}) {
  const chassisRef = useRef<RapierRigidBody>(null)

  const { inputs } = useVehiclePhysics(id, chassisRef, VEHICLE_STATS, agentControlled, playerControlled, true)

  useEffect(() => {
    if (!onRef) return
    onRef(chassisRef.current)
    return () => onRef(null)
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
        type="dynamic"
        userData={{ agentId: agentControlled ? id : undefined, isPlayer: playerControlled && !isPractice, isGhost: false, isPractice }}
      >
        {/* Chassis - blue for player, red for agent */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2, 0.5, 4]} />
          <meshStandardMaterial 
            color={agentControlled ? "#ff7675" : "#74b9ff"} 
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>
        
        {/* Cabin */}
        <mesh position={[0, 0.5, 0]}>
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
