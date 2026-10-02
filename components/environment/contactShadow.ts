'use client'

import * as THREE from 'three'

/**
 * Soft radial contact shadow, shared by the live rovers and the comparison
 * ghost.
 *
 * The previous implementation was a flat `circleGeometry` at constant opacity.
 * That reads as a dark disc sitting on the ground rather than as a shadow —
 * and it gets worse once the scene has image-based lighting, because the
 * ground brightens while the disc stays uniformly black.
 *
 * A radial alpha falloff is the standard cheap approximation: dense at the
 * contact point, fading to nothing at the rim, so the rover reads as grounded
 * without needing real shadow-map resolution underneath it.
 */

let cached: THREE.CanvasTexture | null = null

export function contactShadowTexture(): THREE.CanvasTexture | null {
  if (cached) return cached
  if (typeof document === 'undefined') return null
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Squared falloff concentrates opacity near the contact point rather than
  // spreading it evenly across the disc.
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(0,0,0,0.95)')
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.55)')
  gradient.addColorStop(0.75, 'rgba(0,0,0,0.18)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  // The whole point is a soft falloff; linear filtering is enough and cheaper
  // than anisotropy here.
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  cached = texture
  return texture
}