import { useRef, useEffect } from 'react'
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
  offset?: [number, number, number] // Offset from target
  smoothTime?: number
}

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
  const quaternion = useRef(new THREE.Quaternion())
  const upOffset = useRef(new THREE.Vector3())
  const shakeVec = useRef(new THREE.Vector3())

  const cameraShake = useGameStore(s => s.cameraShake)

  const followSpeed = mode === 'active' ? 3.2 : 1.9
  const targetLerpSpeed = mode === 'active' ? 6 : 3.6
  const weatherBoost = 1 + Math.min(0.5, Math.max(0, intensity) * 0.4)

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

  useFrame((state, delta) => {
    if (!controlsRef.current) return

    const activeTarget = targetRef?.current ?? target

    if (active && activeTarget) {
      const translation = activeTarget.translation()
      targetPos.current.set(translation.x, translation.y, translation.z)
      const rotation = activeTarget.rotation()
      quaternion.current.set(rotation.x, rotation.y, rotation.z, rotation.w)

      backward.current.set(0, 0, 1).applyQuaternion(quaternion.current)
      backward.current.y = 0
      backward.current.normalize()

      const trailingDistance = mode === 'active' ? offset[2] : offset[2] + 4
      const followHeight = mode === 'active' ? offset[1] : offset[1] + 2
      const idealPos = targetPos.current.clone()
        .add(backward.current.multiplyScalar(trailingDistance))
        .add(upOffset.current.set(0, followHeight, 0))

      controlsRef.current.getPosition(cameraPos.current)
      controlsRef.current.getTarget(cameraTarget.current)

      cameraTarget.current.lerp(targetPos.current, delta * targetLerpSpeed * weatherBoost)
      cameraPos.current.lerp(idealPos, delta * followSpeed * weatherBoost)

      // Micro-shake for impact moments (lead change, final rush, etc.)
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
    }
  })

  return (
    <CameraControls 
      ref={controlsRef} 
      enabled={!active} // Disable manual controls when active (driving)
      makeDefault 
    />
  )
}
