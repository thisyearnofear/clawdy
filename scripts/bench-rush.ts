/**
 * Does Rush produce contested, close games? Runs house-policy pairings
 * (both sides, route-only) and prints banked scores, bumps and who took the
 * timed centre cores.
 *
 *   npx tsx scripts/bench-rush.ts
 */
import { resolve } from 'node:path'
import { ArenaRunner, type CollectorStrategy } from '../services/arenaPolicy'
import { ArenaPhysics } from '../services/arenaPhysics'
import { buildRushCourse } from '../services/arenaCourse'
import { loadGroundedWorld } from './eval-lib'

const STRATEGIES: CollectorStrategy[] = ['safe', 'greedy', 'weather', 'poach']

async function main() {
  const world = await loadGroundedWorld(resolve(import.meta.dirname, '..'))
  const probe = new ArenaPhysics(world.collider)
  const scenario = buildRushCourse(probe).scenario
  probe.dispose()

  console.log('champion  rival     banked   bumps  motherCores(champ:rival)  winner')
  for (const a of STRATEGIES) {
    for (const b of STRATEGIES) {
      const runner = new ArenaRunner(scenario, { champion: a, rival: b })
      runner.advanceTicks(scenario.durationTicks)
      const snap = runner.snapshot()
      const champion = snap.agents.find(agent => agent.id === 'champion')!
      const rival = snap.agents.find(agent => agent.id === 'rival')!
      const bumps = (snap.events ?? []).filter(event => event.type === 'bump').length
      const mother = (who: string) => snap.resources.filter(r => r.id.startsWith('mother-') && r.collectedBy === who).length
      console.log(
        `${a.padEnd(9)} ${b.padEnd(9)} ${String(champion.banked).padStart(2)}:${String(rival.banked).padEnd(3)}    ${String(bumps).padStart(2)}     ${mother('champion')}:${mother('rival')}                       ${snap.winner ?? 'draw'}`,
      )
    }
  }
}

main().catch(error => { console.error(error); process.exit(1) })
