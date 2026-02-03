import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import * as THREE from 'three'

interface CameraManagerProps {
  target?: THREE.Object3D | null
  active: boolean
  offset?: [number, number, number] // Offset from target
  smoothTime?: number
}

export function CameraManager({ 
  target, 
  active, 
  offset = [0, 8, 15] 
}: CameraManagerProps) {
  const controlsRef = useRef<CameraControls>(null)

  useEffect(() => {
    // Initial setup if needed
    if (controlsRef.current) {
      controlsRef.current.dollyToCursor = true
      controlsRef.current.minDistance = 5
      controlsRef.current.maxDistance = 50
    }
  }, [])

  useFrame((state, delta) => {
    if (!controlsRef.current) return

    if (active && target) {
      // 1. Get Target Position
      const currentTargetPos = target.position.clone()
      
      // 2. Calculate Ideal Camera Position
      // We want the camera to be behind the car based on its rotation?
      // Or just a fixed offset in world space if we want a "top-down-ish" view?
      // For a driving game, usually we want it relative to the car's rotation (behind it).
      
      const rotation = target.rotation
      const quaternion = new THREE.Quaternion().setFromEuler(rotation)
      
      // Calculate offset relative to car's orientation
      // If we want the camera to ALWAYS be behind, we apply quaternion.
      // But for a simple start, let's keep it "Orbit-like" but following.
      // Actually, strictly following rotation can be nauseating if the car spins.
      // A common hybrid is: Follow position strictly, but damp the rotation follow.
      
      // Let's try simple position follow first (World Space Offset)
      // const idealPos = currentTargetPos.clone().add(new THREE.Vector3(...offset))
      
      // Better: Position relative to car's "backward" direction but smoothed
      const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion)
      backward.y = 0 // Keep camera height independent of car tilt roughly
      backward.normalize()
      
      const idealPos = currentTargetPos.clone()
        .add(backward.multiplyScalar(offset[2])) // Z distance
        .add(new THREE.Vector3(0, offset[1], 0)) // Height
      
      // Smoothly interpolate current camera target to vehicle position
      // CameraControls handles the "camera position" via setLookAt
      
      // We use `setLookAt` to smoothly move the camera
      // But CameraControls `setLookAt` with `transition` might be too slow for per-frame.
      // We should use `update` implicitly, but set the position manually?
      // No, `CameraControls` is designed to be imperative.
      
      // Use standard lerp for custom follow logic
      // Ideally we disable standard controls and just set transform, 
      // OR we use CameraControls features.
      
      // Let's use `setPosition` and `setTarget` with `true` (enable transition? no, instantaneous for frame loop)
      
      const cameraPos = new THREE.Vector3()
      const cameraTarget = new THREE.Vector3()
      controlsRef.current.getPosition(cameraPos)
      controlsRef.current.getTarget(cameraTarget)
      
      // Lerp the target (look at point) to the car
      cameraTarget.lerp(currentTargetPos, delta * 5)
      
      // Lerp the position to the ideal position
      cameraPos.lerp(idealPos, delta * 2)
      
      controlsRef.current.setLookAt(
        cameraPos.x, cameraPos.y, cameraPos.z,
        cameraTarget.x, cameraTarget.y, cameraTarget.z,
        false // no transition, instant update
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
