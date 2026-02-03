'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../../services/AgentProtocol'

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

    const velocity = chassisRef.current.linvel()
    const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2)
    const rotation = chassisRef.current.rotation()
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
    
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion)
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion)

    const maxSpeed = 45 * (0.5 + 0.5 * vitalityFactor)
    const acceleration = 350 * delta

    if (forward !== 0) {
      const forwardSpeed = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      if (Math.abs(forwardSpeed) < maxSpeed || (forwardSpeed > 0 && forward < 0) || (forwardSpeed < 0 && forward > 0)) {
        const force = forwardDir.clone().multiplyScalar(forward * acceleration)
        chassisRef.current.applyImpulse({ x: force.x, y: 0, z: force.z }, true)
      }
    }

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

    if (brake) {
      chassisRef.current.setLinvel({ x: velocity.x * 0.85, y: velocity.y, z: velocity.z * 0.85 }, true)
      chassisRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }

    if (forward === 0 && !brake) {
      chassisRef.current.setLinvel({ x: velocity.x * 0.98, y: velocity.y, z: velocity.z * 0.98 }, true)
    }

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

    // Bouncy body animation
    if (bodyRef.current) {
        const time = state.clock.getElapsedTime()
        bodyRef.current.position.y = 0.8 + Math.sin(time * 10) * (forward !== 0 ? 0.15 : 0.03)
        bodyRef.current.rotation.x = forward * -0.15
        bodyRef.current.rotation.z = turn * 0.15
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
        linearDamping={0.02}
        angularDamping={0.4}
        ccd={true}
      >
        {/* MASSIVE Wheels - Monster Truck signature */}
        {[[-1.8, -0.3, 1.8], [1.8, -0.3, 1.8], [-1.8, -0.3, -1.8], [1.8, -0.3, -1.8]].map((pos, i) => (
           <group key={i} position={pos as [number, number, number]}>
             {/* Tire */}
             <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[1.2, 1.2, 1, 16]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
             </mesh>
             {/* Rim */}
             <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.6, 0.6, 1.05, 8]} />
                <meshStandardMaterial color="#c0392b" metalness={0.6} />
             </mesh>
             {/* Tread details */}
             {[0, 1, 2, 3].map((j) => (
               <mesh key={j} rotation={[0, 0, Math.PI / 2]} position={[0, Math.cos(j * Math.PI / 2) * 1.1, Math.sin(j * Math.PI / 2) * 1.1]}>
                  <boxGeometry args={[0.3, 1.1, 0.4]} />
                  <meshStandardMaterial color="#0a0a0a" />
               </mesh>
             ))}
           </group>
        ))}

        {/* Suspension Struts - connecting wheels to body */}
        {[[-1.8, 0.5, 1.8], [1.8, 0.5, 1.8], [-1.8, 0.5, -1.8], [1.8, 0.5, -1.8]].map((pos, i) => (
           <mesh key={i} position={pos as [number, number, number]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 1.2, 8]} />
              <meshStandardMaterial color="#f39c12" metalness={0.8} />
           </mesh>
        ))}

        {/* Main Body - lifted high */}
        <group ref={bodyRef}>
          {/* Chassis base */}
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[2.5, 0.4, 4]} />
            <meshStandardMaterial color="#2c3e50" metalness={0.4} />
          </mesh>
          
          {/* Main cabin body */}
          <mesh position={[0, 1.8, 0]} castShadow>
            <boxGeometry args={[2.2, 1.2, 3.5]} />
            <meshStandardMaterial color="#d63031" metalness={0.3} roughness={0.4} />
          </mesh>
          
          {/* Hood scoop */}
          <mesh position={[0, 2.4, -1.2]} castShadow>
            <boxGeometry args={[1.2, 0.4, 0.8]} />
            <meshStandardMaterial color="#c0392b" />
          </mesh>
          
          {/* Windshield */}
          <mesh position={[0, 2, -0.8]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[2, 0.8, 0.1]} />
            <meshStandardMaterial color="#74b9ff" transparent opacity={0.4} metalness={0.9} />
          </mesh>
          
          {/* Side windows */}
          <mesh position={[-1.11, 2, 0.2]}>
            <boxGeometry args={[0.05, 0.6, 1.5]} />
            <meshStandardMaterial color="#74b9ff" transparent opacity={0.4} />
          </mesh>
          <mesh position={[1.11, 2, 0.2]}>
            <boxGeometry args={[0.05, 0.6, 1.5]} />
            <meshStandardMaterial color="#74b9ff" transparent opacity={0.4} />
          </mesh>
          
          {/* Roll cage bars */}
          {[[-1, 2.8, 1], [1, 2.8, 1], [-1, 2.8, -1], [1, 2.8, -1]].map((pos, i) => (
             <mesh key={i} position={pos as [number, number, number]} castShadow>
                <cylinderGeometry args={[0.08, 0.08, 1.2, 8]} />
                <meshStandardMaterial color="#f39c12" metalness={0.8} />
             </mesh>
          ))}
          
          {/* Roof */}
          <mesh position={[0, 3.4, 0]} castShadow>
            <boxGeometry args={[2, 0.1, 2.2]} />
            <meshStandardMaterial color="#d63031" />
          </mesh>
          
          {/* Rear spoiler */}
          <mesh position={[0, 2.8, 1.8]} castShadow>
            <boxGeometry args={[2.4, 0.1, 0.6]} />
            <meshStandardMaterial color="#c0392b" />
          </mesh>
          <mesh position={[-1, 2.4, 1.8]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.8, 8]} />
            <meshStandardMaterial color="#c0392b" />
          </mesh>
          <mesh position={[1, 2.4, 1.8]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.8, 8]} />
            <meshStandardMaterial color="#c0392b" />
          </mesh>
          
          {/* Headlights */}
          <mesh position={[-0.8, 1.6, -1.76]}>
            <boxGeometry args={[0.4, 0.3, 0.1]} />
            <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0.8, 1.6, -1.76]}>
            <boxGeometry args={[0.4, 0.3, 0.1]} />
            <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.8} />
          </mesh>
          
          {/* Grill */}
          <mesh position={[0, 1.4, -1.76]}>
            <boxGeometry args={[1.6, 0.4, 0.05]} />
            <meshStandardMaterial color="#2c3e50" />
          </mesh>
        </group>
      </RigidBody>
    </group>
  )
}
