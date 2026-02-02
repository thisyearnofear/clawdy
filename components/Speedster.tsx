'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../services/AgentProtocol'

export function Speedster({ 
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
  const wheelsRef = useRef<THREE.Group[]>([])
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

  useFrame((_, delta) => {
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
    chassisRef.current.setAdditionalMass(burdenFactor * 4, true)

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

    // Speedster - very fast but less grip
    const maxSpeed = 35 * (0.5 + 0.5 * vitalityFactor)
    const acceleration = 120 * delta

    // Acceleration
    if (forward !== 0) {
      const forwardSpeed = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      if (Math.abs(forwardSpeed) < maxSpeed || (forwardSpeed > 0 && forward < 0) || (forwardSpeed < 0 && forward > 0)) {
        const force = forwardDir.clone().multiplyScalar(forward * acceleration)
        chassisRef.current.applyImpulse({ x: force.x, y: 0, z: force.z }, true)
      }
    }

    // Steering - very responsive
    if (turn !== 0 && speed > 0.1) {
      const steerStrength = 50 * delta
      const steerForce = rightDir.clone().multiplyScalar(turn * steerStrength * Math.min(speed / 5, 1))
      
      const frontOffset = forwardDir.clone().multiplyScalar(1.8)
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
      
      const backOffset = forwardDir.clone().multiplyScalar(-1.8)
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
      chassisRef.current.setLinvel({ x: velocity.x * 0.8, y: velocity.y, z: velocity.z * 0.8 }, true)
      chassisRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }

    // Natural friction - speedster has less drag (more slippery)
    if (forward === 0 && !brake) {
      chassisRef.current.setLinvel({ x: velocity.x * 0.99, y: velocity.y, z: velocity.z * 0.99 }, true)
    }

    // Counteract sliding - speedster slides more (drift-friendly)
    if (speed > 1) {
      const forwardComponent = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      const rightComponent = velocity.x * rightDir.x + velocity.z * rightDir.z
      
      const correctedVel = {
        x: forwardDir.x * forwardComponent + rightDir.x * rightComponent * 0.5,
        y: velocity.y,
        z: forwardDir.z * forwardComponent + rightDir.z * rightComponent * 0.5
      }
      
      chassisRef.current.setLinvel(correctedVel, true)
    }

    // Visual Steering for front wheels
    wheelsRef.current.forEach((wheel, i) => {
      if (wheel && i < 2) { // Front wheels
        wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, turn * 0.5, 0.1)
      }
    })
  })

  return (
    <group>
      <RigidBody 
        ref={chassisRef} 
        position={position} 
        colliders="cuboid" 
        mass={1.5}
        restitution={0.1}
        friction={0.3}
        linearDamping={0.05}
        angularDamping={0.3}
        ccd={true}
      >
        {/* Aerodynamic Body */}
        <mesh castShadow>
          <boxGeometry args={[1.8, 0.4, 4]} />
          <meshStandardMaterial color="#0984e3" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.3, 0.5]} castShadow>
          <boxGeometry args={[1.6, 0.4, 2]} />
          <meshStandardMaterial color="#0984e3" />
        </mesh>
        {/* Spoiler */}
        <mesh position={[0, 0.6, 1.8]} castShadow>
          <boxGeometry args={[2, 0.1, 0.5]} />
          <meshStandardMaterial color="#2d3436" />
        </mesh>

        {/* Wheels with steering alignment */}
        {[[-1, -0.2, -1.5], [1, -0.2, -1.5], [-1, -0.2, 1.5], [1, -0.2, 1.5]].map((pos, i) => (
           <group key={i} position={pos as [number, number, number]} ref={el => { if (el) wheelsRef.current[i] = el }}>
             <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.4, 0.4, 0.3, 16]} />
                <meshStandardMaterial color="#111" />
             </mesh>
           </group>
        ))}
      </RigidBody>
    </group>
  )
}
