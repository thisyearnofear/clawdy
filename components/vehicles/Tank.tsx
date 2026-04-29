'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, useRapier } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../../services/AgentProtocol'
import { useVehiclePhysics, VehicleStats } from '../../hooks/useVehiclePhysics'
import { WaterTurnSplashes } from '../environment/WaterTurnSplashes'
import { GhostVehicleShell } from './GhostVehicleShell'

export const TANK_STATS: VehicleStats = {
  profile: 'tank',
  maxSpeed: 35,
  acceleration: 250,
  steerStrength: 12,
  mass: 6,
  lateralGrip: 1.0,
  frontOffset: 0,
  backOffset: 0,
  steeringMode: 'tank',
  steerRetention: 0.6
}

function TankArmorPulse({ isGhost = false }: { isGhost?: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((state) => {
    if (isGhost) return
    if (meshRef.current && matRef.current) {
      const t = state.clock.getElapsedTime()
      matRef.current.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.3
      matRef.current.opacity = 0.15 + Math.sin(t * 2) * 0.1
      meshRef.current.scale.setScalar(1.05 + Math.sin(t * 2) * 0.03)
    }
  })

  if (isGhost) return null

  return (
    <mesh ref={meshRef} position={[0, 0.1, 0]}>
      <boxGeometry args={[2.7, 1.2, 4.2]} />
      <meshStandardMaterial
        ref={matRef}
        color="#4b5320"
        emissive="#88aa44"
        emissiveIntensity={0}
        transparent
        opacity={0.3}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

const createLaserMaterial = () => new THREE.MeshStandardMaterial({
  transparent: true,
  depthWrite: false,
  emissive: new THREE.Color('#ff0000'),
  emissiveIntensity: 2.0,
  color: '#ff0000',
})

export function Tank({ 
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
    return <GhostVehicleShell position={position} bodyColor="#d2e3c8" />
  }

  return (
    <ActiveTank
      id={id}
      position={position}
      agentControlled={agentControlled}
      playerControlled={playerControlled}
      onRef={onRef}
    />
  )
}

function ActiveTank({
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
  const turretRef = useRef<THREE.Group>(null)
  const laserRef = useRef<THREE.Mesh>(null)
  const rapier = useRapier()
  
  const { inputs } = useVehiclePhysics(id, chassisRef, TANK_STATS, agentControlled, playerControlled, true)
  
  const [muzzleFlash, setMuzzleFlash] = useState(false)
  const lastFireTime = useRef(0)
  const laserMaterial = useMemo(() => createLaserMaterial(), [])

  useEffect(() => {
    if (!onRef) return
    onRef(chassisRef.current)
    return () => onRef(null)
  }, [onRef])

  useFrame((state) => {
    if (!chassisRef.current || isGhost) return
    const time = state.clock.getElapsedTime()
    const { action, aim } = inputs

    const rotation = chassisRef.current.rotation()
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion)
    const chassisTranslation = chassisRef.current.translation()
    const translation = new THREE.Vector3(chassisTranslation.x, chassisTranslation.y, chassisTranslation.z)
    const barrelOffset = new THREE.Vector3(0, 0.7, -2.2).applyMatrix4(matrix)
    const barrelPos = translation.clone().add(barrelOffset)
    const barrelDir = new THREE.Vector3(0, 0, -1).applyMatrix4(matrix)

    const ray = new rapier.rapier.Ray(barrelPos, barrelDir)
    const hit = rapier.world.castRay(ray, 100, true)

    if (laserRef.current) {
      const laserLen = hit ? hit.timeOfImpact : 100
      laserRef.current.scale.y = laserLen
      laserRef.current.position.set(0, 0, -1.2 - laserLen / 2)
    }

    if (action && time - lastFireTime.current > 0.5) {
      setMuzzleFlash(true)
      setTimeout(() => setMuzzleFlash(false), 50)
      lastFireTime.current = time

      if (hit) {
        agentProtocol.processCombatEvent({
          agentId: agentControlled ? id : 'Player',
          type: 'fire',
          hitPoint: [barrelPos.x + barrelDir.x * hit.timeOfImpact, barrelPos.y + barrelDir.y * hit.timeOfImpact, barrelPos.z + barrelDir.z * hit.timeOfImpact]
        })
      }
    }

    if (turretRef.current && agentControlled) {
      turretRef.current.rotation.y = THREE.MathUtils.lerp(turretRef.current.rotation.y, aim, 0.1)
    }
  })

  const materialProps = isGhost ? {
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    color: "#ffffff"
  } : {
    color: "#4b5320"
  }

  return (
    <group>
      <RigidBody 
        ref={chassisRef} 
        position={position} 
        colliders="cuboid" 
        mass={TANK_STATS.mass}
        restitution={0.1}
        friction={1.0}
        linearDamping={0.5}
        angularDamping={0.9}
        type="dynamic"
        userData={{ agentId: agentControlled ? id : undefined, isPlayer: !agentControlled, isGhost: false }}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.5, 1, 4]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
        
        <group ref={turretRef} position={[0, 0.7, 0]}>
          <mesh>
            <boxGeometry args={[1.5, 0.6, 1.5]} />
            <meshStandardMaterial {...materialProps} color={isGhost ? "#ffffff" : "#353c16"} />
          </mesh>
          <mesh position={[0, 0, -1.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 2, 8]} />
            <meshStandardMaterial {...materialProps} color={isGhost ? "#ffffff" : "#1e210b"} />
          </mesh>
          
        <TankArmorPulse isGhost={isGhost} />

          {!isGhost && (
            <mesh ref={laserRef} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
              <primitive object={laserMaterial} />
            </mesh>
          )}

          {muzzleFlash && !isGhost && (
            <mesh position={[0, 0, -2.2]}>
              <sphereGeometry args={[0.4, 8, 8]} />
              <meshBasicMaterial color="#f1c40f" transparent opacity={0.8} />
            </mesh>
          )}
        </group>

        <mesh position={[-1.3, -0.2, 0]}>
          <boxGeometry args={[0.6, 0.8, 4.2]} />
          <meshStandardMaterial {...materialProps} color={isGhost ? "#ffffff" : "#1a1a1a"} />
        </mesh>
        <mesh position={[1.3, -0.2, 0]}>
          <boxGeometry args={[0.6, 0.8, 4.2]} />
          <meshStandardMaterial {...materialProps} color={isGhost ? "#ffffff" : "#1a1a1a"} />
        </mesh>
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
