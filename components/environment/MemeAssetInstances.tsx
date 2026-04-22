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
    assets.forEach((asset, i) => {
      dummy.position.set(asset.position[0], asset.position[1], asset.position[2])
      dummy.rotation.y = state.clock.getElapsedTime() + asset.id
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
      <sphereGeometry args={[0.5, 8, 8]} />
      <meshStandardMaterial />
    </instancedMesh>
  )
}
