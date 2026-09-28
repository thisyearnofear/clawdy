/**
 * scripts/trace-leg-dynamics.ts — per-tick body displacement during transit
 * legs: proves/disproves the lurch-stop oscillation hypothesis.
 * Usage: npx tsx scripts/trace-leg-dynamics.ts [leg-index]
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ArenaRunner } from '../services/arenaPolicy'
import { ArenaPhysics } from '../services/arenaPhysics'
import { applyCourseMode } from '../services/arenaCourse'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import { loadGroundedWorld } from './eval-lib'

const HERE = dirname(fileURLToPath(import.meta.url))

async function main() {
  const world = await loadGroundedWorld(join(HERE, '..'))
  const { scenario } = applyCourseMode(world.course, 'practice')
  const runner = new ArenaRunner(
    scenario,
    { champion: { strategy: 'learned', checkpoint: SEASON_0_STARTER_CHECKPOINT }, rival: 'poach' },
    new ArenaPhysics(world.collider),
  )

  // Track first two legs per agent: print per-tick displacement + whether
  // the agent is yawing (heading change) — oscillation signature.
  const tracking = new Map<string, { leg: number; last: number[]; rows: string[]; edge: string; flooded: boolean }>()
  let legsSeen = 0
  const MAX_LEGS = 4

  while (runner.peek().status !== 'finished' && legsSeen < MAX_LEGS) {
    runner.advanceTicks(1)
    const snap = runner.peek()
    for (const agent of snap.agents) {
      let t = tracking.get(agent.id)
      if (agent.transit) {
        if (!t) {
          const edge = scenario.edges.find(e => e.id === agent.transit!.edgeId)!
          t = { leg: legsSeen, last: [...agent.position], rows: [], edge: edge.id, flooded: snap.weather.flooded && edge.floodable }
          tracking.set(agent.id, t)
          t.rows.push(`-- ${agent.id} starts ${edge.id} @t${snap.tick} flooded=${t.flooded} nominal=${edge.travelTicks}t`)
        } else {
          const d = Math.hypot(agent.position[0] - t.last[0], agent.position[2] - t.last[2])
          t.rows.push(`  t${snap.tick} Δ=${d.toFixed(3)} prog=${agent.transit.progressUnits}/${agent.transit.requiredUnits} blocked=${agent.blockedTicks} grounded=${agent.grounded}`)
          t.last = [...agent.position]
        }
      } else if (t) {
        t.rows.push(`-- ${agent.id} arrived @t${snap.tick}`)
        console.log(t.rows.slice(0, 60).join('\n'))
        legsSeen++
        tracking.delete(agent.id)
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
