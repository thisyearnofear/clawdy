'use client'

import { useRef } from 'react'
import { RigidBody, CuboidCollider, RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'

export function LaunchPad({ position, target }: { position: [number, number, number], target: [number, number, number] }) {
  const rigidBody = useRef<RapierRigidBody>(null)

  const launch = (other: RapierRigidBody | undefined) => {
    if (!other) return
    const userData = other.userData as Record<string, unknown> | undefined
    if (userData?.isPlayer || userData?.agentId) {
      const direction = new THREE.Vector3(...target).sub(new THREE.Vector3(...position)).normalize()
      direction.y = 1.0 // Add upward arc
      other.applyImpulse(direction.multiplyScalar(30), true)
    }
  }

  return (
    <RigidBody ref={rigidBody} type="fixed" position={position} colliders={false}>
      <CuboidCollider args={[2, 0.5, 2]} sensor onIntersectionEnter={(p) => launch(p.other.rigidBody)} />
      <mesh>
        <cylinderGeometry args={[2, 2, 0.5, 32]} />
        <meshStandardMaterial color="#f59e0b" emissive="#b45309" emissiveIntensity={0.5} />
      </mesh>
    </RigidBody>
  )
}
