'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../services/AgentProtocol'

export function MonsterTruck({ id, position = [0, 5, 0], agentControlled = false }: { id: string, position?: [number, number, number], agentControlled?: boolean }) {
  const chassisRef = useRef<RapierRigidBody>(null)
  const bodyRef = useRef<THREE.Group>(null)
  const [, getKeys] = useKeyboardControls()
  
  const [inputs, setInputs] = useState({ forward: 0, turn: 0, brake: false })

  useEffect(() => {
    if (agentControlled) {
      const unsubscribe = agentProtocol.subscribeToVehicle((cmd) => {
        if (cmd.vehicleId === id) setInputs(cmd.inputs as any)
      })
      return unsubscribe
    }
  }, [agentControlled, id])

  useFrame((state) => {
    if (!chassisRef.current) return

    const session = agentProtocol.getActiveSession(agentControlled ? id : 'Player')
    const vitalityFactor = session ? session.vitality / 100 : 1
    const burdenFactor = session ? session.burden / 100 : 0

    let { forward, turn, brake } = inputs

    if (!agentControlled) {
      const keys = getKeys() as any
      forward = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
      turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
      brake = keys.jump
    }

    const force = 80 * (0.5 + 0.5 * vitalityFactor)
    const torque = 30

    chassisRef.current.setAdditionalMass(burdenFactor * 8, true)

    if (forward !== 0) {
      const direction = new THREE.Vector3(0, 0, -forward).applyQuaternion(
        new THREE.Quaternion(...chassisRef.current.rotation() as any)
      )
      chassisRef.current.applyImpulse(direction.multiplyScalar(force), true)
    }

    if (turn !== 0) {
      chassisRef.current.applyTorqueImpulse({ x: 0, y: turn * torque, z: 0 }, true)
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
      <RigidBody ref={chassisRef} position={position} colliders="cuboid" mass={1.5} restitution={0.5}>
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