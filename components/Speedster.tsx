'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../services/AgentProtocol'

export function Speedster({ id, position = [0, 5, 0], agentControlled = false }: { id: string, position?: [number, number, number], agentControlled?: boolean }) {
  const chassisRef = useRef<RapierRigidBody>(null)
  const wheelsRef = useRef<THREE.Group[]>([])
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

  useFrame(() => {
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

    const force = 100 * (0.5 + 0.5 * vitalityFactor)
    const torque = 15

    chassisRef.current.setAdditionalMass(burdenFactor * 4, true)

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

    // Visual Steering for front wheels
    wheelsRef.current.forEach((wheel, i) => {
      if (wheel && i < 2) { // Front wheels
        wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, turn * 0.5, 0.1)
      }
    })
  })

  return (
    <group>
      <RigidBody ref={chassisRef} position={position} colliders="cuboid" mass={0.8} friction={0.5}>
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