/**
 * scripts/trace-encounters.ts — diagnostic: how close do champion and rival
 * actually get on the grounded practice match? Reports the minimum XZ
 * distance, ticks spent inside ENCOUNTER_TRIGGER_DISTANCE, and the tick/node
 * of closest approach — i.e. whether the clash card can ever fire.
 * Usage: npx tsx scripts/trace-encounters.ts
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ArenaRunner } from '../services/arenaPolicy'
import { ArenaPhysics } from '../services/arenaPhysics'
import { applyCourseMode } from '../services/arenaCourse'
import { ENCOUNTER_TRIGGER_DISTANCE } from '../services/arenaEncounter'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import { loadGroundedWorld } from './eval-lib'

const HERE = dirname(fileURLToPath(import.meta.url))

async function main() {
  const world = await loadGroundedWorld(join(HERE, '..'))
  const { scenario } = applyCourseMode(world.course, 'practice')
  const motion = new ArenaPhysics(world.collider)
  const runner = new ArenaRunner(
    scenario,
    { champion: { strategy: 'learned', checkpoint: SEASON_0_STARTER_CHECKPOINT }, rival: (process.argv[2] as 'greedy' | 'weather' | 'poach' | undefined) ?? 'poach' },
    motion,
  )
  let minDist = Infinity
  let minTick = -1
  let inRange = 0
  let sameNode = 0
  let sameEdge = 0
  let sharedEdgeHeadOn = 0
  let convergeTicks = 0
  const arrivals: { tick: number; agent: string; node: string }[] = []
  const near: { tick: number; d: number; c: string; r: string }[] = []
  const buckets: number[] = []
  while (runner.snapshot().status !== 'finished') {
    runner.advanceTicks(1)
    const snap = runner.snapshot()
    const c = snap.agents.find(a => a.id === 'champion')!
    const r = snap.agents.find(a => a.id === 'rival')!
    const d = Math.hypot(c.position[0] - r.position[0], c.position[2] - r.position[2])
    buckets.push(d)
    if (d < minDist) { minDist = d; minTick = snap.tick }
    if (d <= ENCOUNTER_TRIGGER_DISTANCE) {
      inRange++
      near.push({ tick: snap.tick, d: +d.toFixed(2), c: c.nodeId ?? 'transit', r: r.nodeId ?? 'transit' })
    }
    if (c.nodeId && c.nodeId === r.nodeId) sameNode++
    // Convergence intent: both in transit toward the same destination node,
    // or one parked at the node the other is heading to.
    const cDest = c.transit ? scenario.edges.find(e => e.id === c.transit!.edgeId)?.to ?? null : c.nodeId
    const rDest = r.transit ? scenario.edges.find(e => e.id === r.transit!.edgeId)?.to ?? null : r.nodeId
    if (cDest && cDest === rDest) convergeTicks++
    if (c.transit && r.transit && c.transit.edgeId === r.transit.edgeId) {
      sameEdge++
      if (c.transit.from !== r.transit.from) sharedEdgeHeadOn++
    }
    for (const a of [c, r]) {
      if (a.lastOutcome?.action?.type === 'move' && a.lastOutcome.accepted && a.lastOutcome.tick === snap.tick) {
        const edge = scenario.edges.find(e => e.id === (a.lastOutcome!.action as { edgeId: string }).edgeId)
        if (edge) arrivals.push({ tick: snap.tick, agent: a.id, node: edge.to })
      }
    }
  }
  motion.dispose()
  console.log(`trigger=${ENCOUNTER_TRIGGER_DISTANCE}m minDist=${minDist.toFixed(2)}m @tick ${minTick}`)
  console.log(`ticksInRange=${inRange} sameNodeTicks=${sameNode} sameEdgeTicks=${sameEdge} headOnTicks=${sharedEdgeHeadOn} convergeDestTicks=${convergeTicks}`)
  for (const band of [3, 5, 7, 9, 12]) {
    console.log(`  ticks ≤${band}m: ${buckets.filter(b => b <= band).length}`)
  }
  // near-simultaneous arrivals at the same node (within 30 ticks)
  const contested: string[] = []
  for (const a of arrivals) {
    const other = arrivals.find(b => b.agent !== a.agent && b.node === a.node && Math.abs(b.tick - a.tick) <= 30)
    if (other) contested.push(`${a.node} @~t${Math.min(a.tick, other.tick)}`)
  }
  console.log(`contested arrivals: ${contested.length ? contested.join(', ') : 'none'}`)
  for (const n of near.slice(0, 40)) console.log(`  t${n.tick} d=${n.d} champ@${n.c} rival@${n.r}`)
}

main().catch(e => { console.error(e); process.exit(1) })
