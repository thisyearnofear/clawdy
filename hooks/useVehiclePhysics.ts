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

    let { forward, turn, brake, action, aim } = inputs
    if (!agentControlled && playerControlled) {
      type Keys = Record<'forward' | 'backward' | 'left' | 'right' | 'jump', boolean>
      const keys = getKeys() as Keys
      forward = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
      turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
      brake = keys.jump
      action = !!keys.jump
      aim = 0
    }

    // Apply burden to mass
    chassisRef.current.setAdditionalMass(burdenFactor * stats.mass * 2, true)

    // Sync Digital Twin (Agent position in Protocol)
    if (agentControlled) {
      const rotation = chassisRef.current.rotation()
      const position = chassisRef.current.translation()
      agentProtocol.updateWorldState({
        vehicles: agentProtocol.getWorldState().vehicles.map(v =>
          v.id === id ? {
            ...v,
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w] as [number, number, number, number],
            position: [position.x, position.y, position.z] as [number, number, number]
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

    // ACCELERATION / BRAKING
    const maxSpeed = stats.maxSpeed * (0.5 + 0.5 * vitalityFactor)
    const acceleration = stats.acceleration * delta

    if (forward !== 0) {
      const forwardSpeed = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      if (Math.abs(forwardSpeed) < maxSpeed || (forwardSpeed > 0 && forward < 0) || (forwardSpeed < 0 && forward > 0)) {
        const pos = chassisRef.current.translation()
        const [nx, ny, nz] = getTerrainNormal(pos.x, pos.z)
        const surfaceNormal = new THREE.Vector3(nx, ny, nz)
        const surfaceForward = forwardDir.clone().sub(surfaceNormal.clone().multiplyScalar(forwardDir.dot(surfaceNormal))).normalize()
        const force = surfaceForward.multiplyScalar(forward * acceleration)
        chassisRef.current.applyImpulse({ x: force.x, y: force.y, z: force.z }, true)
      }
    }

    // STEERING
    if (turn !== 0) {
      if (stats.steeringMode === 'car' && speed > 0.1) {
        const steerStrength = stats.steerStrength * delta
        const steerForce = rightDir.clone().multiplyScalar(turn * steerStrength * Math.min(speed / 5, 1))

        const fOffset = forwardDir.clone().multiplyScalar(stats.frontOffset)
        const steerPoint = {
          x: chassisRef.current.translation().x + fOffset.x,
          y: chassisRef.current.translation().y,
          z: chassisRef.current.translation().z + fOffset.z
        }
        chassisRef.current.applyImpulseAtPoint({ x: steerForce.x, y: 0, z: steerForce.z }, steerPoint, true)

        const bOffset = forwardDir.clone().multiplyScalar(stats.backOffset)
        const counterForce = rightDir.clone().multiplyScalar(-turn * steerStrength * 0.5)
        const counterPoint = {
          x: chassisRef.current.translation().x + bOffset.x,
          y: chassisRef.current.translation().y,
          z: chassisRef.current.translation().z + bOffset.z
        }
        chassisRef.current.applyImpulseAtPoint({ x: counterForce.x, y: 0, z: counterForce.z }, counterPoint, true)
      } else if (stats.steeringMode === 'tank') {
        const turnRate = stats.steerStrength * delta
        chassisRef.current.applyTorqueImpulse({ x: 0, y: turn * turnRate, z: 0 }, true)
      }
    }

    // BRAKING
    if (brake) {
      chassisRef.current.setLinvel({ x: velocity.x * 0.85, y: velocity.y, z: velocity.z * 0.85 }, true)
      chassisRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }

    // FRICTION / DRAG
    const vPos = chassisRef.current.translation()
    const surfaceType = getSurfaceType(vPos.x, vPos.z)
    const rollingFriction = SURFACE_FRICTION[surfaceType] || 0.98
    const frictionToApply = forward !== 0 ? Math.sqrt(rollingFriction) : rollingFriction
    if (!brake) {
      chassisRef.current.setLinvel({ x: velocity.x * frictionToApply, y: velocity.y, z: velocity.z * frictionToApply }, true)
    }

    // DRIFT CORRECTION
    if (speed > 1) {
      const forwardComponent = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      const rightComponent = velocity.x * rightDir.x + velocity.z * rightDir.z
      const grip = surfaceType === 'road' ? stats.lateralGrip : stats.lateralGrip * 0.8
      const correctedVel = {
        x: forwardDir.x * forwardComponent + rightDir.x * rightComponent * grip,
        y: velocity.y,
        z: forwardDir.z * forwardComponent + rightDir.z * rightComponent * grip
      }
      chassisRef.current.setLinvel(correctedVel, true)
    }

    // STABILIZER
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion)
    const targetUp = new THREE.Vector3(0, 1, 0)
    const stabilizeAxis = new THREE.Vector3().crossVectors(currentUp, targetUp)
    const stabilizeAngle = currentUp.angleTo(targetUp)

    if (stabilizeAngle > 0.05) {
      const stabilizeStrength = 100 * delta * stabilizeAngle
      chassisRef.current.applyTorqueImpulse({
        x: stabilizeAxis.x * stabilizeStrength,
        y: stabilizeAxis.y * stabilizeStrength,
        z: stabilizeAxis.z * stabilizeStrength
      }, true)
      chassisRef.current.setAngvel({
        x: chassisRef.current.angvel().x * 0.9,
        y: chassisRef.current.angvel().y,
        z: chassisRef.current.angvel().z * 0.9
      }, true)
    }
  })

  return { inputs, setInputs }
}
