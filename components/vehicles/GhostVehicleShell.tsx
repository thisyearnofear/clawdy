'use client'

import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export function GhostVehicleShell({
  position,
  bodyColor = '#ffffff',
}: {
  position: [number, number, number]
  bodyColor?: string
}) {
  const mat1 = useRef<THREE.MeshStandardMaterial>(null)
  const mat2 = useRef<THREE.MeshStandardMaterial>(null)
  const mat3 = useRef<THREE.MeshStandardMaterial>(null)
  const rimMat = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    const pulse = 0.15 + Math.sin(t * 2.2) * 0.08
    if (mat1.current) mat1.current.opacity = pulse + 0.08
    if (mat2.current) mat2.current.opacity = pulse
    if (mat3.current) mat3.current.opacity = pulse - 0.04
    if (rimMat.current) rimMat.current.emissiveIntensity = 0.6 + Math.sin(t * 2.2) * 0.4
  })

  return (
    <group position={position}>
      {/* Main chassis */}
      <mesh castShadow={false} receiveShadow={false}>
        <boxGeometry args={[2.1, 0.55, 4.1]} />
        <meshStandardMaterial
          ref={mat1}
          color={bodyColor}
          transparent
          opacity={0.23}
          depthWrite={false}
          roughness={0.8}
          metalness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 0.45, 0]} castShadow={false}>
        <boxGeometry args={[1.5, 0.55, 2.1]} />
        <meshStandardMaterial
          ref={mat2}
          color={bodyColor}
          transparent
          opacity={0.15}
          depthWrite={false}
          roughness={0.8}
          metalness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Roof */}
      <mesh position={[0, 0.85, 0.1]} castShadow={false}>
        <boxGeometry args={[1.3, 0.18, 1.6]} />
        <meshStandardMaterial
          ref={mat3}
          color={bodyColor}
          transparent
          opacity={0.1}
          depthWrite={false}
          roughness={0.8}
          metalness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Rim-light edge glow */}
      <mesh castShadow={false}>
        <boxGeometry args={[2.14, 0.58, 4.14]} />
        <meshStandardMaterial
          ref={rimMat}
          color={bodyColor}
          emissive={bodyColor}
          emissiveIntensity={0.6}
          transparent
          opacity={0.06}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  )
}
