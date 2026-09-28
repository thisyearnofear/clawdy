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

/** Fading track ribbon: a flat strip stamped along recent positions. */
function SandTrail({ session, id, color }: { session: ArenaSession; id: string; color: string }) {
  const mesh = useRef<THREE.Mesh>(null)
  // Geometry is built lazily inside the frame loop and assigned to the mesh
  // directly — the immutability lint forbids mutating hook-returned values.
  const points = useRef<THREE.Vector3[]>([])
  const lastStamp = useRef<THREE.Vector3 | null>(null)

  useFrame(() => {
    if (!mesh.current) return
    const geometry = mesh.current.geometry
    if (!geometry.getAttribute('position')) {
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2 * 3), 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2 * 4), 4))
      const index: number[] = []
      for (let i = 0; i < TRAIL_MAX - 1; i++) {
        const a = i * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
      geometry.setIndex(index)
    }
    const ep = session.liveEpisode()
    const agent = ep.agents.find(a => a.id === id)
    if (!agent) { mesh.current.visible = false; return }
    const pos = new THREE.Vector3(agent.position[0], agent.position[1] + 0.025, agent.position[2])
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
    const c = new THREE.Color(color)
    const half = 0.1
    for (let i = 0; i < TRAIL_MAX; i++) {
      const p = pts[Math.min(i, pts.length - 1)]
      const nxt = pts[Math.min(i + 1, pts.length - 1)]
      const dirX = nxt.x - p.x
      const dirZ = nxt.z - p.z
      const len = Math.hypot(dirX, dirZ) || 1
      const px = (-dirZ / len) * half
      const pz = (dirX / len) * half
      const fade = i < pts.length - 1 ? Math.pow(i / (pts.length - 1), 1.4) * 0.42 : 0
      positions.setXYZ(i * 2, p.x + px, p.y, p.z + pz)
      positions.setXYZ(i * 2 + 1, p.x - px, p.y, p.z - pz)
      colors.setXYZW(i * 2, c.r, c.g, c.b, fade)
      colors.setXYZW(i * 2 + 1, c.r, c.g, c.b, fade)
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
    geometry.setDrawRange(0, (pts.length - 1) * 6)
  })

  return (
    <mesh ref={mesh} visible={false} renderOrder={2} frustumCulled={false}>
      <bufferGeometry />
      <meshBasicMaterial vertexColors transparent opacity={1} depthWrite={false} />
    </mesh>
  )
}

export function RoverFX({ session, id, trailColor }: { session: ArenaSession; id: string; trailColor: string }) {
  return (
    <group>
      <DustKicks session={session} id={id} />
      <SandTrail session={session} id={id} color={trailColor} />
    </group>
  )
}
