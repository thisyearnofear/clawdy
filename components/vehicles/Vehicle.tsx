'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import type { RapierRigidBody } from '@react-three/rapier'
import { RigidBody } from '@react-three/rapier'
import { agentProtocol } from '../../services/AgentProtocol'
import { getSurfaceType, getTerrainNormal, SURFACE_FRICTION } from '../terrain/terrainUtils'

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
  const [, getKeys] = useKeyboardControls()
  
  // Local state for inputs (merges manual and agent)
  const [inputs, setInputs] = useState({ forward: 0, turn: 0, brake: false })

  useEffect(() => {
    if (onRef && chassisRef.current) {
      onRef(chassisRef.current)
    }
  }, [onRef])

  useEffect(() => {
    if (agentControlled) {
      const unsubscribe = agentProtocol.subscribeToVehicle((cmd) => {
        if (cmd.vehicleId === id) {
          setInputs(cmd.inputs)
        }
      })
      return unsubscribe
    }
  }, [agentControlled, id])

  useFrame((_, delta) => {
    if (!chassisRef.current) return

    const session = agentProtocol.getActiveSession(agentControlled ? id : 'Player')
    const vitalityFactor = session ? session.vitality / 100 : 1
    const burdenFactor = session ? session.burden / 100 : 0

    let { forward, turn, brake } = inputs
    type Keys = Record<'forward' | 'backward' | 'left' | 'right' | 'jump', boolean>
    if (!agentControlled && playerControlled) {
      const keys = getKeys() as Keys
      forward = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
      turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
      brake = keys.jump
    }

    // Apply burden to mass
    chassisRef.current.setAdditionalMass(burdenFactor * 5, true)

    // Update Digital Twin rotation
    if (agentControlled) {
      const rotation = chassisRef.current!.rotation()
      const position = chassisRef.current!.translation()
      agentProtocol.updateWorldState({
        vehicles: agentProtocol.getWorldState().vehicles.map(v =>
          v.id === id ? {
            ...v,
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w] as [number, number, number, number],
            position: [position.x, position.y, position.z] as [number, number, number]
          } : v
        )
      })
    }

    // Get current velocity and speed
    const velocity = chassisRef.current.linvel()
    const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2)

    // Get vehicle rotation
    const rotation = chassisRef.current.rotation()
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)

    // Forward direction (negative Z is forward in the model)
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion)
    // Right direction for steering
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion)

    // ACCELERATION / BRAKING
    const maxSpeed = 45 * (0.5 + 0.5 * vitalityFactor) // Slower if low vitality
    const acceleration = 400 * delta // Force per second - punchy acceleration

    if (forward !== 0) {
      // Only accelerate if below max speed (in the relevant direction)
      const forwardSpeed = velocity.x * forwardDir.x + velocity.z * forwardDir.z

      if (Math.abs(forwardSpeed) < maxSpeed || (forwardSpeed > 0 && forward < 0) || (forwardSpeed < 0 && forward > 0)) {
        // Apply force aligned to terrain surface normal
        const pos = chassisRef.current.translation()
        const [nx, ny, nz] = getTerrainNormal(pos.x, pos.z)
        const surfaceNormal = new THREE.Vector3(nx, ny, nz)
        // Project forward direction onto surface plane
        const surfaceForward = forwardDir.clone().sub(surfaceNormal.clone().multiplyScalar(forwardDir.dot(surfaceNormal))).normalize()
        const force = surfaceForward.multiplyScalar(forward * acceleration)
        chassisRef.current.applyImpulse({ x: force.x, y: force.y, z: force.z }, true)
      }
    }

    // STEERING (like a car - apply sideways force at front)
    // Only steer when moving (like real car steering)
    if (turn !== 0 && speed > 0.1) {
      const steerStrength = 80 * delta
      const steerForce = rightDir.clone().multiplyScalar(turn * steerStrength * Math.min(speed / 5, 1))

      // Apply steering force at front of vehicle (creates turning moment)
      const frontOffset = forwardDir.clone().multiplyScalar(1.5)
      const steerPoint = {
        x: chassisRef.current.translation().x + frontOffset.x,
        y: chassisRef.current.translation().y,
        z: chassisRef.current.translation().z + frontOffset.z
      }

      chassisRef.current.applyImpulseAtPoint(
        { x: steerForce.x, y: 0, z: steerForce.z },
        steerPoint,
        true
      )

      // Also apply slight counter-force at back to help rotation
      const backOffset = forwardDir.clone().multiplyScalar(-1.5)
      const counterForce = rightDir.clone().multiplyScalar(-turn * steerStrength * 0.5)
      const counterPoint = {
        x: chassisRef.current.translation().x + backOffset.x,
        y: chassisRef.current.translation().y,
        z: chassisRef.current.translation().z + backOffset.z
      }

      chassisRef.current.applyImpulseAtPoint(
        { x: counterForce.x, y: 0, z: counterForce.z },
        counterPoint,
        true
      )
    }

    // BRAKING
    if (brake) {
      // Stronger braking
      chassisRef.current.setLinvel({ x: velocity.x * 0.85, y: velocity.y, z: velocity.z * 0.85 }, true)
      chassisRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }

    // NATURAL FRICTION / DRAG - varies by surface type
    const vPos = chassisRef.current.translation()
    const surfaceType = getSurfaceType(vPos.x, vPos.z)
    const rollingFriction = SURFACE_FRICTION[surfaceType]
    // Always apply surface friction (even while accelerating on bad surfaces)
    const frictionToApply = forward !== 0 ? Math.sqrt(rollingFriction) : rollingFriction
    if (!brake) {
      chassisRef.current.setLinvel({ x: velocity.x * frictionToApply, y: velocity.y, z: velocity.z * frictionToApply }, true)
    }

    // Counteract sliding/drifting (align velocity with forward direction)
    if (speed > 1) {
      const forwardComponent = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      const rightComponent = velocity.x * rightDir.x + velocity.z * rightDir.z

      // Reduce sideways velocity (simulate wheel friction preventing sliding)
      const lateralGrip = surfaceType === 'road' ? 0.6 : surfaceType === 'grass' ? 0.5 : 0.4
      const correctedVel = {
        x: forwardDir.x * forwardComponent + rightDir.x * rightComponent * lateralGrip,
        y: velocity.y,
        z: forwardDir.z * forwardComponent + rightDir.z * rightComponent * lateralGrip
      }

      chassisRef.current.setLinvel(correctedVel, true)
    }

    // STABILIZER: Keep the vehicle upright
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion)
    const targetUp = new THREE.Vector3(0, 1, 0) // World up

    // Calculate the rotation needed to align currentUp with targetUp
    // Cross product gives the axis of rotation
    const stabilizeAxis = new THREE.Vector3().crossVectors(currentUp, targetUp)
    // Dot product gives the angle (roughly, for small angles)
    const stabilizeAngle = currentUp.angleTo(targetUp)

    if (stabilizeAngle > 0.05) { // If tilted more than a little
      // Apply torque to restore upright position
      // Strength depends on how tilted it is
      const stabilizeStrength = 100 * delta * stabilizeAngle
      chassisRef.current.applyTorqueImpulse({
        x: stabilizeAxis.x * stabilizeStrength,
        y: stabilizeAxis.y * stabilizeStrength, // Usually we don't need Y torque for uprighting
        z: stabilizeAxis.z * stabilizeStrength
      }, true)

      // Add extra angular damping when stabilizing to prevent oscillation
      chassisRef.current.setAngvel({
        x: chassisRef.current.angvel().x * 0.9,
        y: chassisRef.current.angvel().y,
        z: chassisRef.current.angvel().z * 0.9
      }, true)
    }
  })

  return (
    <group>
      <RigidBody 
        ref={chassisRef} 
        position={position} 
        colliders="cuboid" 
        mass={2}
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
