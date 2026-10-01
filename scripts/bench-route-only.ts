/**
 * Day-1 spike: how fast is a route-only match, and does it agree with the
 * physics-backed match on the same scenario? Informs where the ladder runs.
 *
 *   npx tsx scripts/bench-route-only.ts
 */
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { ArenaRunner, type EntrantPolicyOption } from '../services/arenaPolicy'
import { ArenaPhysics } from '../services/arenaPhysics'
import { applyCourseMode } from '../services/arenaCourse'
import { generateCourseFamily } from '../services/courseFamily'
import { loadGroundedWorld } from './eval-lib'
import type { ArenaScenario } from '../services/arenaEpisode'

function play(scenario: ArenaScenario, a: EntrantPolicyOption, b: EntrantPolicyOption, motion?: ArenaPhysics) {
  const runner = new ArenaRunner(scenario, { champion: a, rival: b }, motion)
  runner.advanceTicks(scenario.durationTicks)
  const snap = runner.snapshot()
  const by = (id: string) => snap.agents.find(agent => agent.id === id)!
  return { champion: by('champion').banked, rival: by('rival').banked, winner: snap.winner }
}

async function main() {
  const world = await loadGroundedWorld(resolve(import.meta.dirname, '..'))
  const scenarios: ArenaScenario[] = [
    applyCourseMode(world.course, 'compete').scenario,
    ...generateCourseFamily(world.collider).map(layout => layout.scenario),
  ]
  const pairs: [EntrantPolicyOption, EntrantPolicyOption][] = [['safe', 'greedy'], ['greedy', 'safe'], ['weather', 'greedy']]

  let routeMs = 0, routeRuns = 0, agree = 0, compared = 0
  for (const scenario of scenarios) {
    for (const [a, b] of pairs) {
      const t0 = performance.now()
      const route = play(scenario, a, b)
      routeMs += performance.now() - t0
      routeRuns++
      const motion = new ArenaPhysics(world.collider)
      try {
        const physics = play(scenario, a, b, motion)
        compared++
        if (physics.winner === route.winner) agree++
        console.log(`${scenario.id} ${String(a)}-v-${String(b)} route ${route.champion}:${route.rival} physics ${physics.champion}:${physics.rival}`)
      } finally {
        motion.dispose()
      }
    }
  }
  console.log(`route-only: ${routeRuns} matches, avg ${(routeMs / routeRuns).toFixed(1)} ms`)
  console.log(`winner agreement route vs physics: ${agree}/${compared}`)
}

main().catch(error => { console.error(error); process.exit(1) })
