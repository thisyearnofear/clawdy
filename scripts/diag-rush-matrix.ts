/**
 * Rush round-robin on hidden variants: every policy against every other, both
 * sides. Shows who actually beats whom, independent of ES, so training targets
 * are chosen from evidence.
 *
 *   npx tsx scripts/diag-rush-matrix.ts [checkpoint.json] [--variants 25]
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildRushCourse } from '../services/arenaCourse'
import { ArenaPhysics } from '../services/arenaPhysics'
import { ArenaRunner, type EntrantPolicyOption } from '../services/arenaPolicy'
import { validateCheckpoint, type PolicyCheckpoint } from '../services/policyModel'
import { rushVariant, swapSides } from '../services/rushVariants'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import { loadGroundedWorld } from './eval-lib'

async function main() {
  const repoRoot = resolve(import.meta.dirname, '..')
  const checkpointPath = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null
  const variantsIndex = process.argv.indexOf('--variants')
  const variants = variantsIndex === -1 ? 25 : Number(process.argv[variantsIndex + 1])

  const world = await loadGroundedWorld(repoRoot)
  const probe = new ArenaPhysics(world.collider)
  const rushBase = buildRushCourse(probe).scenario
  probe.dispose()

  const field: { label: string; option: EntrantPolicyOption }[] = [
    { label: 'safe', option: 'safe' },
    { label: 'greedy', option: 'greedy' },
    { label: 'weather', option: 'weather' },
    { label: 'poach', option: 'poach' },
    { label: 'starter', option: { strategy: 'learned', checkpoint: SEASON_0_STARTER_CHECKPOINT } },
  ]
  if (checkpointPath) {
    const trained: PolicyCheckpoint = JSON.parse(readFileSync(resolve(repoRoot, checkpointPath), 'utf-8'))
    validateCheckpoint(trained)
    field.push({ label: 'trained', option: { strategy: 'learned', checkpoint: trained } })
  }

  const seeds = Array.from({ length: variants }, (_, index) => 9001 + index)
  const header = ''.padEnd(9) + field.map(f => f.label.padStart(16)).join('')
  console.log(`row's mean banked margin (W-L) vs column, ${variants} hidden variants x 2 sides`)
  console.log(header)
  for (const row of field) {
    const cells: string[] = []
    for (const column of field) {
      let margin = 0, wins = 0, losses = 0, matches = 0
      for (const seed of seeds) {
        const scenario = rushVariant(rushBase, 'hidden', seed)
        for (const played of [scenario, swapSides(scenario)]) {
          const runner = new ArenaRunner(played, { champion: row.option, rival: column.option }, undefined, { record: false })
          runner.advanceTicks(played.durationTicks)
          const snap = runner.snapshot()
          const own = snap.agents.find(agent => agent.id === 'champion')!.banked
          const foe = snap.agents.find(agent => agent.id === 'rival')!.banked
          margin += own - foe
          if (own > foe) wins++
          else if (own < foe) losses++
          matches++
        }
      }
      cells.push(`${(margin / matches).toFixed(2)} (${wins}-${losses})`.padStart(16))
    }
    console.log(row.label.padEnd(9) + cells.join(''))
  }
}

main().catch(error => { console.error(error); process.exit(1) })
