'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, useRapier } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../../services/AgentProtocol'

function TankArmorPulse() {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((state) => {
    if (meshRef.current && matRef.current) {
      const t = state.clock.getElapsedTime()
      matRef.current.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.3
      matRef.current.opacity = 0.15 + Math.sin(t * 2) * 0.1
      meshRef.current.scale.setScalar(1.05 + Math.sin(t * 2) * 0.03)
    }
  })

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

// Standard Material for Tank
const createLaserMaterial = () => {
  const mat = new THREE.MeshStandardMaterial({
    transparent: true,
    depthWrite: false,
    emissive: new THREE.Color('#ff0000'),
    emissiveIntensity: 2.0,
    color: '#ff0000',
  })

  return mat
}

export function Tank({ 
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
  const turretRef = useRef<THREE.Group>(null)
  const laserRef = useRef<THREE.Mesh>(null)
  const rapier = useRapier()
  const [, getKeys] = useKeyboardControls()
  
  const [inputs, setInputs] = useState({ forward: 0, turn: 0, brake: false, aim: 0, action: false })
  const [muzzleFlash, setMuzzleFlash] = useState(false)
  const lastFireTime = useRef(0)

  const laserMaterial = useMemo(() => createLaserMaterial(), [])

  useEffect(() => {
    if (onRef && chassisRef.current) {
      onRef(chassisRef.current)
    }
  }, [onRef])

  useEffect(() => {
    if (agentControlled) {
      const unsubscribe = agentProtocol.subscribeToVehicle((cmd) => {
        if (cmd.vehicleId === id) {
          setInputs({
            forward: cmd.inputs.forward ?? 0,
            turn: cmd.inputs.turn ?? 0,
            brake: cmd.inputs.brake ?? false,
            aim: cmd.inputs.aim ?? 0,
            action: cmd.inputs.action ?? false,
          })
        }
      })
      return unsubscribe
    }
  }, [agentControlled, id])

  useFrame((state, delta) => {
    if (!chassisRef.current) return
    const time = state.clock.getElapsedTime()

    let { forward, turn, action, brake, aim } = inputs
    type Keys = Record<'forward' | 'backward' | 'left' | 'right' | 'jump', boolean>

    if (!agentControlled && playerControlled) {
      const keys = getKeys() as Keys
      forward = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
      turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
      brake = keys.jump
      action = !!keys.jump
      aim = 0
    }

    // Always update world state for all vehicles if they move
    const currentPos = chassisRef.current.translation()
    const currentRot = chassisRef.current.rotation()
    
    agentProtocol.updateWorldState({
      vehicles: agentProtocol.getWorldState().vehicles.map(v =>
        v.id === id ? {
          ...v,
          rotation: [currentRot.x, currentRot.y, currentRot.z, currentRot.w],
          position: [currentPos.x, currentPos.y, currentPos.z]
        } : v
      )
    })

    // Physics
    const rotation = chassisRef.current.rotation()
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion)

    const acceleration = 120 * delta

    if (forward !== 0) {
      const force = forwardDir.clone().multiplyScalar(forward * acceleration)
      chassisRef.current.applyImpulse({ x: force.x, y: 0, z: force.z }, true)
    }

    if (turn !== 0) {
      const turnRate = 1.0 * delta
      chassisRef.current.applyTorqueImpulse({ x: 0, y: turn * turnRate, z: 0 }, true)
    }

    // Firing & Laser
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

    // Stabilizer
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion)
    const targetUp = new THREE.Vector3(0, 1, 0)
    const stabilizeAxis = new THREE.Vector3().crossVectors(currentUp, targetUp)
    const stabilizeAngle = currentUp.angleTo(targetUp)

    if (stabilizeAngle > 0.05) {
      const stabilizeStrength = 100 * delta * stabilizeAngle
      chassisRef.current.applyTorqueImpulse({
        x: stabilizeAxis.x * stabilizeStrength,
        y: 0,
        z: stabilizeAxis.z * stabilizeStrength
      }, true)
    }

    if (turretRef.current && agentControlled) {
      turretRef.current.rotation.y = THREE.MathUtils.lerp(turretRef.current.rotation.y, aim, 0.1)
    }
  })

  return (
    <group>
      <RigidBody 
        ref={chassisRef} 
        position={position} 
        colliders="cuboid" 
        mass={5}
        restitution={0.1}
        friction={1.0}
        linearDamping={0.5}
        angularDamping={0.9}
        userData={{ agentId: agentControlled ? id : undefined, isPlayer: !agentControlled }}
      >
        <mesh castShadow>
          <boxGeometry args={[2.5, 1, 4]} />
          <meshStandardMaterial color="#4b5320" />
        </mesh>
        
        <group ref={turretRef} position={[0, 0.7, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.5, 0.6, 1.5]} />
            <meshStandardMaterial color="#353c16" />
          </mesh>
          <mesh position={[0, 0, -1.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 2, 8]} />
            <meshStandardMaterial color="#1e210b" />
          </mesh>
          
          {/* Armor energy pulse */}
          <TankArmorPulse />

          {/* Laser Sight */}
          <mesh ref={laserRef} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
            <primitive object={laserMaterial} />
          </mesh>

          {muzzleFlash && (
            <mesh position={[0, 0, -2.2]}>
              <sphereGeometry args={[0.4, 8, 8]} />
              <meshBasicMaterial color="#f1c40f" transparent opacity={0.8} />
            </mesh>
          )}
        </group>

        <mesh position={[-1.3, -0.2, 0]}>
          <boxGeometry args={[0.6, 0.8, 4.2]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh position={[1.3, -0.2, 0]}>
          <boxGeometry args={[0.6, 0.8, 4.2]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </RigidBody>
    </group>
  )
}
