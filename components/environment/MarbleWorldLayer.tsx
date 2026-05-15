'use client'

import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { extend } from '@react-three/fiber'
import * as THREE from 'three'
import type { MarbleWorldConfig } from '../../services/marbleWorld'

// Lazy-loaded Spark classes — we extend them into R3F's JSX namespace
let sparkExtended = false

/**
 * MarbleWorldLayer renders a Gaussian Splat scene using the Spark renderer.
 * Uses the official R3F `extend()` pattern from sparkjsdev/spark-react-r3f.
 *
 * Props:
 *  - config: resolved MarbleWorldConfig (must have splat.url set)
 *  - visible: whether to show the splat layer
 *  - onLoad: callback when splat finishes loading
 */
interface MarbleWorldLayerProps {
  config: MarbleWorldConfig
  visible?: boolean
  onLoad?: () => void
}

export function MarbleWorldLayer({ config, visible = true, onLoad }: MarbleWorldLayerProps) {
  const { gl, scene } = useThree()
  const sparkRef = useRef<THREE.Object3D | null>(null)
  const splatRef = useRef<THREE.Object3D | null>(null)
  const disposeRef = useRef<(() => void) | null>(null)
  const splatUrl = config.splat?.url
  const splatFormat = config.splat?.format

  useEffect(() => {
    if (!splatUrl || !splatFormat) return

    let cancelled = false

    async function init() {
      try {
        const Spark = await import('@sparkjsdev/spark')

        if (cancelled) return

        // Extend R3F JSX namespace (idempotent)
        if (!sparkExtended) {
          extend({ SparkRenderer: Spark.SparkRenderer, SplatMesh: Spark.SplatMesh })
          sparkExtended = true
        }

        // Create SparkRenderer
        const spark = new Spark.SparkRenderer({
          renderer: gl,
          sortRadial: true,
          lodSplatScale: 1.0,
        })
        scene.add(spark as unknown as THREE.Object3D)
        sparkRef.current = spark as unknown as THREE.Object3D

        // Create SplatMesh
        const splatMesh = new Spark.SplatMesh({
          url: splatUrl,
          lod: splatFormat === 'rad',
          paged: splatFormat === 'rad',
          onLoad: () => {
            if (!cancelled) {
              console.log('[MarbleWorldLayer] Splat loaded successfully')
              onLoad?.()
            }
          },
        })
        scene.add(splatMesh as unknown as THREE.Object3D)
        splatRef.current = splatMesh as unknown as THREE.Object3D

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
      splatRef.current = null
    }
  }, [gl, scene, splatFormat, splatUrl, onLoad])

  // Toggle visibility
  useEffect(() => {
    if (splatRef.current) splatRef.current.visible = visible
  }, [visible])

  return null
}
