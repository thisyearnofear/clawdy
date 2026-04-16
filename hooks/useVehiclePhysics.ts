'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import type { RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../services/AgentProtocol'
import { getSurfaceType, getTerrainNormal, SURFACE_FRICTION } from '../components/terrain/terrainUtils'

export interface VehicleStats {
  maxSpeed: number
  acceleration: number
  steerStrength: number
  mass: number
  lateralGrip: number
  frontOffset: number
  backOffset: number
  steeringMode: 'car' | 'tank'
}

export function useVehiclePhysics(
  id: string,
  chassisRef: React.RefObject<RapierRigidBody | null>,
  stats: VehicleStats,
  agentControlled: boolean = false,
  playerControlled: boolean = true
) {
  const [, getKeys] = useKeyboardControls()
  const [inputs, setInputs] = useState({ forward: 0, turn: 0, brake: false, aim: 0, action: false })
  
  // Smoothing for physics forces
  const smoothedForward = useRef(0)
  const smoothedTurn = useRef(0)

  useEffect(() => {
    if (agentControlled) {
      const unsubscribe = agentProtocol.subscribeToVehicle((cmd) => {
        if (cmd.vehicleId === id) {
          setInputs({
            forward: cmd.inputs.forward ?? 0,
            turn: cmd.inputs.turn ?? 0,
            brake: cmd.inputs.brake ?? false,
            aim: cmd.inputs.aim ?? 0,
            action: cmd.inputs.action ?? false
          })
        }
      })
      return unsubscribe
    }
  }, [agentControlled, id])

  useFrame((_, delta) => {
    if (!chassisRef.current) return

    const session = agentProtocol.getSession(agentControlled ? id : 'Player')
    const vitalityFactor = session ? session.vitality / 100 : 1
    const burdenFactor = session ? session.burden / 100 : 0

    // Determine current raw input
    let rawForward = inputs.forward
    let rawTurn = inputs.turn
    let rawBrake = inputs.brake
    let rawAction = inputs.action
    let rawAim = inputs.aim
    
    if (!agentControlled && playerControlled) {
      type Keys = Record<'forward' | 'backward' | 'left' | 'right' | 'jump', boolean>
      const keys = getKeys() as Keys
      rawForward = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
      rawTurn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
      rawBrake = keys.jump
      rawAction = !!keys.jump
      rawAim = 0

      // Update state so the component return value is accurate for visuals
      if (rawForward !== inputs.forward || rawTurn !== inputs.turn || rawBrake !== inputs.brake || rawAction !== inputs.action) {
        setInputs({ forward: rawForward, turn: rawTurn, brake: rawBrake, action: rawAction, aim: rawAim })
      }
    }

    // --- 1. PRO INPUT SMOOTHING ---
    const lerpSpeed = rawForward === 0 ? 3 : 10
    smoothedForward.current = THREE.MathUtils.lerp(smoothedForward.current, rawForward, delta * lerpSpeed)
    smoothedTurn.current = THREE.MathUtils.lerp(smoothedTurn.current, rawTurn, delta * 12)

    // Apply burden to mass
    chassisRef.current.setAdditionalMass(burdenFactor * stats.mass * 2, true)

    const velocity = chassisRef.current.linvel()
    const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2)
    const rotation = chassisRef.current.rotation()
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)

    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion)
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion)

    // Sync position back to Protocol
    if (agentControlled || (playerControlled && speed > 0.01)) {
      agentProtocol.updateWorldState({
        vehicles: agentProtocol.getWorldState().vehicles.map(v =>
          v.id === id ? {
            ...v,
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w] as [number, number, number, number],
            position: [chassisRef.current!.translation().x, chassisRef.current!.translation().y, chassisRef.current!.translation().z] as [number, number, number]
          } : v
        )
      })
    }

    // --- 2. DYNAMIC DAMPING ---
    const vPos = chassisRef.current.translation()
    const surfaceType = getSurfaceType(vPos.x, vPos.z)
    const rollingFriction = SURFACE_FRICTION[surfaceType] || 0.98
    const baseDamping = (1 - rollingFriction) * 5
    chassisRef.current.setLinearDamping(rawBrake ? 5.0 : baseDamping)
    chassisRef.current.setAngularDamping(2.0)

    // --- 3. HIGH-TORQUE MOTOR ACCELERATION ---
    const maxSpeed = stats.maxSpeed * (0.4 + 0.6 * vitalityFactor)
    const accelerationPower = stats.acceleration * stats.mass * 5

    if (Math.abs(smoothedForward.current) > 0.01) {
      const forwardSpeed = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      if (Math.abs(forwardSpeed) < maxSpeed || (forwardSpeed * smoothedForward.current < 0)) {
        const [nx, ny, nz] = getTerrainNormal(vPos.x, vPos.z)
        const surfaceNormal = new THREE.Vector3(nx, ny, nz)
        const surfaceForward = forwardDir.clone().sub(surfaceNormal.clone().multiplyScalar(forwardDir.dot(surfaceNormal))).normalize()
        const force = surfaceForward.multiplyScalar(smoothedForward.current * accelerationPower * delta)
        chassisRef.current.applyImpulse({ x: force.x, y: force.y, z: force.z }, true)

        const pitchForce = -smoothedForward.current * stats.mass * 2.0
        chassisRef.current.applyTorqueImpulse({
           x: rightDir.x * pitchForce,
           y: rightDir.y * pitchForce,
           z: rightDir.z * pitchForce
        }, true)
      }
    }

    // --- 4. IMPROVED STEERING ---
    if (Math.abs(smoothedTurn.current) > 0.01) {
      if (stats.steeringMode === 'car' && speed > 0.5) {
        const steerStrength = stats.steerStrength * stats.mass * 2.5 * delta
        const steerForce = rightDir.clone().multiplyScalar(smoothedTurn.current * steerStrength * Math.min(speed / 10, 1))
        const fOffset = forwardDir.clone().multiplyScalar(stats.frontOffset)
        const steerPoint = { x: vPos.x + fOffset.x, y: vPos.y, z: vPos.z + fOffset.z }
        chassisRef.current.applyImpulseAtPoint({ x: steerForce.x, y: 0, z: steerForce.z }, steerPoint, true)

        const leanForce = -smoothedTurn.current * stats.mass * 1.5 * Math.min(speed / 20, 1)
        chassisRef.current.applyTorqueImpulse({
           x: forwardDir.x * leanForce,
           y: forwardDir.y * leanForce,
           z: forwardDir.z * leanForce
        }, true)
      } else if (stats.steeringMode === 'tank') {
        const turnRate = stats.steerStrength * stats.mass * 5 * delta
        chassisRef.current.applyTorqueImpulse({ x: 0, y: smoothedTurn.current * turnRate, z: 0 }, true)
      }
    }

    // --- 5. DRIFT / LATERAL FRICTION ---
    if (speed > 1) {
      const sidewaysVelocity = velocity.x * rightDir.x + velocity.z * rightDir.z
      const driftGrip = surfaceType === 'road' ? stats.lateralGrip : stats.lateralGrip * 0.6
      const gripImpulse = -sidewaysVelocity * driftGrip * stats.mass * delta * 15
      chassisRef.current.applyImpulse({ x: rightDir.x * gripImpulse, y: 0, z: rightDir.z * gripImpulse }, true)
    }

    // --- 6. PRO STABILIZER ---
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion)
    const targetUp = new THREE.Vector3(0, 1, 0)
    const stabilizeAxis = new THREE.Vector3().crossVectors(currentUp, targetUp)
    const stabilizeAngle = currentUp.angleTo(targetUp)

    if (stabilizeAngle > 0.01) {
      const stabilizeStrength = stats.mass * 80 * delta * stabilizeAngle
      chassisRef.current.applyTorqueImpulse({ x: stabilizeAxis.x * stabilizeStrength, y: stabilizeAxis.y * stabilizeStrength, z: stabilizeAxis.z * stabilizeStrength }, true)
    }
  })

  return { inputs, setInputs }
}
