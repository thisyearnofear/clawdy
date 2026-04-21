'use client'

import * as THREE from 'three'

export function makeRingTexture(size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.48

  ctx.clearRect(0, 0, size, size)
  const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r)
  g.addColorStop(0.0, 'rgba(255,255,255,0.0)')
  g.addColorStop(0.65, 'rgba(255,255,255,0.0)')
  g.addColorStop(0.78, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.88, 'rgba(255,255,255,0.25)')
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearMipMapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

export function makeSoftRippleTexture(size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.48

  ctx.clearRect(0, 0, size, size)

  const g1 = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r)
  g1.addColorStop(0.0, 'rgba(255,255,255,0.0)')
  g1.addColorStop(0.55, 'rgba(255,255,255,0.00)')
  g1.addColorStop(0.72, 'rgba(255,255,255,0.65)')
  g1.addColorStop(0.82, 'rgba(255,255,255,0.25)')
  g1.addColorStop(1.0, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = g1
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  const g2 = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r * 0.55)
  g2.addColorStop(0.0, 'rgba(255,255,255,0.0)')
  g2.addColorStop(0.55, 'rgba(255,255,255,0.18)')
  g2.addColorStop(0.72, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = g2
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearMipMapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 2
  tex.needsUpdate = true
  return tex
}

