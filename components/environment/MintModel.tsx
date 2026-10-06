import { useLoader } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import type { MintAssetTransform } from '../../services/mintAssets'
import { restShift } from '../../services/modelGrounding'

// Shared Draco decoder for all Mint-generated GLBs. The decoder is lazy-loaded
// from the Mint CDN the first time a Draco-compressed model is encountered.
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://cdn.mint.gg/runtime/draco/gltf/three-0.184.0/')

type MintModelProps = {
  url: string
  transform?: MintAssetTransform
  tint?: string
  /**
   * Local y at which the model's lowest point should rest. Generated models are
   * centred on their bounds, so without this the body sits half its height
   * below the ground-level pose and the wheels sink into the terrain.
   */
  restY?: number
}

function applyTransform(scene: THREE.Group, transform: MintAssetTransform) {
  scene.position.set(...transform.position)
  scene.rotation.set(...transform.rotation)
  scene.scale.set(...transform.scale)
}

export function MintModel({ url, transform, tint, restY }: MintModelProps) {
  const gltf = useLoader(GLTFLoader, url, (loader: GLTFLoader) => {
    loader.setDRACOLoader(dracoLoader)
  })
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true)
    if (transform) applyTransform(cloned, transform)
    if (restY !== undefined) {
      cloned.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(cloned)
      cloned.position.y += restShift(box.min.y, restY)
    }
    if (tint) {
      const tintColor = new THREE.Color(tint)
      cloned.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return
        const source = Array.isArray(obj.material) ? obj.material : [obj.material]
        const next = source.map((material) => {
          const clonedMaterial = material.clone()
          if ('color' in clonedMaterial && clonedMaterial.color instanceof THREE.Color) {
            clonedMaterial.color.lerp(tintColor, 0.55)
          }
          return clonedMaterial
        })
        obj.material = next.length === 1 ? next[0] : next
      })
    }
    return cloned
  }, [gltf, tint, transform, restY])
  return <primitive object={scene} />
}
