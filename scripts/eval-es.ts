/**
 * Held-out proof for a trained Rush rover: unseen hidden variants, both sides,
 * against every house bot and the bundled imitation starter. Writes the result
 * to docs/eval-es.json so the claim is pinned next to the other evals.
 *
 *   npx tsx scripts/eval-es.ts <checkpoint.json> [--variants 25] [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { resolve } from 'node:path'

import { buildRushCourse } from '../services/arenaCourse'
import { ArenaPhysics } from '../services/arenaPhysics'
import type { EntrantPolicyOption } from '../services/arenaPolicy'
import type { EsContext, EsScore, EsTask } from '../services/policyES'
import { validateCheckpoint, type PolicyCheckpoint } from '../services/policyModel'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import { workerPool } from './es-pool'
import { loadGroundedWorld } from './eval-lib'

const LABELS = ['safe', 'greedy', 'weather', 'poach', 'starter'] as const

async function main() {
  const path = process.argv[2]
  if (!path || path.startsWith('--')) throw new Error('usage: eval-es.ts <checkpoint.json> [--variants N] [--write]')
  const variantsIndex = process.argv.indexOf('--variants')
  const variants = variantsIndex === -1 ? 25 : Number(process.argv[variantsIndex + 1])
  const repoRoot = resolve(import.meta.dirname, '..')
  const trained: PolicyCheckpoint = JSON.parse(readFileSync(resolve(repoRoot, path), 'utf-8'))
  validateCheckpoint(trained)

  const world = await loadGroundedWorld(repoRoot)
  const probe = new ArenaPhysics(world.collider)
  const rushBase = buildRushCourse(probe).scenario
  probe.dispose()
  const opponents: EntrantPolicyOption[] = ['safe', 'greedy', 'weather', 'poach', { strategy: 'learned', checkpoint: SEASON_0_STARTER_CHECKPOINT }]
  const context: EsContext = { rushBase, opponents }
  const pool = workerPool(context, Math.max(1, cpus().length - 1))

  const seeds = Array.from({ length: variants }, (_, index) => 9001 + index)
  const run = async (checkpoint: PolicyCheckpoint) => {
    const scores: Record<string, EsScore> = {}
    for (const [opponent, label] of LABELS.entries()) {
      const tasks: EsTask[] = seeds.map(seed => ({ kind: 'hidden', seed, opponent }))
      scores[label] = (await pool.evaluator([checkpoint], tasks))[0]
    }
    return scores
  }
  const before = await run(SEASON_0_STARTER_CHECKPOINT)
  const after = await run(trained)
  await pool.close()

  const row = (label: string, score: EsScore) =>
    `  vs ${label.padEnd(8)} banked ${score.ownBanked.toFixed(2)} : ${score.foeBanked.toFixed(2)}  margin ${score.margin.toFixed(2).padStart(6)}  W-L-D ${score.wins}-${score.losses}-${score.matches - score.wins - score.losses}`
  console.log(`Held-out: ${variants} hidden variants x 2 sides = ${variants * 2} matches per opponent`)
  console.log('\nstarter (imitation):'); for (const label of LABELS) console.log(row(label, before[label]))
  console.log(`\ntrained (${trained.id}):`); for (const label of LABELS) console.log(row(label, after[label]))

  if (process.argv.includes('--write')) {
    const record = { checkpointId: trained.id, weightsHash: trained.weightsHash, variants, seeds: [seeds[0], seeds.at(-1)], starter: before, trained: after }
    writeFileSync(resolve(repoRoot, 'docs', 'eval-es.json'), JSON.stringify(record, null, 2) + '\n', 'utf-8')
    console.log('\nwrote docs/eval-es.json')
  }
}

main().catch(error => { console.error(error); process.exit(1) })
