import { useLoader } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import type { MintAssetTransform } from '../../services/mintAssets'

// Shared Draco decoder for all Mint-generated GLBs. The decoder is lazy-loaded
// from the Mint CDN the first time a Draco-compressed model is encountered.
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://cdn.mint.gg/runtime/draco/gltf/three-0.184.0/')

type MintModelProps = {
  url: string
  transform?: MintAssetTransform
}

function applyTransform(scene: THREE.Group, transform: MintAssetTransform) {
  scene.position.set(...transform.position)
  scene.rotation.set(...transform.rotation)
  scene.scale.set(...transform.scale)
}

export function MintModel({ url, transform }: MintModelProps) {
  const gltf = useLoader(GLTFLoader, url, (loader: GLTFLoader) => {
    loader.setDRACOLoader(dracoLoader)
  })
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone()
    if (transform) {
      applyTransform(cloned, transform)
    }
    return cloned
  }, [gltf, transform])
  return <primitive object={scene} />
}
