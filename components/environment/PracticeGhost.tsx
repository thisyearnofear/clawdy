'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ArenaAgentState } from '../../services/arenaEpisode'
import { RoverGeometry } from './RoverGeometry'

/**
 * The other brain, rendered where it actually was.
 *
 * This used to be a grey box with a ground ring. That was the single biggest
 * reason the comparison read as debris rather than as "the same rover, driven
 * by a different brain" — a box has no facing, so it could not visibly steer,
 * and it shared no silhouette with the live champion. It now reuses the exact
 * champion geometry and takes its quaternion from the parent's recorded pose,
 * so the two rovers start together and visibly pull apart.
 *
 * The rover body is rendered inside a group whose materials are swapped to a
 * single translucent basic material on mount. That keeps the live rover's
 * geometry (and its lighting) untouched while giving the ghost the "not quite
 * real" read. Material swapping, not a second copy of the JSX.
 */

function makeLabelTexture(text: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = '700 26px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#3f6b39'
  ctx.fillText(text.toUpperCase(), 128, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 2
  return texture
}

export function PracticeGhost({
  agent,
  label,
  accent = '#7fb069',
}: {
  agent: Pick<ArenaAgentState, 'position' | 'rotation'>
  label: string
  accent?: string
}) {
  const texture = useMemo(() => makeLabelTexture(label), [label])
  useEffect(() => () => { texture?.dispose() }, [texture])

  const body = useRef<THREE.Group>(null)

  // Swap the champion's materials for one translucent basic material once on
  // mount, and restore them on unmount so the shared geometry instance is
  // never left permanently altered.
  useEffect(() => {
    const root = body.current
    if (!root) return
    const material = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    })
    const originals: THREE.Material[] = []
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = false
      originals.push(object.material as THREE.Material)
      object.material = material
    })
    return () => {
      let index = 0
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        if (originals[index]) object.material = originals[index]
        index += 1
      })
      material.dispose()
    }
  }, [accent])

  return (
    <group position={agent.position} quaternion={agent.rotation} renderOrder={20}>
      <group ref={body}>
        <RoverGeometry color={accent} />
      </group>
      {/* Ground ring, contact darkening and label sit outside the swapped body
          so they keep their own opacity and are not double-tinted. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={20}>
        <ringGeometry args={[0.42, 0.5, 28]} />
        <meshBasicMaterial color={accent} transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} renderOrder={19}>
        <circleGeometry args={[0.4, 24]} />
        <meshBasicMaterial color="#1a352e" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      {texture && (
        <sprite position={[0, 1.05, 0]} scale={[1.5, 0.38, 1]} renderOrder={21}>
          <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
        </sprite>
      )}
    </group>
  )
}