'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, RapierRigidBody, useRevoluteJoint, useFixedJoint } from '@react-three/rapier'
import { agentProtocol, VehicleCommand } from '../services/AgentProtocol'

export function Vehicle({ id, position = [0, 5, 0], agentControlled = false, playerControlled = true }: { id: string, position?: [number, number, number], agentControlled?: boolean, playerControlled?: boolean }) {
  const chassisRef = useRef<RapierRigidBody>(null)
  const [, getKeys] = useKeyboardControls()
  
  // Local state for inputs (merges manual and agent)
  const [inputs, setInputs] = useState({ forward: 0, turn: 0, brake: false })

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

  useFrame(() => {
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

        // Apply burden to mass

        chassisRef.current.setAdditionalMass(burdenFactor * 5, true)

    

        // Update Digital Twin rotation

        if (agentControlled) {

          agentProtocol.updateWorldState({

            vehicles: agentProtocol.getWorldState().vehicles.map(v => 

              v.id === id ? { ...v, rotation: chassisRef.current!.rotation() as any, position: chassisRef.current!.translation() as any } : v

            )

          })

        }

    

        const force = 40 * (0.5 + 0.5 * vitalityFactor)

     // Slower if low vitality
    const torque = 20

    // Apply forces to chassis (Simplified vehicle physics for R3F/Rapier without complex raycast vehicle boilerplate)
    if (forward !== 0) {
      const direction = new THREE.Vector3(0, 0, -forward).applyQuaternion(
        new THREE.Quaternion(...chassisRef.current.rotation() as any)
      )
      chassisRef.current.applyImpulse(direction.multiplyScalar(force), true)
    }

    if (turn !== 0) {
      chassisRef.current.applyTorqueImpulse({ x: 0, y: turn * torque, z: 0 }, true)
    }
    
    if (brake) {
       const vel = chassisRef.current.linvel()
       chassisRef.current.setLinvel({ x: vel.x * 0.9, y: vel.y, z: vel.z * 0.9 }, true)
    }
  })

  return (
    <group>
      <RigidBody 
        ref={chassisRef} 
        position={position} 
        colliders="cuboid" 
        mass={1}
        restitution={0.2}
        friction={1}
      >
        {/* Chassis */}
        <mesh castShadow>
          <boxGeometry args={[2, 0.5, 4]} />
          <meshStandardMaterial color={agentControlled ? "#ff7675" : "#74b9ff"} />
        </mesh>
        {/* Cabin */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[1.5, 0.6, 2]} />
          <meshStandardMaterial color="#2d3436" transparent opacity={0.7} />
        </mesh>
        
        {/* Wheels (Visual - in simplified version they move with chassis) */}
        {[[-1, -0.3, 1.5], [1, -0.3, 1.5], [-1, -0.3, -1.5], [1, -0.3, -1.5]].map((pos, i) => (
           <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.5, 0.5, 0.4, 16]} />
              <meshStandardMaterial color="#1e1e1e" />
           </mesh>
        ))}
      </RigidBody>
    </group>
  )
}
