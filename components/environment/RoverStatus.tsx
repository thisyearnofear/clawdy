/**
 * RoverStatus — persistent per-rover legibility layer.
 *
 * Turns silent episode state into readable world visuals:
 *   - recharging: parked + energy below cap → pulsing charge ring
 *   - staggered: staggeredUntilTick > tick → amber sparks + chassis wobble
 *   - cargo: carried cores stacked visibly on the chassis; under a ruleset
 *     perk the empty slots show too, so a bigger load bed reads at a glance
 *   - struggling: blockedTicks climbing → jitter (recovery is real now)
 *
 * All driven from the live episode snapshot each frame — purely cosmetic.
 */
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import type { ArenaSession } from '../../services/arenaSession'
import { ARENA_RULES } from '../../services/arenaEpisode'
import { cargoSlots, slotOffset } from '../../services/ruleLegibility'

function ChargeRing({ color }: { color: string }) {
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!mesh.current) return
    const t = (state.clock.elapsedTime % 1.4) / 1.4
    mesh.current.scale.setScalar(0.35 + t * 0.55)
    const mat = mesh.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.55 * (1 - t)
  })
  return (
    <mesh ref={mesh} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={7}>
      <ringGeometry args={[0.78, 1, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function StaggerSparks() {
  const group = useRef<THREE.Group>(null)
  const sparks = useRef<THREE.Sprite[]>([])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    sparks.current.forEach((spark, i) => {
      if (!spark) return
      const phase = (t * 1.6 + i * 0.7) % 1
      const angle = i * 2.4 + t * 2
      spark.position.set(Math.cos(angle) * 0.3, 0.45 + phase * 0.35, Math.sin(angle) * 0.3)
      const mat = spark.material as THREE.SpriteMaterial
      mat.opacity = 0.9 * (1 - phase)
      spark.scale.setScalar(0.07)
    })
  })
  return (
    <group ref={group}>
      {[0, 1, 2].map(i => (
        <sprite key={i} ref={el => { sparks.current[i] = el! }}>
          <spriteMaterial color="#ffb14d" transparent opacity={0.8} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

/**
 * Carried cores stacked on the chassis — the bank-run tension made visible.
 * `drawn` slots are rendered; the first `filled` hold a core and the rest are
 * wireframe outlines (only drawn when the rover has a ruleset perk).
 */
function CargoStack({ filled, drawn }: { filled: number; drawn: number }) {
  return (
    <group position={[0, 0.42, 0]}>
      {Array.from({ length: drawn }, (_, i) => {
        const [x, y] = slotOffset(i)
        return i < filled ? (
          <mesh key={i} position={[x, y, 0]}>
            <octahedronGeometry args={[0.07]} />
            <meshStandardMaterial color="#ffe08a" emissive="#ff9b3a" emissiveIntensity={0.5} metalness={0.4} roughness={0.3} />
          </mesh>
        ) : (
          <mesh key={i} position={[x, y, 0]}>
            <octahedronGeometry args={[0.07]} />
            <meshBasicMaterial color="#ffe08a" wireframe transparent opacity={0.4} depthWrite={false} />
          </mesh>
        )
      })}
    </group>
  )
}

export function RoverStatus({ session, id, tint }: { session: ArenaSession; id: string; tint: string }) {
  const group = useRef<THREE.Group>(null)
  const wobble = useRef<THREE.Group>(null)
  const [flags, setFlags] = useState({ charging: false, staggered: false, struggling: false, filled: 0, drawn: 0 })

  useFrame((state3f) => {
    if (!group.current) return
    const ep = session.liveEpisode()
    const agent = ep.agents.find(a => a.id === id)
    if (!agent) { group.current.visible = false; return }
    group.current.visible = true
    group.current.position.set(agent.position[0], agent.position[1], agent.position[2])

    const charging = !agent.transit && agent.energy < ARENA_RULES.initialEnergy - 0.6
    const staggered = agent.staggeredUntilTick > ep.tick
    const struggling = agent.blockedTicks > 8
    const slots = cargoSlots(agent)
    setFlags(prev =>
      prev.charging === charging && prev.staggered === staggered &&
      prev.struggling === struggling && prev.filled === slots.filled && prev.drawn === slots.drawn
        ? prev
        : { charging, staggered, struggling, filled: slots.filled, drawn: slots.drawn })

    // Stagger/struggle wobble — sell the physical penalty on the chassis.
    if (wobble.current) {
      if (staggered || struggling) {
        const amp = staggered ? 0.06 : 0.035
        wobble.current.rotation.z = Math.sin(state3f.clock.elapsedTime * (staggered ? 26 : 18)) * amp
        wobble.current.rotation.x = Math.cos(state3f.clock.elapsedTime * 21) * amp * 0.6
      } else {
        wobble.current.rotation.z *= 0.8
        wobble.current.rotation.x *= 0.8
      }
    }
  })

  return (
    <group ref={group}>
      <group ref={wobble}>
        {flags.charging && <ChargeRing color={tint} />}
        {flags.staggered && <StaggerSparks />}
        <CargoStack filled={flags.filled} drawn={flags.drawn} />
      </group>
    </group>
  )
}
