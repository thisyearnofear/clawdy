'use client'

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ArenaPosition } from '../../services/arenaEpisode'

function makeLabelTexture(text: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = '600 30px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#233531'
  ctx.fillText(text, 128, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 2
  return texture
}

export function PracticeGhost({ position, label }: { position: ArenaPosition; label: string }) {
  const texture = useMemo(() => makeLabelTexture(label), [label])
  useEffect(() => () => { texture?.dispose() }, [texture])
  return (
    <group position={position} renderOrder={20}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.5]} />
        <meshBasicMaterial color="#5f8f7a" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.4, 0.48, 28]} />
        <meshBasicMaterial color="#5f8f7a" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {texture && (
        <sprite position={[0, 1.05, 0]} scale={[1.5, 0.38, 1]} renderOrder={21}>
          <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
        </sprite>
      )}
    </group>
  )
}
