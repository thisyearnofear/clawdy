/**
 * scripts/trace-edge-pin.ts — diagnostic: per-edge transit occupancy,
 * blocked ticks, and dry/flood split on the grounded practice match.
 * Usage: npx tsx scripts/trace-edge-pin.ts [edgeId]
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ArenaRunner } from '../services/arenaPolicy'
import { ArenaPhysics } from '../services/arenaPhysics'
import { applyCourseMode } from '../services/arenaCourse'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import { loadGroundedWorld } from './eval-lib'

const HERE = dirname(fileURLToPath(import.meta.url))
const FOCUS = process.argv[2] ?? 'shortcut-rb-far'

async function main() {
  const world = await loadGroundedWorld(join(HERE, '..'))
  const { scenario } = applyCourseMode(world.course, 'practice')
  const motion = new ArenaPhysics(world.collider)
  const runner = new ArenaRunner(
    scenario,
    { champion: { strategy: 'learned', checkpoint: SEASON_0_STARTER_CHECKPOINT }, rival: 'greedy' },
    motion,
  )

  // per agent: per-edge occupancy + blocked + flood split
  const occ = new Map<string, Map<string, { ticks: number; floodedTicks: number; blockedTicks: number; entries: number }>>()
  const lastEdge = new Map<string, string | null>()
  const yawFlips = new Map<string, number>()
  const lastYaw = new Map<string, number>()
  const quat2yaw = (q: number[]) => Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[0] * q[0]))

  while (runner.snapshot().status !== 'finished') {
    runner.advanceTicks(1)
    const snap = runner.snapshot()
    for (const a of snap.agents) {
      const key = `${a.id}`
      const edgeId = a.transit?.edgeId ?? null
      if (!occ.has(key)) occ.set(key, new Map())
      if (edgeId) {
        const m = occ.get(key)!
        const e = m.get(edgeId) ?? { ticks: 0, floodedTicks: 0, blockedTicks: 0, entries: 0 }
        e.ticks++
        if (snap.weather.flooded) e.floodedTicks++
        if (a.blockedTicks > 0) e.blockedTicks++
        if (lastEdge.get(key) !== edgeId) e.entries++
        m.set(edgeId, e)
      }
      lastEdge.set(key, edgeId)
      if (a.rotation) {
        const yaw = quat2yaw(a.rotation)
        const prev = lastYaw.get(key)
        if (prev !== undefined) {
          const d = Math.abs(Math.atan2(Math.sin(yaw - prev), Math.cos(yaw - prev)))
          if (d > Math.PI / 4) yawFlips.set(key, (yawFlips.get(key) ?? 0) + 1)
        }
        lastYaw.set(key, yaw)
      }
    }
  }
  motion.dispose()

  const final = runner.snapshot()
  console.log(`match tick=${final.tick} ` + final.agents.map(a => `${a.id}: banked=${a.banked} rec=${a.recoveries} blockedEdges=[${a.blockedEdges.join(',')}]`).join(' | '))
  for (const [agent, edges] of occ) {
    console.log(`\n${agent} (yawFlips>45°=${yawFlips.get(agent) ?? 0}):`)
    const sorted = [...edges.entries()].sort((a, b) => b[1].ticks - a[1].ticks)
    for (const [id, e] of sorted) {
      const mark = id === FOCUS ? ' <== FOCUS' : ''
      console.log(`  ${id}: ${e.ticks}t flooded=${e.floodedTicks}t blocked=${e.blockedTicks}t entries=${e.entries}${mark}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
