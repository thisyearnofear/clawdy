/**
 * scripts/trace-motion-quality.ts — motion-quality audit on the grounded
 * practice match. For every transit leg: nominal vs actual ticks, mid-leg
 * stall ticks (target moving but rover still), node dwell between arrival
 * and next departure, and same-edge U-turns.
 * Usage: npx tsx scripts/trace-motion-quality.ts
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ArenaRunner } from '../services/arenaPolicy'
import { ArenaPhysics } from '../services/arenaPhysics'
import { applyCourseMode } from '../services/arenaCourse'
import { ARENA_RULES } from '../services/arenaEpisode'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import { loadGroundedWorld } from './eval-lib'

const HERE = dirname(fileURLToPath(import.meta.url))

type Leg = {
  agent: string
  edgeId: string
  startTick: number
  endTick: number
  nominalTicks: number
  flooded: boolean
  stallTicks: number      // ticks where transit active but |Δpos| < 0.01m
  overshootTicks: number  // ticks where distance-to-target shrank < gained? (skipped)
}

async function main() {
  const world = await loadGroundedWorld(join(HERE, '..'))
  const { scenario } = applyCourseMode(world.course, 'practice')
  const runner = new ArenaRunner(
    scenario,
    { champion: { strategy: 'learned', checkpoint: SEASON_0_STARTER_CHECKPOINT }, rival: 'poach' },
    new ArenaPhysics(world.collider),
  )

  const legs: Leg[] = []
  const dwells: { agent: string; node: string; ticks: number }[] = []
  const reversals: { agent: string; edge: string; tick: number }[] = []
  const parked: { agent: string; from: number; to: number }[] = []
  const prev: Record<string, { pos: [number, number, number]; leg: Leg | null; lastNode: string | null; arrivedTick: number; lastEdge: string | null; parkStart: number | null }> = {}

  while (runner.peek().status !== 'finished') {
    runner.advanceTicks(1)
    const snap = runner.peek()
    for (const agent of snap.agents) {
      const state = prev[agent.id] ??= { pos: [...agent.position], leg: null, lastNode: agent.nodeId, arrivedTick: 0, lastEdge: null, parkStart: null }
      const dx = agent.position[0] - state.pos[0]
      const dz = agent.position[2] - state.pos[2]
      const moved = Math.hypot(dx, dz)

      if (agent.transit) {
        // A transit leg interrupts any open park interval — parkStart must
        // not span legs (it previously merged separate waits + legs into one
        // giant bogus park).
        if (state.parkStart !== null) {
          if (snap.tick - state.parkStart > 20) parked.push({ agent: agent.id, from: state.parkStart, to: snap.tick })
          state.parkStart = null
        }
        if (!state.leg) {
          const edge = scenario.edges.find(e => e.id === agent.transit!.edgeId)!
          const flooded = snap.weather.flooded && edge.floodable
          state.leg = {
            agent: agent.id, edgeId: edge.id, startTick: snap.tick, endTick: -1,
            nominalTicks: flooded ? edge.travelTicks * ARENA_RULES.floodTravelMultiplier : edge.travelTicks,
            flooded, stallTicks: 0, overshootTicks: 0,
          }
          if (state.lastNode !== null) {
            dwells.push({ agent: agent.id, node: state.lastNode, ticks: snap.tick - state.arrivedTick })
            if (state.lastEdge === edge.id) reversals.push({ agent: agent.id, edge: edge.id, tick: snap.tick })
          }
        }
        if (moved < 0.01) state.leg.stallTicks++
      } else {
        if (state.leg) {
          state.leg.endTick = snap.tick
          legs.push(state.leg)
          state.leg = null
          state.lastEdge = null
        }
        if (agent.nodeId && agent.nodeId !== state.lastNode) {
          state.lastNode = agent.nodeId
          state.arrivedTick = snap.tick
        }
        if (moved < 0.01) {
          if (state.parkStart === null) state.parkStart = snap.tick
        } else if (state.parkStart !== null) {
          if (snap.tick - state.parkStart > 20) parked.push({ agent: agent.id, from: state.parkStart, to: snap.tick })
          state.parkStart = null
        }
      }
      state.lastEdge = agent.transit?.edgeId ?? state.lastEdge
      state.pos = [...agent.position]
    }
  }

  console.log(`legs: ${legs.length}`)
  const byAgent: Record<string, Leg[]> = {}
  for (const leg of legs) (byAgent[leg.agent] ??= []).push(leg)
  for (const [agent, list] of Object.entries(byAgent)) {
    const ratios = list.map(l => (l.endTick - l.startTick) / l.nominalTicks)
    const stallSum = list.reduce((s, l) => s + l.stallTicks, 0)
    const durSum = list.reduce((s, l) => s + (l.endTick - l.startTick), 0)
    console.log(`\n${agent}: ${list.length} legs, ${durSum} transit ticks, ${stallSum} stall-ticks (${(100 * stallSum / durSum).toFixed(1)}% of transit)`)
    console.log(`  actual/nominal: mean ${(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2)}  p50 ${ratios.sort((a, b) => a - b)[Math.floor(ratios.length / 2)].toFixed(2)}  max ${Math.max(...ratios).toFixed(2)}`)
    const worst = [...list].sort((a, b) => (b.endTick - b.startTick) - b.nominalTicks - ((a.endTick - a.startTick) - a.nominalTicks)).slice(0, 6)
    for (const w of worst) console.log(`    ${w.edgeId} t${w.startTick}→${w.endTick} (${w.endTick - w.startTick}t, nominal ${w.nominalTicks}, flooded=${w.flooded}, stalls=${w.stallTicks})`)
  }
  const dwellList = dwells.filter(d => d.ticks > 0)
  console.log(`\nnode dwells: ${dwellList.length}, mean ${(dwellList.reduce((s, d) => s + d.ticks, 0) / Math.max(1, dwellList.length)).toFixed(1)} ticks, max ${Math.max(...dwellList.map(d => d.ticks), 0)}`)
  console.log(`U-turns over same edge: ${reversals.length}`)
  for (const r of reversals.slice(0, 10)) console.log(`  ${r.agent} ${r.edge} @t${r.tick}`)
  console.log(`parks >20 ticks: ${parked.length}`)
  for (const p of parked.slice(0, 10)) console.log(`  ${p.agent} t${p.from}→${p.to} (${p.to - p.from}t)`)
}

main().catch(e => { console.error(e); process.exit(1) })
