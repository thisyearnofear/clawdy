'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, RapierRigidBody, useRapier } from '@react-three/rapier'
import { agentProtocol } from '../../services/AgentProtocol'

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
  onRef?: (ref: any) => void
}) {
  const chassisRef = useRef<RapierRigidBody>(null)
  const turretRef = useRef<THREE.Group>(null)
  const rapier = useRapier()
  const [, getKeys] = useKeyboardControls()
  
  const [inputs, setInputs] = useState({ forward: 0, turn: 0, brake: false, aim: 0, action: false })
  const [muzzleFlash, setMuzzleFlash] = useState(false)
  const lastFireTime = useRef(0)

  useEffect(() => {
    if (onRef && chassisRef.current) {
      onRef(chassisRef.current)
    }
  }, [onRef])

  useEffect(() => {
    if (agentControlled) {
      const unsubscribe = agentProtocol.subscribeToVehicle((cmd) => {
        if (cmd.vehicleId === id) setInputs(cmd.inputs as any)
      })
      return unsubscribe
    }
  }, [agentControlled, id])

  useFrame((state, delta) => {
    if (!chassisRef.current) return
    const time = state.clock.getElapsedTime()

    const session = agentProtocol.getActiveSession(agentControlled ? id : 'Player')
    const vitalityFactor = session ? session.vitality / 100 : 1
    const burdenFactor = session ? session.burden / 100 : 0

    let { forward, turn, brake, aim, action } = inputs

    if (!agentControlled && playerControlled) {
      const keys = getKeys() as any
      forward = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
      turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
      brake = keys.jump
      action = !!keys.jump
    }

    // Apply burden
    chassisRef.current.setAdditionalMass(burdenFactor * 10, true)

    if (agentControlled) {
      agentProtocol.updateWorldState({
        vehicles: agentProtocol.getWorldState().vehicles.map(v =>
          v.id === id ? {
            ...v,
            rotation: chassisRef.current!.rotation() as any,
            position: chassisRef.current!.translation() as any
          } : v
        )
      })
    }

    // Get physics data
    const velocity = chassisRef.current.linvel()
    const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2)
    const rotation = chassisRef.current.rotation()
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)

    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion)
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion)

    // Tank is slower but more powerful
    const maxSpeed = 25 * (0.5 + 0.5 * vitalityFactor)
    const acceleration = 180 * delta

    // Acceleration
    if (forward !== 0) {
      const forwardSpeed = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      if (Math.abs(forwardSpeed) < maxSpeed || (forwardSpeed > 0 && forward < 0) || (forwardSpeed < 0 && forward > 0)) {
        const force = forwardDir.clone().multiplyScalar(forward * acceleration)
        chassisRef.current.applyImpulse({ x: force.x, y: 0, z: force.z }, true)
      }
    }

    // Tank steering (tracks - can turn in place)
    if (turn !== 0) {
      // Tanks can rotate even when stationary
      const turnRate = 1.5 * delta
      chassisRef.current.applyTorqueImpulse({ x: 0, y: turn * turnRate, z: 0 }, true)
    }

    // Firing Logic
    if (action && time - lastFireTime.current > 0.5) {
      setMuzzleFlash(true)
      setTimeout(() => setMuzzleFlash(false), 50)
      lastFireTime.current = time

      const matrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion)
      const translation = new THREE.Vector3(...chassisRef.current.translation() as any)

      const barrelOffset = new THREE.Vector3(0, 0.7, -2.2).applyMatrix4(matrix)
      const barrelPos = translation.clone().add(barrelOffset)
      const barrelDir = new THREE.Vector3(0, 0, -1).applyMatrix4(matrix)

      const ray = new rapier.rapier.Ray(barrelPos, barrelDir)
      const hit = rapier.world.castRay(ray, 100, true)

      if (hit) {
        agentProtocol.processCombatEvent({
          agentId: agentControlled ? id : 'Player',
          type: 'fire',
          hitPoint: [barrelPos.x + barrelDir.x * hit.timeOfImpact, barrelPos.y + barrelDir.y * hit.timeOfImpact, barrelPos.z + barrelDir.z * hit.timeOfImpact]
        })
      }
    }

    // Brake
    if (brake) {
      chassisRef.current.setLinvel({ x: velocity.x * 0.9, y: velocity.y, z: velocity.z * 0.9 }, true)
    }

    // Natural friction
    if (forward === 0 && !brake) {
      chassisRef.current.setLinvel({ x: velocity.x * 0.97, y: velocity.y, z: velocity.z * 0.97 }, true)
    }

    // STABILIZER: Keep the tank upright
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion)
    const targetUp = new THREE.Vector3(0, 1, 0)
    const stabilizeAxis = new THREE.Vector3().crossVectors(currentUp, targetUp)
    const stabilizeAngle = currentUp.angleTo(targetUp)

    if (stabilizeAngle > 0.05) {
      const stabilizeStrength = 150 * delta * stabilizeAngle // Tanks are heavier, need more force
      chassisRef.current.applyTorqueImpulse({
        x: stabilizeAxis.x * stabilizeStrength,
        y: 0,
        z: stabilizeAxis.z * stabilizeStrength
      }, true)
    }

    // Turret animation
    if (turretRef.current) {
      if (agentControlled) {
        turretRef.current.rotation.y = THREE.MathUtils.lerp(turretRef.current.rotation.y, aim, 0.1)
      } else {
        turretRef.current.rotation.y = Math.sin(time * 0.5) * 0.5
      }
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
        linearDamping={0.2}
        angularDamping={0.9}
        ccd={true}
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
          {muzzleFlash && (
            <mesh position={[0, 0, -2.2]}>
              <sphereGeometry args={[0.3, 8, 8]} />
              <meshBasicMaterial color="#f1c40f" />
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
