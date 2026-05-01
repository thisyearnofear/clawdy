'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
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

const MODE_CONFIG = {
  chase: { distMult: 1.0, heightMult: 1.0 },
  wide: { distMult: 2.0, heightMult: 1.6 },
  hood: { distMult: 0.5, heightMult: 0.4 },
  free: { distMult: 1.0, heightMult: 1.0 },
} as const

export function CameraManager({
  target,
  targetRef,
  active,
  mode = 'spectator',
  intensity = 0,
  offset = [0, 8, 15],
}: CameraManagerProps) {
  const { camera } = useThree()
  const targetPos = useRef(new THREE.Vector3())
  const backward = useRef(new THREE.Vector3())
  const smoothedBackward = useRef(new THREE.Vector3(0, 0, 1))
  const quaternion = useRef(new THREE.Quaternion())
  const upOffset = useRef(new THREE.Vector3())
  const idealPos = useRef(new THREE.Vector3())
  const lookAtTarget = useRef(new THREE.Vector3())
  const shakeVec = useRef(new THREE.Vector3())

  const lookYawOffset = useRef(0)
  const isRightMouseDown = useRef(false)
  const lastMouseX = useRef(0)

  const cameraShake = useGameStore(s => s.cameraShake)
  const cameraMode = useGameStore(s => s.ui.cameraMode)

  const followSpeed = mode === 'active' ? 4.5 : 2.2
  const targetLerpSpeed = mode === 'active' ? 7 : 4
  const weatherBoost = 1 + Math.min(0.2, Math.max(0, intensity) * 0.15)

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 2) {
      isRightMouseDown.current = true
      lastMouseX.current = e.clientX
    }
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

  useFrame((_, delta) => {
    if (!isRightMouseDown.current && Math.abs(lookYawOffset.current) > 0.001) {
      lookYawOffset.current *= Math.max(0, 1 - delta * 6)
    }
  })

  useFrame((_, delta) => {
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

    const lookDir = smoothedBackward.current.clone()
    if (Math.abs(lookYawOffset.current) > 0.001) {
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lookYawOffset.current)
      lookDir.applyQuaternion(yawQuat)
    }

    const trailingDistance = (mode === 'active' ? offset[2] : offset[2] + 4) * distMult
    const followHeight = (mode === 'active' ? offset[1] : offset[1] + 2) * heightMult

    idealPos.current
      .copy(targetPos.current)
      .add(lookDir.multiplyScalar(trailingDistance))
      .add(upOffset.current.set(0, followHeight, 0))

    lookAtTarget.current.lerp(targetPos.current, delta * targetLerpSpeed * weatherBoost)
    camera.position.lerp(idealPos.current, delta * followSpeed * weatherBoost)

    if (cameraShake.until > Date.now() && cameraShake.intensity > 0) {
      const amp = 0.12 * cameraShake.intensity
      shakeVec.current.set(
        (Math.random() - 0.5) * amp,
        (Math.random() - 0.5) * amp,
        (Math.random() - 0.5) * amp,
      )
      camera.position.add(shakeVec.current)
    }

    camera.lookAt(lookAtTarget.current)
    camera.updateMatrixWorld()
  })

  return null
}
