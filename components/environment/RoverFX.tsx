/**
 * RoverFX — ambient motion feel: dust kicks behind moving rovers and a
 * fading track trail. Same lesson as the flood water — motion reads
 * through particles. Purely cosmetic, wall-clock lifetimes.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import type { ArenaSession } from '../../services/arenaSession'
import { hash } from './WorldFX'

const DUST_POOL = 10
const DUST_LIFE = 0.75
const TRAIL_MAX = 56

function DustKicks({ session, id }: { session: ArenaSession; id: string }) {
  const group = useRef<THREE.Group>(null)
  const sprites = useRef<(THREE.Sprite | null)[]>([])
  const born = useRef<Float32Array>(new Float32Array(DUST_POOL).fill(-1))
  const next = useRef(0)
  const prev = useRef<THREE.Vector3 | null>(null)
  const lastSpawn = useRef(0)

  useFrame((state, delta) => {
    if (!group.current) return
    const ep = session.liveEpisode()
    const agent = ep.agents.find(a => a.id === id)
    if (!agent) { group.current.visible = false; return }
    group.current.visible = true
    const pos = new THREE.Vector3(agent.position[0], agent.position[1], agent.position[2])
    const speed = prev.current ? pos.distanceTo(prev.current) / Math.max(delta, 1e-4) : 0
    prev.current = pos

    // Spawn behind the wheels while actually moving.
    if (speed > 0.5 && state.clock.elapsedTime - lastSpawn.current > 0.12) {
      lastSpawn.current = state.clock.elapsedTime
      const slot = next.current % DUST_POOL
      next.current += 1
      born.current[slot] = state.clock.elapsedTime
      const sprite = sprites.current[slot]
      if (sprite) {
        sprite.position.set(
          pos.x + (hash(next.current, 1) - 0.5) * 0.3,
          pos.y + 0.06,
          pos.z + (hash(next.current, 2) - 0.5) * 0.3,
        )
      }
    }
    for (let i = 0; i < DUST_POOL; i++) {
      const sprite = sprites.current[i]
      if (!sprite || born.current[i] < 0) continue
      const t = (state.clock.elapsedTime - born.current[i]) / DUST_LIFE
      if (t >= 1) { sprite.visible = false; continue }
      sprite.visible = true
      sprite.scale.setScalar(0.14 + t * 0.4)
      sprite.position.y += delta * 0.25
      ;(sprite.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - t)
    }
  })

  return (
    <group ref={group}>
      {Array.from({ length: DUST_POOL }, (_, i) => (
        <sprite key={i} ref={el => { sprites.current[i] = el }} visible={false}>
          <spriteMaterial color="#d9c4a0" transparent opacity={0} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

/** Do not connect tyre marks across a reset, replay seek, or recovery jump. */
export function shouldResetTrail(previousTick: number, tick: number, distance: number, ready: boolean): boolean {
  return ready || tick < previousTick || distance > 2
}

/** Two fading tyre marks stamped along recent positions. */
function SandTrail({ session, id }: { session: ArenaSession; id: string }) {
  const mesh = useRef<THREE.Mesh>(null)
  // Geometry is built lazily inside the frame loop and assigned to the mesh
  // directly — the immutability lint forbids mutating hook-returned values.
  const points = useRef<THREE.Vector3[]>([])
  const lastStamp = useRef<THREE.Vector3 | null>(null)
  const lastTick = useRef(-1)

  useFrame(() => {
    if (!mesh.current) return
    const geometry = mesh.current.geometry
    if (!geometry.getAttribute('position')) {
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 4 * 3), 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 4 * 4), 4))
      const index: number[] = []
      for (let i = 0; i < TRAIL_MAX - 1; i++) {
        for (const side of [0, 2]) {
          const a = i * 4 + side
          index.push(a, a + 1, a + 4, a + 1, a + 5, a + 4)
        }
      }
      geometry.setIndex(index)
    }
    const ep = session.liveEpisode()
    const agent = ep.agents.find(a => a.id === id)
    if (!agent) { mesh.current.visible = false; return }
    const pos = new THREE.Vector3(agent.position[0], agent.position[1] + 0.025, agent.position[2])
    // A new run, replay seek, or recovery teleport must not connect two
    // unrelated positions with a streak of tyre marks.
    const ready = session.getSnapshot().phase === 'ready'
    if (shouldResetTrail(lastTick.current, ep.tick, lastStamp.current?.distanceTo(pos) ?? 0, ready)) {
      points.current = []
      lastStamp.current = null
    }
    lastTick.current = ep.tick
    if (ready) {
      mesh.current.visible = false
      return
    }
    // Stamp a point every ~0.28m of travel — dense enough for smooth turns.
    if (!lastStamp.current || pos.distanceTo(lastStamp.current) > 0.28) {
      lastStamp.current = pos.clone()
      points.current.push(pos.clone())
      if (points.current.length > TRAIL_MAX) points.current.shift()
    }
    const pts = points.current
    if (pts.length < 2) { mesh.current.visible = false; return }
    mesh.current.visible = true

    const positions = geometry.attributes.position as THREE.BufferAttribute
    const colors = geometry.attributes.color as THREE.BufferAttribute
    const c = new THREE.Color('#594736')
    for (let i = 0; i < TRAIL_MAX; i++) {
      const p = pts[Math.min(i, pts.length - 1)]
      const before = pts[Math.min(Math.max(0, i - 1), pts.length - 1)]
      const after = pts[Math.min(i + 1, pts.length - 1)]
      const dirX = after.x - before.x
      const dirZ = after.z - before.z
      const len = Math.hypot(dirX, dirZ) || 1
      const nx = -dirZ / len
      const nz = dirX / len
      const fade = i < pts.length - 1 ? Math.pow(i / (pts.length - 1), 1.4) * 0.28 : 0
      for (let side = 0; side < 2; side++) {
        const offset = side === 0 ? -0.23 : 0.23
        for (let edge = 0; edge < 2; edge++) {
          const spread = offset + (edge === 0 ? -0.035 : 0.035)
          const vertex = i * 4 + side * 2 + edge
          positions.setXYZ(vertex, p.x + nx * spread, p.y, p.z + nz * spread)
          colors.setXYZW(vertex, c.r, c.g, c.b, fade)
        }
      }
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
    geometry.setDrawRange(0, (pts.length - 1) * 12)
  })

  return (
    <mesh ref={mesh} visible={false} renderOrder={2} frustumCulled={false}>
      <bufferGeometry />
      <meshBasicMaterial vertexColors transparent opacity={1} depthWrite={false} />
    </mesh>
  )
}

export function RoverFX({ session, id }: { session: ArenaSession; id: string }) {
  return (
    <group>
      <DustKicks session={session} id={id} />
      <SandTrail session={session} id={id} />
    </group>
  )
}
