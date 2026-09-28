/**
 * WorldFX — world-space dramatization for deterministic match beats.
 *
 * The rules layer already produces these moments (clash resolution, drain,
 * collect, sighting, match end); this module makes them *visible in the
 * world* instead of only in cards and feed lines. All effects are
 * presentation-only: lifetimes run on wall clock, never on sim tick, so
 * they can't affect replay or scoring.
 *
 * Cue-driven beats (clash, sighting) are detected in ArenaScene — which
 * owns the pause/card — and passed down as an `fxCue` prop carrying the
 * agent positions captured at detection time. Event-driven beats (drain,
 * collect, match end) subscribe to session events directly.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import type { ArenaPosition } from '../../services/arenaEpisode'
import type { ArenaSession } from '../../services/arenaSession'

export type FxCue = {
  id: number
  kind: 'clash' | 'sighting'
  tick: number
  /** Agent positions captured at detection: id → world position. */
  positions: Record<string, ArenaPosition>
  winnerId?: string
  loserId?: string
  transferred?: number
}

const above = (p: ArenaPosition, dy: number): [number, number, number] => [p[0], p[1] + dy, p[2]]

/** Deterministic 0..1 hash — stable pseudo-randomness without Math.random
 *  (the repo's render-purity rules forbid it during render, and stable
 *  values keep particle layouts identical across re-renders anyway). */
export const hash = (i: number, k = 0) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/* ---------------------------------------------------------------- */
/* Shared bits                                                       */
/* ---------------------------------------------------------------- */

