'use client'

import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { MarbleWorldConfig } from '../../services/marbleWorld'

/**
 * MarbleWorldLayer renders a Gaussian Splat scene using the Spark renderer.
 * It lazily imports @sparkjsdev/spark so the bundle stays lean when Marble is disabled.
 *
 * Props:
 *  - config: resolved MarbleWorldConfig (must have splat.url set)
 *  - visible: whether to show the splat layer (allows fade-out without unmount)
 */
interface MarbleWorldLayerProps {
  config: MarbleWorldConfig
  visible?: boolean
}

export function MarbleWorldLayer({ config, visible = true }: MarbleWorldLayerProps) {
  const { gl, scene } = useThree()
  const sparkRef = useRef<unknown>(null)
  const splatMeshRef = useRef<unknown>(null)
  const disposeRef = useRef<(() => void) | null>(null)
  const splatUrl = config.splat?.url
  const splatFormat = config.splat?.format

  useEffect(() => {
    if (!splatUrl || !splatFormat) return

    let cancelled = false

    async function init() {
      try {
        // Lazy-load Spark to avoid bundling when marble is disabled
        const { SparkRenderer, SplatMesh } = await import('@sparkjsdev/spark')

        if (cancelled) return

        // Create the Spark renderer and attach to the scene
        const spark = new SparkRenderer({
          renderer: gl,
          sortRadial: true,
          lodSplatScale: 1.0,
        })
        scene.add(spark as unknown as THREE.Object3D)
        sparkRef.current = spark

        // Create the SplatMesh from the configured URL
        const splatMesh = new SplatMesh({
          url: splatUrl,
          lod: splatFormat !== 'spz',
          paged: splatFormat === 'rad',
        })

        scene.add(splatMesh as unknown as THREE.Object3D)
        splatMeshRef.current = splatMesh

        // Cleanup function
        disposeRef.current = () => {
          scene.remove(splatMesh as unknown as THREE.Object3D)
          scene.remove(spark as unknown as THREE.Object3D)
          splatMesh.dispose()
          spark.dispose()
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[MarbleWorldLayer] Failed to load Spark/splat:', err)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      disposeRef.current?.()
      disposeRef.current = null
      sparkRef.current = null
      splatMeshRef.current = null
    }
  }, [gl, scene, splatFormat, splatUrl])

  // Toggle visibility without unmounting
  useEffect(() => {
    const mesh = splatMeshRef.current as { visible?: boolean } | null
    if (mesh && 'visible' in mesh) {
      mesh.visible = visible
    }
  }, [visible])

  return null // Spark renders via scene injection, no JSX geometry needed
}
