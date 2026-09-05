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
  onError?: (error: Error) => void
}

export function MarbleWorldLayer({ config, visible = true, onLoad, onError }: MarbleWorldLayerProps) {
  const { gl, scene } = useThree()
  const sparkRef = useRef<THREE.Object3D | null>(null)
  const splatRef = useRef<THREE.Object3D | null>(null)
  const callbacksRef = useRef({ onLoad, onError })
  const visibleRef = useRef(visible)
  const splatUrl = config.splat?.url
  const splatFormat = config.splat?.format

  useEffect(() => {
    callbacksRef.current = { onLoad, onError }
  }, [onLoad, onError])

  useEffect(() => {
    if (!splatUrl || !splatFormat) return

    let cancelled = false
    let dispose: (() => void) | undefined
    const release = () => {
      const cleanup = dispose
      dispose = undefined
      cleanup?.()
    }

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
        dispose = () => {
          scene.remove(spark as unknown as THREE.Object3D)
          spark.dispose()
        }

        // Create SplatMesh
        const splatMesh = new Spark.SplatMesh({
          url: splatUrl,
          fileType: splatFormat === 'rad' ? Spark.SplatFileType.RAD : splatFormat === 'ply' ? Spark.SplatFileType.PLY : Spark.SplatFileType.SPZ,
          paged: splatFormat === 'rad',
        })
        splatMesh.visible = visibleRef.current
        scene.add(splatMesh as unknown as THREE.Object3D)
        splatRef.current = splatMesh as unknown as THREE.Object3D
        const disposeSpark = dispose
        dispose = () => {
          scene.remove(splatMesh as unknown as THREE.Object3D)
          splatMesh.dispose()
          disposeSpark()
        }
        await splatMesh.initialized
        if (!cancelled) {
          console.log('[MarbleWorldLayer] Splat loaded successfully')
          callbacksRef.current.onLoad?.()
        }
      } catch (err) {
        if (!cancelled) {
          release()
          sparkRef.current = null
          splatRef.current = null
          console.error('[MarbleWorldLayer] Failed to load Spark/splat:', err)
          callbacksRef.current.onError?.(err instanceof Error ? err : new Error('World rendering failed'))
        }
      }
    }

    void init()

    return () => {
      cancelled = true
      release()
      sparkRef.current = null
      splatRef.current = null
    }
  }, [gl, scene, splatFormat, splatUrl])

  // Toggle visibility
  useEffect(() => {
    visibleRef.current = visible
    if (splatRef.current) splatRef.current.visible = visible
  }, [visible])

  return null
}
