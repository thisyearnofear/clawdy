'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MemeAssetType, MEME_ASSET_COLORS } from './MemeAssets'

interface Props {
  assets: { id: number; position: [number, number, number]; itemType?: MemeAssetType }[]
}

export function MemeAssetInstances({ assets }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.getElapsedTime()
    assets.forEach((asset, i) => {
      const bob = Math.sin(t * 2 + asset.id * 1.3) * 0.18
      const scale = 0.88 + Math.sin(t * 3 + asset.id * 0.7) * 0.1
      dummy.position.set(asset.position[0], asset.position[1] + bob, asset.position[2])
      dummy.rotation.y = t * 1.2 + asset.id
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
      
      const color = new THREE.Color(MEME_ASSET_COLORS[asset.itemType || 'meatball'])
      meshRef.current!.setColorAt(i, color)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 50]}>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshPhysicalMaterial emissive="#ffffff" emissiveIntensity={0.25} metalness={0.2} roughness={0.3} clearcoat={0.6} clearcoatRoughness={0.1} />
    </instancedMesh>
  )
}
