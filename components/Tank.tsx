'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, RapierRigidBody, useRapier } from '@react-three/rapier'
import { agentProtocol } from '../services/AgentProtocol'

export function Tank({ id, position = [0, 5, 0], agentControlled = false, playerControlled = true }: { id: string, position?: [number, number, number], agentControlled?: boolean, playerControlled?: boolean }) {
  const chassisRef = useRef<RapierRigidBody>(null)
  const turretRef = useRef<THREE.Group>(null)
  const rapier = useRapier()
  const [, getKeys] = useKeyboardControls()
  
  const [inputs, setInputs] = useState({ forward: 0, turn: 0, brake: false, aim: 0, action: false })
  const [muzzleFlash, setMuzzleFlash] = useState(false)
  const lastFireTime = useRef(0)

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

    // Firing Logic
    if (action && time - lastFireTime.current > 0.5) {
      setMuzzleFlash(true)
      setTimeout(() => setMuzzleFlash(false), 50)
      lastFireTime.current = time

      const matrix = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...chassisRef.current.rotation() as any))
      const translation = new THREE.Vector3(...chassisRef.current.translation() as any)
      
      const barrelOffset = new THREE.Vector3(0, 0.7, -2.2).applyMatrix4(matrix)
      const barrelPos = translation.clone().add(barrelOffset)
      const barrelDir = new THREE.Vector3(0, 0, -1).applyMatrix4(matrix)
      
      // Access Rapier's Ray class directly from the library object
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
      <RigidBody ref={chassisRef} position={position} colliders="cuboid" mass={2}>
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
