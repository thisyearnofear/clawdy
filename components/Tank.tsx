'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../services/AgentProtocol'

export function Tank({ id, position = [0, 5, 0], agentControlled = false }: { id: string, position?: [number, number, number], agentControlled?: boolean }) {
  const chassisRef = useRef<RapierRigidBody>(null)
  const turretRef = useRef<THREE.Group>(null)
  const [, getKeys] = useKeyboardControls()
  
  const [inputs, setInputs] = useState({ forward: 0, turn: 0, brake: false, aim: 0 })

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

    let { forward, turn, brake, aim } = inputs

    if (!agentControlled) {
      const keys = getKeys() as any
      forward = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
      turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
      brake = keys.jump
    }

    // Tank Physics: Skid steering
    const force = 60 * (0.5 + 0.5 * vitalityFactor)
    const torque = 40

    chassisRef.current.setAdditionalMass(burdenFactor * 10, true)

    if (agentControlled) {
      agentProtocol.updateWorldState({
        vehicles: agentProtocol.getWorldState().vehicles.map(v => 
          v.id === id ? { ...v, rotation: chassisRef.current!.rotation() as any, position: chassisRef.current!.translation() as any } : v
        )
      })
    }

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

    if (turretRef.current) {
      if (agentControlled) {
        turretRef.current.rotation.y = THREE.MathUtils.lerp(turretRef.current.rotation.y, aim, 0.1)
      } else {
        const time = state.clock.getElapsedTime()
        turretRef.current.rotation.y = Math.sin(time * 0.5) * 0.5
      }
    }
  })

  return (
    <group>
      <RigidBody ref={chassisRef} position={position} colliders="cuboid" mass={2}>
        {/* Main Hull */}
        <mesh castShadow>
          <boxGeometry args={[2.5, 1, 4]} />
          <meshStandardMaterial color="#4b5320" />
        </mesh>
        
        {/* Turret */}
        <group ref={turretRef} position={[0, 0.7, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.5, 0.6, 1.5]} />
            <meshStandardMaterial color="#353c16" />
          </mesh>
          {/* Barrel */}
          <mesh position={[0, 0, -1.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 2, 8]} />
            <meshStandardMaterial color="#1e210b" />
          </mesh>
        </group>

        {/* Tracks (Visual representation) */}
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