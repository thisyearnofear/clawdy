'use client'
import { useRef, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import { useGameStore } from '../../services/gameStore'

interface CameraManagerProps {
  target?: RapierRigidBody | null
  targetRef?: React.RefObject<RapierRigidBody | null>
  active: boolean
  mode?: 'spectator' | 'active'
  intensity?: number
  offset?: [number, number, number]
  smoothTime?: number
}

// Per-mode distance/height multipliers
const MODE_CONFIG = {
  chase: { distMult: 1.0, heightMult: 1.0 },
  wide:  { distMult: 2.0, heightMult: 1.6 },
  hood:  { distMult: 0.5, heightMult: 0.4 },
  free:  { distMult: 1.0, heightMult: 1.0 },
} as const

export function CameraManager({ 
  target, 
  targetRef,
  active, 
  mode = 'spectator',
  intensity = 0,
  offset = [0, 8, 15] 
}: CameraManagerProps) {
  const controlsRef = useRef<CameraControls>(null)
  const cameraPos = useRef(new THREE.Vector3())
  const cameraTarget = useRef(new THREE.Vector3())
  const targetPos = useRef(new THREE.Vector3())
  const backward = useRef(new THREE.Vector3())
  const smoothedBackward = useRef(new THREE.Vector3(0, 0, 1))
  const quaternion = useRef(new THREE.Quaternion())
  const upOffset = useRef(new THREE.Vector3())
  const shakeVec = useRef(new THREE.Vector3())

  // Look-ahead: right-mouse drag yaw offset
  const lookYawOffset = useRef(0)
  const isRightMouseDown = useRef(false)
  const lastMouseX = useRef(0)

  const cameraShake = useGameStore(s => s.cameraShake)
  const cameraMode = useGameStore(s => s.ui.cameraMode)

  const followSpeed = mode === 'active' ? 4.5 : 2.2
  const targetLerpSpeed = mode === 'active' ? 7 : 4
  const weatherBoost = 1 + Math.min(0.2, Math.max(0, intensity) * 0.15)

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 2) { isRightMouseDown.current = true; lastMouseX.current = e.clientX }
  }, [])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isRightMouseDown.current) return
    const dx = e.clientX - lastMouseX.current
    lastMouseX.current = e.clientX
    lookYawOffset.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, lookYawOffset.current + dx * 0.003))
  }, [])

  const onMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 2) isRightMouseDown.current = false
  }, [])

  const onContextMenu = useCallback((e: Event) => {
    if (active && cameraMode !== 'free') e.preventDefault()
  }, [active, cameraMode])

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.dollyToCursor = false
      controlsRef.current.minDistance = 8
      controlsRef.current.maxDistance = 120
      controlsRef.current.dollySpeed = 3
      controlsRef.current.truckSpeed = 2
      controlsRef.current.smoothTime = 0.15
      controlsRef.current.draggingSmoothTime = 0.1
    }
  }, [])

  useEffect(() => {
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [onMouseDown, onMouseMove, onMouseUp, onContextMenu])

  // Snap look offset back to centre when right mouse released
  useFrame((_, delta) => {
    if (!isRightMouseDown.current && Math.abs(lookYawOffset.current) > 0.001) {
      lookYawOffset.current *= Math.max(0, 1 - delta * 6)
    }
  })

  useFrame((state, delta) => {
    if (!controlsRef.current) return
    const activeTarget = targetRef?.current ?? target
    if (!active || !activeTarget || cameraMode === 'free') return

    const { distMult, heightMult } = MODE_CONFIG[cameraMode]

    const translation = activeTarget.translation()
    targetPos.current.set(translation.x, translation.y, translation.z)
    const rotation = activeTarget.rotation()
    quaternion.current.set(rotation.x, rotation.y, rotation.z, rotation.w)

    backward.current.set(0, 0, 1).applyQuaternion(quaternion.current)
    backward.current.y = 0
    backward.current.normalize()

    const yawLerpSpeed = mode === 'active' ? 4.5 : 2.5
    smoothedBackward.current.lerp(backward.current, delta * yawLerpSpeed)
    smoothedBackward.current.y = 0
    smoothedBackward.current.normalize()

    // Apply look-ahead yaw offset (right-mouse drag), snap back when released
    const lookDir = smoothedBackward.current.clone()
    if (Math.abs(lookYawOffset.current) > 0.001) {
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lookYawOffset.current)
      lookDir.applyQuaternion(yawQuat)
    }

    const trailingDistance = (mode === 'active' ? offset[2] : offset[2] + 4) * distMult
    const followHeight = (mode === 'active' ? offset[1] : offset[1] + 2) * heightMult
    const idealPos = targetPos.current.clone()
      .add(lookDir.clone().multiplyScalar(trailingDistance))
      .add(upOffset.current.set(0, followHeight, 0))

    controlsRef.current.getPosition(cameraPos.current)
    controlsRef.current.getTarget(cameraTarget.current)

    cameraTarget.current.lerp(targetPos.current, delta * targetLerpSpeed * weatherBoost)
    cameraPos.current.lerp(idealPos, delta * followSpeed * weatherBoost)

    if (cameraShake.until > Date.now() && cameraShake.intensity > 0) {
      const amp = 0.12 * cameraShake.intensity
      shakeVec.current.set(
        (Math.random() - 0.5) * amp,
        (Math.random() - 0.5) * amp,
        (Math.random() - 0.5) * amp
      )
      cameraPos.current.add(shakeVec.current)
    }

    controlsRef.current.setLookAt(
      cameraPos.current.x, cameraPos.current.y, cameraPos.current.z,
      cameraTarget.current.x, cameraTarget.current.y, cameraTarget.current.z,
      false
    )
  })

  return (
    <CameraControls 
      ref={controlsRef} 
      enabled={!active || cameraMode === 'free'}
      makeDefault 
    />
  )
}
