'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { RigidBody, RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../../services/AgentProtocol'

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

    const velocity = chassisRef.current.linvel()
    const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2)
    const rotation = chassisRef.current.rotation()
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
    
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion)
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion)

    const maxSpeed = 60 * (0.5 + 0.5 * vitalityFactor)
    const acceleration = 450 * delta

    if (forward !== 0) {
      const forwardSpeed = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      if (Math.abs(forwardSpeed) < maxSpeed || (forwardSpeed > 0 && forward < 0) || (forwardSpeed < 0 && forward > 0)) {
        const force = forwardDir.clone().multiplyScalar(forward * acceleration)
        chassisRef.current.applyImpulse({ x: force.x, y: 0, z: force.z }, true)
      }
    }

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

    if (brake) {
      chassisRef.current.setLinvel({ x: velocity.x * 0.8, y: velocity.y, z: velocity.z * 0.8 }, true)
      chassisRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }

    if (forward === 0 && !brake) {
      chassisRef.current.setLinvel({ x: velocity.x * 0.99, y: velocity.y, z: velocity.z * 0.99 }, true)
    }

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
        wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, turn * 0.6, 0.1)
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
        linearDamping={0.01}
        angularDamping={0.3}
        ccd={true}
      >
        {/* LOW PROFILE - Speedster hugs the ground */}
        
        {/* Main Body - Sleek and aerodynamic */}
        <mesh castShadow>
          <boxGeometry args={[1.8, 0.35, 4.2]} />
          <meshStandardMaterial color="#0984e3" metalness={0.9} roughness={0.1} />
        </mesh>
        
        {/* Tapered front nose */}
        <mesh position={[0, -0.05, -2.3]} rotation={[Math.PI / 2, 0, Math.PI / 4]} castShadow>
          <coneGeometry args={[0.9, 0.8, 4]} />
          <meshStandardMaterial color="#0984e3" metalness={0.9} roughness={0.1} />
        </mesh>
        
        {/* Cockpit canopy - low and sleek */}
        <mesh position={[0, 0.5, 0.2]} castShadow>
          <boxGeometry args={[1.4, 0.4, 1.8]} />
          <meshStandardMaterial color="#0984e3" metalness={0.7} />
        </mesh>
        
        {/* Windshield - steeply raked */}
        <mesh position={[0, 0.45, -0.7]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[1.3, 0.5, 0.05]} />
          <meshStandardMaterial color="#2c3e50" transparent opacity={0.7} metalness={0.95} roughness={0.1} />
        </mesh>
        
        {/* Side windows */}
        <mesh position={[-0.71, 0.5, 0.2]}>
          <boxGeometry args={[0.02, 0.3, 1.4]} />
          <meshStandardMaterial color="#2c3e50" transparent opacity={0.6} metalness={0.9} />
        </mesh>
        <mesh position={[0.71, 0.5, 0.2]}>
          <boxGeometry args={[0.02, 0.3, 1.4]} />
          <meshStandardMaterial color="#2c3e50" transparent opacity={0.6} metalness={0.9} />
        </mesh>
        
        {/* Rear deck - slopes down */}
        <mesh position={[0, 0.25, 1.4]} rotation={[0.3, 0, 0]} castShadow>
          <boxGeometry args={[1.6, 0.1, 1.2]} />
          <meshStandardMaterial color="#0984e3" metalness={0.9} />
        </mesh>
        
        {/* LARGE REAR SPOILER - Racing wing */}
        <group position={[0, 0.9, 1.8]}>
          {/* Main wing */}
          <mesh castShadow>
            <boxGeometry args={[2.2, 0.08, 0.5]} />
            <meshStandardMaterial color="#2c3e50" />
          </mesh>
          {/* Wing endplates */}
          <mesh position={[-1.1, 0, 0]} castShadow>
            <boxGeometry args={[0.1, 0.4, 0.6]} />
            <meshStandardMaterial color="#2c3e50" />
          </mesh>
          <mesh position={[1.1, 0, 0]} castShadow>
            <boxGeometry args={[0.1, 0.4, 0.6]} />
            <meshStandardMaterial color="#2c3e50" />
          </mesh>
          {/* Support struts */}
          <mesh position={[-0.6, -0.35, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.7, 8]} />
            <meshStandardMaterial color="#2c3e50" metalness={0.8} />
          </mesh>
          <mesh position={[0.6, -0.35, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.7, 8]} />
            <meshStandardMaterial color="#2c3e50" metalness={0.8} />
          </mesh>
        </group>
        
        {/* Side air intakes */}
        <mesh position={[-0.95, 0.1, -0.3]} castShadow>
          <boxGeometry args={[0.15, 0.3, 0.8]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>
        <mesh position={[0.95, 0.1, -0.3]} castShadow>
          <boxGeometry args={[0.15, 0.3, 0.8]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>
        
        {/* Headlights - slim and aggressive */}
        <mesh position={[-0.6, 0.05, -2.05]}>
          <boxGeometry args={[0.35, 0.12, 0.05]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1} />
        </mesh>
        <mesh position={[0.6, 0.05, -2.05]}>
          <boxGeometry args={[0.35, 0.12, 0.05]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1} />
        </mesh>
        
        {/* LED strip */}
        <mesh position={[0, 0.02, -2.06]}>
          <boxGeometry args={[1.4, 0.04, 0.03]} />
          <meshStandardMaterial color="#00d2d3" emissive="#00d2d3" emissiveIntensity={0.8} />
        </mesh>
        
        {/* Rear diffuser */}
        <mesh position={[0, -0.15, 2.15]} castShadow>
          <boxGeometry args={[1.4, 0.15, 0.3]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>
        
        {/* Taillights */}
        <mesh position={[-0.6, 0.15, 2.12]}>
          <boxGeometry args={[0.4, 0.1, 0.05]} />
          <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0.6, 0.15, 2.12]}>
          <boxGeometry args={[0.4, 0.1, 0.05]} />
          <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.8} />
        </mesh>

        {/* WHEELS - Low profile, wide */}
        {/* Front wheels */}
        {[[-1, -0.15, -1.4], [1, -0.15, -1.4]].map((pos, i) => (
           <group key={i} position={pos as [number, number, number]} ref={el => { if (el) wheelsRef.current[i] = el }}>
             {/* Tire */}
             <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.35, 0.35, 0.35, 16]} />
                <meshStandardMaterial color="#111" />
             </mesh>
             {/* Rim */}
             <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.22, 0.22, 0.36, 16]} />
                <meshStandardMaterial color="#bdc3c7" metalness={0.9} roughness={0.2} />
             </mesh>
             {/* Spokes */}
             {[0, 1, 2, 3, 4].map((j) => (
               <mesh key={j} rotation={[0, 0, Math.PI / 2]} rotation-order="XYZ">
                  <boxGeometry args={[0.04, 0.38, 0.3]} />
                  <meshStandardMaterial color="#95a5a6" metalness={0.8} />
               </mesh>
             ))}
           </group>
        ))}
        
        {/* Rear wheels - wider */}
        {[[-1.05, -0.15, 1.4], [1.05, -0.15, 1.4]].map((pos, i) => (
           <group key={i} position={pos as [number, number, number]} ref={el => { if (el) wheelsRef.current[i + 2] = el }}>
             {/* Tire */}
             <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.38, 0.38, 0.45, 16]} />
                <meshStandardMaterial color="#111" />
             </mesh>
             {/* Rim */}
             <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.24, 0.24, 0.46, 16]} />
                <meshStandardMaterial color="#bdc3c7" metalness={0.9} roughness={0.2} />
             </mesh>
           </group>
        ))}
      </RigidBody>
    </group>
  )
}
