'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../services/AgentProtocol'

export function MonsterTruck({ 
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
  const bodyRef = useRef<THREE.Group>(null)
  const [, getKeys] = useKeyboardControls()
  
  const [inputs, setInputs] = useState({ forward: 0, turn: 0, brake: false })

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

    const session = agentProtocol.getActiveSession(agentControlled ? id : 'Player')
    const vitalityFactor = session ? session.vitality / 100 : 1
    const burdenFactor = session ? session.burden / 100 : 0

    let { forward, turn, brake } = inputs

    if (!agentControlled && playerControlled) {
      const keys = getKeys() as any
      forward = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
      turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
      brake = keys.jump
    }

    // Apply burden
    chassisRef.current.setAdditionalMass(burdenFactor * 8, true)

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

    // Monster truck - powerful but bouncy
    const maxSpeed = 25 * (0.5 + 0.5 * vitalityFactor)
    const acceleration = 100 * delta

    // Acceleration
    if (forward !== 0) {
      const forwardSpeed = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      if (Math.abs(forwardSpeed) < maxSpeed || (forwardSpeed > 0 && forward < 0) || (forwardSpeed < 0 && forward > 0)) {
        const force = forwardDir.clone().multiplyScalar(forward * acceleration)
        chassisRef.current.applyImpulse({ x: force.x, y: 0, z: force.z }, true)
      }
    }

    // Steering
    if (turn !== 0 && speed > 0.1) {
      const steerStrength = 40 * delta
      const steerForce = rightDir.clone().multiplyScalar(turn * steerStrength * Math.min(speed / 5, 1))
      
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

    // Brake
    if (brake) {
      chassisRef.current.setLinvel({ x: velocity.x * 0.85, y: velocity.y, z: velocity.z * 0.85 }, true)
      chassisRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }

    // Natural friction
    if (forward === 0 && !brake) {
      chassisRef.current.setLinvel({ x: velocity.x * 0.98, y: velocity.y, z: velocity.z * 0.98 }, true)
    }

    // Counteract sliding
    if (speed > 1) {
      const forwardComponent = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      const rightComponent = velocity.x * rightDir.x + velocity.z * rightDir.z
      
      const correctedVel = {
        x: forwardDir.x * forwardComponent + rightDir.x * rightComponent * 0.3,
        y: velocity.y,
        z: forwardDir.z * forwardComponent + rightDir.z * rightComponent * 0.3
      }
      
      chassisRef.current.setLinvel(correctedVel, true)
    }

    // Bouncy Suspension visual effect
    if (bodyRef.current) {
        const time = state.clock.getElapsedTime()
        bodyRef.current.position.y = 0.5 + Math.sin(time * 10) * (forward !== 0 ? 0.1 : 0.02)
        bodyRef.current.rotation.x = forward * -0.1
        bodyRef.current.rotation.z = turn * 0.1
    }
  })

  return (
    <group>
      <RigidBody 
        ref={chassisRef} 
        position={position} 
        colliders="cuboid" 
        mass={3}
        restitution={0.4}
        friction={0.5}
        linearDamping={0.1}
        angularDamping={0.4}
        ccd={true}
      >
        {/* Wheels (Huge) */}
        {[[-1.5, -0.5, 1.5], [1.5, -0.5, 1.5], [-1.5, -0.5, -1.5], [1.5, -0.5, -1.5]].map((pos, i) => (
           <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[1, 1, 0.8, 12]} />
              <meshStandardMaterial color="#111" />
           </mesh>
        ))}

        {/* Chassis & Suspension Struts */}
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[2, 0.2, 3]} />
          <meshStandardMaterial color="#333" />
        </mesh>

        {/* Bouncy Body */}
        <group ref={bodyRef}>
          <mesh castShadow>
            <boxGeometry args={[2.2, 1, 3.5]} />
            <meshStandardMaterial color="#d63031" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Cabin */}
          <mesh position={[0, 0.8, -0.2]} castShadow>
            <boxGeometry args={[1.8, 0.8, 1.5]} />
            <meshStandardMaterial color="#2d3436" transparent opacity={0.6} />
          </mesh>
        </group>
      </RigidBody>
    </group>
  )
}