/** Expanding flat ring that fades as it grows. Lifespan in seconds. */
function PulseRing({ position, color, duration, maxRadius, onDone }: {
  position: [number, number, number]
  color: string
  duration: number
  maxRadius: number
  onDone?: () => void
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const t0 = useRef<number | null>(null)
  useFrame((state) => {
    if (!mesh.current) return
    if (t0.current === null) t0.current = state.clock.elapsedTime
    const t = (state.clock.elapsedTime - t0.current) / duration
    if (t >= 1) { onDone?.(); mesh.current.visible = false; return }
    const s = 0.15 + t * maxRadius
    mesh.current.scale.setScalar(s)
    const mat = mesh.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.75 * (1 - t)
  })
  return (
    <mesh ref={mesh} position={position} rotation={[-Math.PI / 2, 0, 0]} renderOrder={8}>
      <ringGeometry args={[0.82, 1, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

/** Bright core flash that pops and fades fast. */
function Flash({ position, color, duration = 0.5 }: { position: [number, number, number]; color: string; duration?: number }) {
  const mesh = useRef<THREE.Mesh>(null)
  const t0 = useRef<number | null>(null)
  useFrame((state) => {
    if (!mesh.current) return
    if (t0.current === null) t0.current = state.clock.elapsedTime
    const t = (state.clock.elapsedTime - t0.current) / duration
    const mat = mesh.current.material as THREE.MeshBasicMaterial
    if (t >= 1) { mesh.current.visible = false; mat.opacity = 0; return }
    mat.opacity = 0.95 * (1 - t)
    mesh.current.scale.setScalar(0.3 + t * 0.9)
  })
  return (
    <mesh ref={mesh} position={position} renderOrder={9}>
      <sphereGeometry args={[0.3, 12, 10]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
    </mesh>
  )
}

/** Small sparkle particles sprayed outward — used by collect + ceremony. */
function SparkBurst({ position, color, count = 10, speed = 1.6, duration = 0.9, fall = 1.4 }: {
  position: [number, number, number]
  color: string
  count?: number
  speed?: number
  duration?: number
  fall?: number
}) {
  const group = useRef<THREE.Group>(null)
  const t0 = useRef<number | null>(null)
  const sprites = useRef<(THREE.Sprite | null)[]>([])
  const velocities = useMemo(() => Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + hash(i, 1) * 0.6
    return new THREE.Vector3(Math.cos(angle) * speed * (0.5 + hash(i, 2) * 0.6), 1.2 + hash(i, 3) * 1.1, Math.sin(angle) * speed * (0.5 + hash(i, 4) * 0.6))
  }), [count, speed])
  useFrame((state) => {
    if (!group.current) return
    if (t0.current === null) t0.current = state.clock.elapsedTime
    const t = state.clock.elapsedTime - t0.current
    const k = Math.min(1, t / duration)
    for (let i = 0; i < count; i++) {
      const sprite = sprites.current[i]
      if (!sprite) continue
      const v = velocities[i]
      sprite.position.set(
        position[0] + v.x * t,
        position[1] + v.y * t - fall * t * t,
        position[2] + v.z * t,
      )
      const mat = sprite.material as THREE.SpriteMaterial
      mat.opacity = 1 - k
      sprite.scale.setScalar(0.09 * (1 - k * 0.5))
    }
    if (t > duration) group.current.visible = false
  })
  return (
    <group ref={group}>
      {velocities.map((_, i) => (
        <sprite key={i} ref={el => { sprites.current[i] = el }} position={position}>
          <spriteMaterial color={color} transparent opacity={1} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------------- */
/* Clash — shockwave + flash + stolen cargo arcing to the winner      */
/* ---------------------------------------------------------------- */

function ClashBurst({ cue }: { cue: FxCue }) {
  const a = cue.positions[cue.winnerId ?? 'champion']
  const b = cue.positions[cue.loserId ?? 'rival']
  if (!a || !b) return null
  const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.15, (a[2] + b[2]) / 2]
  return (
    <group>
      <PulseRing position={mid} color="#ffb14d" duration={0.9} maxRadius={2.2} />
      <PulseRing position={mid} color="#ffe08a" duration={0.55} maxRadius={1.1} />
      <Flash position={above(mid, 0.1)} color="#ffd27a" duration={0.45} />
      <CargoTransfer from={b} to={a} count={cue.transferred ?? 0} />
    </group>
  )
}

/** The stolen cores visibly fly loser → winner in a shallow arc. */
function CargoTransfer({ from, to, count }: { from: ArenaPosition; to: ArenaPosition; count: number }) {
  const group = useRef<THREE.Group>(null)
  const t0 = useRef<number | null>(null)
  const orbs = useRef<(THREE.Mesh | null)[]>([])
  useFrame((state) => {
    if (t0.current === null) t0.current = state.clock.elapsedTime
    const t = Math.min(1, (state.clock.elapsedTime - t0.current) / 1.2)
    for (let i = 0; i < orbs.current.length; i++) {
      const orb = orbs.current[i]
      if (!orb) continue
      const k = Math.min(1, Math.max(0, t * 1.3 - i * 0.15))
      const arc = Math.sin(k * Math.PI) * 0.5
      orb.position.set(
        from[0] + (to[0] - from[0]) * k,
        from[1] + 0.35 + (to[1] - from[1]) * k + arc,
        from[2] + (to[2] - from[2]) * k,
      )
      orb.rotation.y += 0.12
      const mat = orb.material as THREE.MeshStandardMaterial
      mat.opacity = k < 1 ? 1 : Math.max(0, 1 - (t - 0.9) * 10)
    }
    if (group.current && t >= 1) group.current.visible = false
  })
  if (count <= 0) return null
  return (
    <group ref={group}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} ref={el => { orbs.current[i] = el }} position={above(from, 0.35)}>
          <octahedronGeometry args={[0.11]} />
          <meshStandardMaterial color="#ffe08a" emissive="#ff9b3a" emissiveIntensity={0.6} transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------------- */
/* Sighting — twin rings + a glint line between the rovers            */
/* ---------------------------------------------------------------- */

function SightingPing({ cue }: { cue: FxCue }) {
  const points = Object.values(cue.positions)
  if (points.length < 2) return null
  const [a, b] = points
  return (
    <group>
      <PulseRing position={above(a, 0.06)} color="#8fd6e8" duration={1.2} maxRadius={1.4} />
      <PulseRing position={above(b, 0.06)} color="#8fd6e8" duration={1.2} maxRadius={1.4} />
      <GlintLine a={a} b={b} />
    </group>
  )
}

function GlintLine({ a, b }: { a: ArenaPosition; b: ArenaPosition }) {
  const ref = useRef<THREE.Line>(null)
  const t0 = useRef<number | null>(null)
  // <line> resolves to the SVG element type; <primitive> hosts THREE.Line.
  const obj = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a[0], a[1] + 0.45, a[2]),
      new THREE.Vector3(b[0], b[1] + 0.45, b[2]),
    ])
    const material = new THREE.LineBasicMaterial({ color: '#bfeaf4', transparent: true, opacity: 0.85, depthWrite: false })
    const line = new THREE.Line(geometry, material)
    line.renderOrder = 8
    line.frustumCulled = false
    line.visible = false
    return line
  }, [a, b])
  useEffect(() => () => {
    obj.geometry.dispose()
    ;(obj.material as THREE.Material).dispose()
  }, [obj])
  useFrame((state) => {
    if (!ref.current) return
    if (t0.current === null) {
      t0.current = state.clock.elapsedTime
      ref.current.visible = true
    }
    const t = (state.clock.elapsedTime - t0.current) / 1.4
    const mat = ref.current.material as THREE.LineBasicMaterial
    if (t >= 1) { ref.current.visible = false; return }
    mat.opacity = 0.85 * Math.max(0, 1 - t)
  })
  return <primitive object={obj} ref={ref} />
}

/* ---------------------------------------------------------------- */
/* Drain — beam + ring from the caster as the water pulls back        */
/* ---------------------------------------------------------------- */

function DrainBeam({ position }: { position: [number, number, number] }) {
  const mesh = useRef<THREE.Mesh>(null)
  const t0 = useRef<number | null>(null)
  useFrame((state) => {
    if (!mesh.current) return
    if (t0.current === null) t0.current = state.clock.elapsedTime
    const t = (state.clock.elapsedTime - t0.current) / 0.9
    const mat = mesh.current.material as THREE.MeshBasicMaterial
    if (t >= 1) { mesh.current.visible = false; return }
    mat.opacity = 0.6 * (1 - t)
    mesh.current.scale.set(1 - t * 0.7, 1, 1 - t * 0.7)
  })
  return (
    <mesh ref={mesh} position={[position[0], position[1] + 1.6, position[2]]} renderOrder={8}>
      <cylinderGeometry args={[0.06, 0.14, 3.2, 10, 1, true]} />
      <meshBasicMaterial color="#7fe8d4" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

type Burst = { id: number; position: [number, number, number]; kind: 'drain' | 'collect' }

/** Subscribes to accepted drain/collect outcomes and drops short-lived FX. */
function ActionBursts({ session, course }: { session: ArenaSession; course: { scenario: { nodes: { id: string; position: ArenaPosition }[] } } }) {
  const [bursts, setBursts] = useState<Burst[]>([])
  const seq = useRef(0)

  useEffect(() => {
    const listener = (event: { agentId: string; action: { type: string; resourceId?: string } | null; accepted: boolean }) => {
      if (!event.accepted || !event.action) return
      const snap = session.liveEpisode()
      const agent = snap.agents.find(a => a.id === event.agentId)
      if (event.action.type === 'drain' && agent) {
        const position = above(agent.position, 0.1)
        // Cap the pool so a fast-forwarded flood of events can't pile up.
        setBursts(prev => [...prev.slice(-7), { id: ++seq.current, kind: 'drain', position }])
      } else if (event.action.type === 'collect') {
        const res = snap.resources.find(r => r.id === event.action!.resourceId)
        const node = res ? course.scenario.nodes.find(n => n.id === res.nodeId) : null
        if (node && agent) {
          const position = above(node.position, 0.4)
          setBursts(prev => [...prev.slice(-7), { id: ++seq.current, kind: 'collect', position }])
        }
      }
    }
    session.on('action_result', listener)
    return () => session.off('action_result', listener)
  }, [session, course])

  return (
    <group>
      {bursts.map(burst => burst.kind === 'drain'
        ? <group key={burst.id}>
            <DrainBeam position={burst.position} />
            <PulseRing position={burst.position} color="#7fe8d4" duration={0.8} maxRadius={1.6} />
            <SparkBurst position={burst.position} color="#a8f0de" count={8} duration={0.7} />
          </group>
        : <group key={burst.id}>
            <SparkBurst position={burst.position} color="#ffd27a" count={10} />
            <PulseRing position={above(burst.position, -0.3)} color="#ffb14d" duration={0.5} maxRadius={0.8} />
          </group>,
      )}
    </group>
  )
}

/* ---------------------------------------------------------------- */
/* Ceremony — confetti rain over the winner on match end              */
/* ---------------------------------------------------------------- */

const CONFETTI_COLORS = ['#ffd27a', '#8fd6e8', '#ff9d6b', '#c8f0a8', '#e8b8ff']

function CeremonyRain({ position }: { position: [number, number, number] }) {
  const group = useRef<THREE.Group>(null)
  const t0 = useRef<number | null>(null)
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const pieces = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    vx: (hash(i, 1) - 0.5) * 2.4,
    vy: 2.2 + hash(i, 2) * 1.8,
    vz: (hash(i, 3) - 0.5) * 2.4,
    spin: 3 + hash(i, 4) * 6,
    ox: (hash(i, 5) - 0.5) * 0.6,
    oz: (hash(i, 6) - 0.5) * 0.6,
  })), [])
  useFrame((state, delta) => {
    if (!group.current) return
    if (t0.current === null) t0.current = state.clock.elapsedTime
    const t = state.clock.elapsedTime - t0.current
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]
      const mesh = meshes.current[i]
      if (!mesh) continue
      mesh.position.x += piece.vx * delta
      mesh.position.y += (piece.vy - t * 3.4) * delta
      mesh.position.z += piece.vz * delta
      mesh.rotation.x += piece.spin * delta
      mesh.rotation.z += piece.spin * 0.7 * delta
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = Math.max(0, 1 - t / 2.6)
    }
    if (t > 2.6) group.current.visible = false
  })
  return (
    <group ref={group}>
      {pieces.map((piece, i) => (
        <mesh key={i} ref={el => { meshes.current[i] = el }} position={[position[0] + piece.ox, position[1] + 0.8, position[2] + piece.oz]}>
          <planeGeometry args={[0.07, 0.05]} />
          <meshBasicMaterial color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]} transparent side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function MatchEndCeremony({ session }: { session: ArenaSession }) {
  const [wins, setWins] = useState<{ id: number; position: [number, number, number] }[]>([])
  const seq = useRef(0)
  useEffect(() => {
    const listener = (event: { score: Record<string, number> }) => {
      const snap = session.liveEpisode()
      const entries = Object.entries(event.score)
      if (entries.length === 0) return
      const winner = entries.reduce((best, e) => (e[1] > best[1] ? e : best))
      const agent = snap.agents.find(a => a.id === winner[0])
      if (agent) setWins(prev => [...prev, { id: ++seq.current, position: above(agent.position, 0.3) }])
    }
    session.on('match_end', listener)
    return () => session.off('match_end', listener)
  }, [session])
  return (
    <group>
      {wins.map(win => <CeremonyRain key={win.id} position={win.position} />)}
    </group>
  )
}

/* ---------------------------------------------------------------- */

export function WorldFX({ session, course, cue }: {
  session: ArenaSession
  course: { scenario: { nodes: { id: string; position: ArenaPosition }[] } }
  cue: FxCue | null
}) {
  return (
    <group>
      {cue?.kind === 'clash' && <ClashBurst key={cue.id} cue={cue} />}
      {cue?.kind === 'sighting' && <SightingPing key={cue.id} cue={cue} />}
      <ActionBursts session={session} course={course} />
      <MatchEndCeremony session={session} />
    </group>
  )
}
