/** Route-only hot loop for CPU profiling: node --cpu-prof --import tsx scripts/bench-profile.ts */
import { resolve } from 'node:path'
import { ArenaRunner } from '../services/arenaPolicy'
import { applyCourseMode } from '../services/arenaCourse'
import { loadGroundedWorld } from './eval-lib'

async function main() {
  const world = await loadGroundedWorld(resolve(import.meta.dirname, '..'))
  const scenario = applyCourseMode(world.course, 'compete').scenario
  const play = () => new ArenaRunner(scenario, { champion: 'safe', rival: 'greedy' }).advanceTicks(scenario.durationTicks)
  for (let i = 0; i < 5; i++) play() // warm-up
  const runs = 30
  const t0 = performance.now()
  for (let i = 0; i < runs; i++) play()
  console.log(`avg ${((performance.now() - t0) / runs).toFixed(1)} ms/match (warm)`)
}
main()
