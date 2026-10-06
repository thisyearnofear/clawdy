// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it, vi } from 'vitest'
import { ROVER_REST_LOCAL_Y, restShift } from '../modelGrounding'

// GLTFLoader's texture path reads `self`; geometry parsing does not need textures.
;(globalThis as { self?: unknown }).self ??= globalThis

const MODELS = {
  champion: { file: 'public/assets/mint/champion-rover.glb', position: [0, 0, 0], rotationY: 0, scale: 1 },
  scout: { file: 'public/assets/tripo/chassis-scout.glb', position: [0, 0.08, 0], rotationY: -Math.PI / 2, scale: 0.9 },
  hauler: { file: 'public/assets/tripo/chassis-hauler.glb', position: [0, -0.03, 0], rotationY: -Math.PI / 2, scale: 1 },
  raider: { file: 'public/assets/tripo/chassis-raider.glb', position: [0, -0.04, 0], rotationY: -Math.PI / 2, scale: 1 },
  rival: { file: 'public/assets/tripo/rival-rover.glb', position: [0, 0, 0], rotationY: -Math.PI / 2, scale: 1 },
} as const

describe('rover models on the ground-level pose (real GLBs)', () => {
  it.each(Object.entries(MODELS))('%s rests on the pose after the body scale', async (_name, m) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}) // texture blobs cannot decode in node
    const buf = readFileSync(resolve(import.meta.dirname, '../..', m.file))
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    const gltf = await new Promise<{ scene: THREE.Group }>((ok, fail) => new GLTFLoader().parse(ab, '', ok as never, fail))
    const model = gltf.scene.clone(true)
    model.position.set(...(m.position as [number, number, number]))
    model.rotation.set(0, m.rotationY, 0)
    model.scale.setScalar(m.scale)
    model.updateMatrixWorld(true)
    model.position.y += restShift(new THREE.Box3().setFromObject(model).min.y, ROVER_REST_LOCAL_Y)
    const body = new THREE.Group()
    body.scale.setScalar(1.35)
    body.add(model)
    const pose = new THREE.Group()
    pose.position.set(5, 1.5, -3)
    pose.add(body)
    pose.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(pose)
    expect(box.min.y).toBeCloseTo(1.5, 5)
    expect(box.max.y - box.min.y).toBeGreaterThan(0.3) // a real body, not a degenerate box
  })
})
