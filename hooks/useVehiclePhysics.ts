'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import type { RapierRigidBody } from '@react-three/rapier'
import { agentProtocol } from '../services/AgentProtocol'
import { getSurfaceType, getTerrainNormal, SURFACE_FRICTION } from '../components/terrain/terrainUtils'
import {
  HANDLING_MATRIX,
  type VehicleHandlingProfile,
  useGameStore,
} from '../services/gameStore'

export interface VehicleStats {
  profile: VehicleHandlingProfile
  maxSpeed: number
  acceleration: number
  steerStrength: number
  mass: number
  lateralGrip: number
  frontOffset: number
  backOffset: number
  steeringMode: 'car' | 'tank'
  steerRetention: number
}

const PROFILE_FLOOD_SCALE: Record<VehicleHandlingProfile, number> = {
  speedster: 1.15,
  vehicle: 1.0,
  monster: 0.9,
  tank: 0.8,
}

const VEHICLE_MODE_SCALE: Record<VehicleHandlingProfile, number> = {
  speedster: 1.08,
  vehicle: 1.0,
  monster: 0.94,
  tank: 0.82,
}

export function useVehiclePhysics(
  id: string,
  chassisRef: React.RefObject<RapierRigidBody | null>,
  stats: VehicleStats,
  agentControlled: boolean = false,
  playerControlled: boolean = true,
  enabled: boolean = true
) {
  const [, getKeys] = useKeyboardControls()
  const handlingMode = useGameStore(state => state.handlingMode)
  const handling = HANDLING_MATRIX[handlingMode]
  const steerRetentionOverrides = useGameStore(state => state.steerRetentionOverrides)
  const lateralGripOverrides = useGameStore(state => state.lateralGripOverrides)
  const accelerationOverrides = useGameStore(state => state.accelerationOverrides)
  const maxSpeedOverrides = useGameStore(state => state.maxSpeedOverrides)
  const flood = useGameStore(state => state.flood)
  const setPlayerWater = useGameStore(state => state.setPlayerWater)
  const setNearMud = useGameStore(state => state.setNearMud)
  const addPlayerWaterTime = useGameStore(state => state.addPlayerWaterTime)
  const nearMud = useGameStore(state => state.nearMud)
  const [inputs, setInputs] = useState({ forward: 0, turn: 0, brake: false, aim: 0, action: false })
  
  // Smoothing for physics forces
  const smoothedForward = useRef(0)
  const smoothedTurn = useRef(0)
  const waterTimeAccRef = useRef(0)
  const lastWaterFlushRef = useRef(0)
  const lastPlayerWaterSyncRef = useRef(0)
  const lastPlayerWaterStateRef = useRef({ inWater: false, depth: 0 })
  const lastMudWarningUpdate = useRef(0)

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
    if (!enabled || !chassisRef.current) return

    const session = agentProtocol.getSession(agentControlled ? id : 'Player')
    const vitalityFactor = session ? session.vitality / 100 : 1
    const burdenFactor = session ? session.burden / 100 : 0
    const isAirBubble = !!(session && session.airBubbleUntil && session.airBubbleUntil > Date.now())
    const isFoamBoard = !!(session && session.foamBoardUntil && session.foamBoardUntil > Date.now())

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

      if (rawForward !== inputs.forward || rawTurn !== inputs.turn || rawBrake !== inputs.brake || rawAction !== inputs.action) {
        setInputs({ forward: rawForward, turn: rawTurn, brake: rawBrake, action: rawAction, aim: rawAim })
      }
    }

    // --- 1. PRO INPUT SMOOTHING ---
    // Softer input smoothing: snappy enough to feel responsive, not so fast it feels twitchy
    const lerpSpeed = rawForward === 0 ? 8 : 16
    smoothedForward.current = THREE.MathUtils.lerp(smoothedForward.current, rawForward, delta * lerpSpeed)
    // Turn smoothing: faster ramp-up, faster release — reduces the "steering lag" feel
    const turnLerp = rawTurn === 0 ? 18 : 14
    smoothedTurn.current = THREE.MathUtils.lerp(smoothedTurn.current, rawTurn, delta * turnLerp)

    // Apply burden to mass
    chassisRef.current.setAdditionalMass(burdenFactor * stats.mass * 1.2, true)

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
    
    // Mud Trap logic
    const isMud = surfaceType === 'mud'
    const mudPenalty = isMud ? 2.0 : 1.0
    
    const baseDamping = handling.baseLinearDamping + (1 - rollingFriction) * handling.surfaceDampingInfluence * (isMud ? 1.5 : 1.0)

    // Flood drag
    const waterSurfaceY = flood.level
    const chassisHalfHeight = 0.35
    const physicalSubmergeDepth = flood.active
      ? THREE.MathUtils.clamp((waterSurfaceY - (vPos.y - chassisHalfHeight)) / 1.0, 0, 1)
      : 0

    // Air Bubble temporarily negates water drag.
    const dragDepthRaw = isAirBubble ? 0 : physicalSubmergeDepth

    // Vehicle-profile tuning: speedsters suffer more from water, tanks less.
    const dragDepth = THREE.MathUtils.clamp(dragDepthRaw * PROFILE_FLOOD_SCALE[stats.profile], 0, 1)
    // CONSOLIDATED: Single floodSlow formula with airBubble modifier
    const floodSlow = 1 - dragDepth * (isAirBubble ? 0.05 : 0.35)

    // Add Buoyancy: Upward force proportional to submergence
    const buoyancy = physicalSubmergeDepth * stats.mass * 12.0 * delta
    chassisRef.current.applyImpulse({ x: 0, y: buoyancy, z: 0 }, true)
    // Publish player-only water state for HUD clarity.
    if (!agentControlled && playerControlled) {
      const inWater = physicalSubmergeDepth > 0.18 && flood.active
      const nowPerf = performance.now()
      const depthChanged = Math.abs(physicalSubmergeDepth - lastPlayerWaterStateRef.current.depth) > 0.03
      const stateChanged = inWater !== lastPlayerWaterStateRef.current.inWater
      if (stateChanged || depthChanged || nowPerf - lastPlayerWaterSyncRef.current > 250) {
        lastPlayerWaterSyncRef.current = nowPerf
        lastPlayerWaterStateRef.current = { inWater, depth: physicalSubmergeDepth }
        setPlayerWater({ inWater, depth: physicalSubmergeDepth })
      }
      if (inWater) {
        waterTimeAccRef.current += delta * 1000
        if (nowPerf - lastWaterFlushRef.current > 250) {
          lastWaterFlushRef.current = nowPerf
          if (waterTimeAccRef.current > 1) {
            addPlayerWaterTime(waterTimeAccRef.current)
            waterTimeAccRef.current = 0
          }
        }
      } else if (waterTimeAccRef.current > 1) {
        addPlayerWaterTime(waterTimeAccRef.current)
        waterTimeAccRef.current = 0
      }
    }

    const boardDragCut = isFoamBoard ? 0.65 : 1.0
    const floodLinearDrag = dragDepth * (1.4 + flood.intensity * 1.6) * boardDragCut
    const floodAngularDrag = dragDepth * (0.8 + flood.intensity * 1.4) * (isFoamBoard ? 0.7 : 1.0)

    chassisRef.current.setLinearDamping(rawBrake ? handling.brakingDamping : baseDamping + floodLinearDrag)
    chassisRef.current.setAngularDamping(handling.angularDamping + floodAngularDrag)

    // --- 3. HIGH-TORQUE MOTOR ACCELERATION (with Power-ups) ---
    const isSpeedBoosted = session && session.speedBoostUntil && session.speedBoostUntil > Date.now()
    const isAntiGravity = session && session.antiGravityUntil && session.antiGravityUntil > Date.now()

    const boostFactor = isSpeedBoosted ? handling.speedBoostMultiplier : 1.0
    // CONSOLIDATED: floodSlow already calculated in flood physics block above
    const bubbleBoost = isAirBubble ? 1.18 : 1.0
    const modeSpeedScale = handling.speedScale * VEHICLE_MODE_SCALE[stats.profile]
    const modeAccelScale = handling.accelerationScale * VEHICLE_MODE_SCALE[stats.profile]
    // Combine all penalty factors, then clamp to 0.4 min for driveability
    const totalPenalty = Math.max(0.4, (0.55 + 0.45 * vitalityFactor) * boostFactor * floodSlow / mudPenalty)
    // Runtime overrides from control panel take precedence if set
    const effectiveMaxSpeed = maxSpeedOverrides[stats.profile] ?? stats.maxSpeed
    const effectiveAcceleration = accelerationOverrides[stats.profile] ?? stats.acceleration
    const maxSpeed = effectiveMaxSpeed * modeSpeedScale * totalPenalty
    const accelerationPower = effectiveAcceleration * modeAccelScale * boostFactor * floodSlow * bubbleBoost / mudPenalty
    
    // Boundary Enforcement: Soft boundary beyond 60 units with bounce back
    const distFromCenter = Math.sqrt(vPos.x ** 2 + vPos.z ** 2)
    const BOUNDARY_RADIUS = 60
    const boundaryDrag = distFromCenter > BOUNDARY_RADIUS ? Math.pow(distFromCenter / BOUNDARY_RADIUS, 2) : 1.0
    // Ensure minimum acceleration floor so cars don't become bricks in mud/flood (apply before boundary drag)
    const finalAcceleration = Math.max(effectiveAcceleration * 0.35, accelerationPower) / boundaryDrag
    
    // Hard boundary bounce at 60 units - push vehicle back toward center
    if (distFromCenter > BOUNDARY_RADIUS) {
      const bounceStrength = (distFromCenter - BOUNDARY_RADIUS) * 0.5
      const towardCenter = new THREE.Vector3(-vPos.x, 0, -vPos.z).normalize()
      chassisRef.current.applyImpulse({ x: towardCenter.x * bounceStrength, y: 0, z: towardCenter.z * bounceStrength }, true)
    }

    // --- MUD AHEAD WARNING ---
    // Check ahead for mud to give player warning before hitting it
    if (playerControlled && Math.abs(smoothedForward.current) > 0.1) {
      const lookAheadDistance = 12 // units ahead to check
      const lookAheadX = vPos.x + forwardDir.x * lookAheadDistance
      const lookAheadZ = vPos.z + forwardDir.z * lookAheadDistance
      const aheadSurface = getSurfaceType(lookAheadX, lookAheadZ)
      const nearMudAhead = aheadSurface === 'mud'
      
      // Only update store occasionally to avoid spam (every 200ms)
      const now = performance.now()
      if (nearMud !== nearMudAhead || now - lastMudWarningUpdate.current > 200) {
        setNearMud(nearMudAhead)
        lastMudWarningUpdate.current = now
      }
    } else if (playerControlled && nearMud) {
      setNearMud(false)
    }

    if (Math.abs(smoothedForward.current) > 0.01) {
      const forwardSpeed = velocity.x * forwardDir.x + velocity.z * forwardDir.z
      if (Math.abs(forwardSpeed) < maxSpeed || (forwardSpeed * smoothedForward.current < 0)) {
        const [nx, ny, nz] = getTerrainNormal(vPos.x, vPos.z)
        const surfaceNormal = new THREE.Vector3(nx, ny, nz)
        const surfaceForward = forwardDir.clone().sub(surfaceNormal.clone().multiplyScalar(forwardDir.dot(surfaceNormal))).normalize()
        const force = surfaceForward.multiplyScalar(smoothedForward.current * finalAcceleration * delta)
        chassisRef.current.applyImpulse({ x: force.x, y: force.y, z: force.z }, true)

        if (handling.pitchTorqueMultiplier > 0) {
          const pitchForce = -smoothedForward.current * stats.mass * handling.pitchTorqueMultiplier
          chassisRef.current.applyTorqueImpulse({
            x: rightDir.x * pitchForce,
            y: rightDir.y * pitchForce,
            z: rightDir.z * pitchForce,
          }, true)
        }
      }
    }

    // --- 4. IMPROVED STEERING ---
    const steerBoost = (isSpeedBoosted ? 1.5 : 1.0) * (isFoamBoard && physicalSubmergeDepth > 0.1 ? 1.15 : 1.0)
    if (Math.abs(smoothedTurn.current) > 0.01) {
      if (stats.steeringMode === 'car') {
        const steerStrength = stats.steerStrength * handling.steerScale * handling.carSteerResponse * delta * steerBoost
        if (speed > 0.05) {
            // Speed-proportional steering: authority DECREASES at high speed
            // steerRetention scales the curve per-vehicle (higher = more authority at speed)
            // steerRetention 1.0: full authority to ~10, ~67% at 20, ~33% at 50, ~21% at 85
            // steerRetention 1.5: full authority to ~20, ~75% at 20, ~50% at 50, ~32% at 85
            // Runtime override from control panel takes precedence if set
            const effectiveSteerRetention = steerRetentionOverrides[stats.profile] ?? stats.steerRetention
            // Raised floor: steering stays at ≥40% authority even at high speed
            // Old formula dropped to ~33% at speed=50; new formula stays ~55% at speed=50
            const speedSteerFactor = Math.max(0.4, Math.min((28 * effectiveSteerRetention) / (speed + 10), 1))
            const steerForce = rightDir.clone().multiplyScalar(smoothedTurn.current * steerStrength * speedSteerFactor)
            const fOffset = forwardDir.clone().multiplyScalar(stats.frontOffset)
            const steerPoint = { x: vPos.x + fOffset.x, y: vPos.y, z: vPos.z + fOffset.z }
            chassisRef.current.applyImpulseAtPoint({ x: steerForce.x, y: 0, z: steerForce.z }, steerPoint, true)

            if (handling.leanTorqueMultiplier > 0) {
              const leanForce = -smoothedTurn.current * stats.mass * handling.leanTorqueMultiplier * speedSteerFactor
              chassisRef.current.applyTorqueImpulse({
                x: forwardDir.x * leanForce,
                y: forwardDir.y * leanForce,
                z: forwardDir.z * leanForce,
              }, true)
            }
        } else {
             // Low-speed fallback yaw torque — raised from 0.5 so vehicles can turn in place
             chassisRef.current.applyTorqueImpulse({ x: 0, y: smoothedTurn.current * steerStrength * 1.2, z: 0 }, true)
        }
      } else if (stats.steeringMode === 'tank') {
        // Tank uses steerRetention as a flat turn-rate scale (no speed curve — tanks turn in place)
        const tankSteerRetention = steerRetentionOverrides[stats.profile] ?? stats.steerRetention
        const turnRate = stats.steerStrength * handling.steerScale * handling.tankTurnResponse * delta * steerBoost * tankSteerRetention
        chassisRef.current.applyTorqueImpulse({ x: 0, y: smoothedTurn.current * turnRate, z: 0 }, true)
      }
    }

    // --- 5. ANTI-GRAVITY ---
    if (isAntiGravity) {
      // Counter-act some gravity
      chassisRef.current.applyImpulse({ x: 0, y: stats.mass * handling.antiGravityLift * delta, z: 0 }, true)
    }

    // --- 6. DRIFT / LATERAL FRICTION ---
    if (speed > 1) {
      const sidewaysVelocity = velocity.x * rightDir.x + velocity.z * rightDir.z
      // Runtime override from control panel takes precedence if set
      const effectiveLateralGrip = lateralGripOverrides[stats.profile] ?? stats.lateralGrip
      const driftGripBase = (surfaceType === 'road' ? effectiveLateralGrip : effectiveLateralGrip * 0.80) * handling.gripScale
      const boardGripBoost = isFoamBoard && physicalSubmergeDepth > 0.1 ? 1.25 : 1.0
      // Speed-proportional grip: high-speed vehicles get more grip correction to prevent shooting off
      // At low speed grip is baseline; at high speed grip correction is stronger to reel in lateral slide
      const speedGripFactor = Math.min(1 + speed * 0.04, 2.5)
      const driftGrip = driftGripBase * boardGripBoost * speedGripFactor
      const gripImpulse = -sidewaysVelocity * driftGrip * stats.mass * delta * 15
      chassisRef.current.applyImpulse({ x: rightDir.x * gripImpulse, y: 0, z: rightDir.z * gripImpulse }, true)
    }

    // --- 7. PRO STABILIZER ---
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion)
    const targetUp = new THREE.Vector3(0, 1, 0)
    const stabilizeAxis = new THREE.Vector3().crossVectors(currentUp, targetUp)
    const stabilizeAngle = currentUp.angleTo(targetUp)

    if (stabilizeAngle > handling.stabilizerThreshold) {
      const stabilizeStrength = stats.mass * handling.stabilizerStrength * delta * stabilizeAngle
      chassisRef.current.applyTorqueImpulse({ x: stabilizeAxis.x * stabilizeStrength, y: stabilizeAxis.y * stabilizeStrength, z: stabilizeAxis.z * stabilizeStrength }, true)
    }
    
    // Damp angular velocity to prevent wild spinning
    const angvel = chassisRef.current.angvel()
    chassisRef.current.setAngvel({
      x: angvel.x * handling.angularVelocityRetention,
      y: angvel.y * handling.angularVelocityRetention,
      z: angvel.z * handling.angularVelocityRetention,
    }, true)
  })

  return { inputs, setInputs }
}
