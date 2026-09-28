/**
 * FloodTelegraph — world-space anticipation before a flood window opens.
 *
 * The schedule is fully deterministic (course.scenario.floods), so the
 * storm visibly gathers over the valley during the lead-in: a dark cloud
 * deck descends, rain streaks thicken, then hands off to FloodWater the
 * moment the window opens. Intensity is a pure function of sim tick.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import type { ArenaCourse } from '../../services/arenaCourse'
import type { ArenaSession } from '../../services/arenaSession'
import { floodFootprint } from '../../services/arenaFlood'
import { hash } from './WorldFX'

/** Ticks of storm build-up before a window opens (3s). */
const TELEGRAPH_TICKS = 60
const RAIN_STREAKS = 90

/** 0 → calm, 1 → storm breaking. Pure function of tick. */
function telegraphLevel(tick: number, floods: readonly { startTick: number; endTick: number }[], drainedUntilTick: number): number {
  const flooded = floods.some(f => f.startTick <= tick && tick < f.endTick) && drainedUntilTick <= tick
  if (flooded) return 0
  let level = 0
  for (const f of floods) {
    const lead = f.startTick - tick
    if (lead > 0 && lead <= TELEGRAPH_TICKS) {
      // Drain can hold a window closed — the storm hesitates with it.
      const heldBack = drainedUntilTick > f.startTick ? 0.4 : 1
      level = Math.max(level, (1 - lead / TELEGRAPH_TICKS) * heldBack)
    }
  }
  return level
}

export function FloodTelegraph({ session, course }: { session: ArenaSession; course: ArenaCourse }) {
  const footprint = useMemo(() => floodFootprint(course, 2.2), [course])
  const cloud = useRef<THREE.Mesh>(null)
  const rain = useRef<THREE.Points>(null)

  const rainGeometry = useMemo(() => {
    if (!footprint) return null
    const positions = new Float32Array(RAIN_STREAKS * 3)
    const vels = new Float32Array(RAIN_STREAKS)
    for (let i = 0; i < RAIN_STREAKS; i++) {
      positions[i * 3] = footprint.min[0] + hash(i, 1) * footprint.size[0]
      positions[i * 3 + 1] = 4 + hash(i, 2) * 4
      positions[i * 3 + 2] = footprint.min[1] + hash(i, 3) * footprint.size[1]
      vels[i] = 3.5 + hash(i, 4) * 2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.userData.velocities = vels
    return geo
  }, [footprint])

  useFrame((state, delta) => {
    if (!footprint || !cloud.current || !rain.current) return
    const ep = session.liveEpisode()
    const level = telegraphLevel(ep.tick, course.scenario.floods, ep.weather.drainedUntilTick)
    const visible = level > 0.02
    cloud.current.visible = visible
    rain.current.visible = visible
    if (!visible) return

    const [cx, , cz] = [
      footprint.min[0] + footprint.size[0] / 2,
      0,
      footprint.min[1] + footprint.size[1] / 2,
    ]
    cloud.current.position.set(cx, 5.2 - level * 0.9, cz)
    cloud.current.scale.set(footprint.size[0] * 0.62, 0.35, footprint.size[1] * 0.55)
    ;(cloud.current.material as THREE.MeshBasicMaterial).opacity = 0.1 + level * 0.22

    const positions = rain.current.geometry.attributes.position as THREE.BufferAttribute
    const vels = rain.current.geometry.userData.velocities as Float32Array
    for (let i = 0; i < RAIN_STREAKS; i++) {
      let y = positions.getY(i) - vels[i] * delta
      if (y < 0.2) {
        const seed = Math.floor(state.clock.elapsedTime * 1000) + i
        y = 4 + hash(seed, 5) * 3
        positions.setX(i, footprint.min[0] + hash(seed, 6) * footprint.size[0])
        positions.setZ(i, footprint.min[1] + hash(seed, 7) * footprint.size[1])
      }
      positions.setY(i, y)
    }
    positions.needsUpdate = true
    ;(rain.current.material as THREE.PointsMaterial).opacity = 0.15 + level * 0.5
    ;(rain.current.material as THREE.PointsMaterial).size = 0.06 + level * 0.05
  })

  if (!footprint || !rainGeometry) return null
  return (
    <group>
      <mesh ref={cloud} visible={false} renderOrder={6}>
        <sphereGeometry args={[1, 20, 12]} />
        <meshBasicMaterial color="#2c3540" transparent opacity={0} depthWrite={false} />
      </mesh>
      <points ref={rain} geometry={rainGeometry} visible={false} renderOrder={7} frustumCulled={false}>
        <pointsMaterial color="#9fc8d8" transparent opacity={0} size={0.06} sizeAttenuation depthWrite={false} />
      </points>
    </group>
  )
}
