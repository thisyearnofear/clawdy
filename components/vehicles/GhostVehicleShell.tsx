'use client'

import * as THREE from 'three'

export function GhostVehicleShell({
  position,
  bodyColor = '#ffffff',
}: {
  position: [number, number, number]
  bodyColor?: string
}) {
  return (
    <group position={position}>
      <mesh castShadow={false} receiveShadow={false}>
        <boxGeometry args={[2.1, 0.55, 4.1]} />
        <meshStandardMaterial
          color={bodyColor}
          transparent
          opacity={0.28}
          depthWrite={false}
          roughness={1}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.45, 0]} castShadow={false}>
        <boxGeometry args={[1.5, 0.55, 2.1]} />
        <meshStandardMaterial
          color={bodyColor}
          transparent
          opacity={0.16}
          depthWrite={false}
          roughness={1}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
