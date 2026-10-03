/**
 * Evolution-strategies training on Rush, with a held-out proof at the end.
 *
 *   npx tsx scripts/train-es.ts [--gens 30] [--pairs 8] [--sigma 0.08] [--lr 1] [--tasks 3] [--seed 7] [--init checkpoint.json] [--out starter/rush-champion.json] [--val 3] [--schedule 0,2,1,0,2,3,4] [--save-every 10] [--timetable [--hub-prior 0]]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { resolve } from 'node:path'

import { buildRushCourse } from '../services/arenaCourse'
import { ArenaPhysics } from '../services/arenaPhysics'
import type { EntrantPolicyOption } from '../services/arenaPolicy'
import { exportCheckpointJson } from '../services/checkpointStorage'
import { trainES, type EsContext, type EsEvaluator, type EsTask } from '../services/policyES'
import { extendCheckpointForTimetable, type PolicyCheckpoint } from '../services/policyModel'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import { workerPool } from './es-pool'
import { loadGroundedWorld } from './eval-lib'

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : Number(process.argv[index + 1])
}

const OPPONENT_LABELS = ['safe', 'greedy', 'weather', 'poach', 'starter']

async function holdout(label: string, checkpoint: PolicyCheckpoint, evaluator: EsEvaluator, seeds: number[]) {
  const tasks: EsTask[] = seeds.flatMap(seed => OPPONENT_LABELS.map((_, opponent) => ({ kind: 'hidden' as const, seed, opponent })))
  // One checkpoint per task slice keeps the per-opponent numbers separable.
  const perOpponent = await Promise.all(OPPONENT_LABELS.map((_, opponent) =>
    evaluator([checkpoint], tasks.filter(task => task.opponent === opponent)).then(scores => scores[0])))
  console.log(`\n${label} on ${seeds.length} hidden variants x 2 sides (margin = own banked - rival banked)`)
  perOpponent.forEach((score, index) => {
    const winRate = score.wins / score.matches
    console.log(`  vs ${OPPONENT_LABELS[index].padEnd(8)} margin ${score.margin.toFixed(2).padStart(6)}  wins ${score.wins}/${score.matches} (${(winRate * 100).toFixed(0)}%)  losses ${score.losses}`)
  })
  return perOpponent
}

async function main() {
  const repoRoot = resolve(import.meta.dirname, '..')
  const world = await loadGroundedWorld(repoRoot)
  const probe = new ArenaPhysics(world.collider)
  const rushBase = buildRushCourse(probe).scenario
  probe.dispose()

  const starter = SEASON_0_STARTER_CHECKPOINT
  const opponents: EntrantPolicyOption[] = ['safe', 'greedy', 'weather', 'poach', { strategy: 'learned', checkpoint: starter }]
  const context: EsContext = { rushBase, opponents }
  const pool = workerPool(context, Math.max(1, cpus().length - 1))

  const config = {
    gens: arg('gens', 30), pairs: arg('pairs', 8), sigma: arg('sigma', 0.08), lr: arg('lr', 1), seed: arg('seed', 7),
  }
  console.log(`ES on Rush: ${JSON.stringify(config)}, workers ${Math.max(1, cpus().length - 1)}`)
  const holdoutSeeds = Array.from({ length: 12 }, (_, index) => 9001 + index)
  await holdout('starter (before)', starter, pool.evaluator, holdoutSeeds)

  // Warm start: continue from a saved checkpoint instead of the bundled starter.
  const initIndex = process.argv.indexOf('--init')
  const loaded: PolicyCheckpoint = initIndex === -1
    ? starter
    : JSON.parse(readFileSync(resolve(repoRoot, process.argv[initIndex + 1]), 'utf-8'))
  // `--timetable` adds the public-wave inputs (zero-init); `--hub-prior w` seeds the hub edge weight.
  const parent = process.argv.includes('--timetable')
    ? extendCheckpointForTimetable(loaded, { hubPrior: arg('hub-prior', 0) })
    : loaded
  let final: PolicyCheckpoint = parent
  // Hard opponents (safe=0, weather=2) twice as often by default; `--schedule 0,0,2` overrides.
  const scheduleIndex = process.argv.indexOf('--schedule')
  const opponentSchedule = scheduleIndex === -1 ? [0, 2, 1, 0, 2, 3, 4] : process.argv[scheduleIndex + 1].split(',').map(Number)
  const outPath = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'starter/rush-champion.json'
  const saveEvery = arg('save-every', 10)
  for await (const progress of trainES({
    parent,
    context,
    generations: config.gens,
    pairs: config.pairs,
    sigma: config.sigma,
    learningRate: config.lr,
    trainScenariosPerGen: arg('tasks', 3),
    opponentSchedule,
    validationSeeds: Array.from({ length: arg('val', 3) }, (_, index) => 101 + index),
    seed: config.seed,
    evaluator: pool.evaluator,
    name: 'Rush champion (ES)',
  })) {
    final = progress.checkpoint
    if (saveEvery > 0 && progress.generation % saveEvery === 0) writeFileSync(resolve(repoRoot, outPath), exportCheckpointJson(final), 'utf-8')
    console.log(
      `gen ${String(progress.generation).padStart(3)}  pop ${progress.mean.toFixed(2).padStart(6)}  ` +
      `val ${progress.validation.fitness.toFixed(2).padStart(6)} (margin ${progress.validation.margin.toFixed(2)})  ` +
      `best ${progress.best.toFixed(2).padStart(6)}  ${(progress.elapsedMs / 1000).toFixed(0)}s`,
    )
  }

  await holdout('trained (after)', final, pool.evaluator, holdoutSeeds)
  writeFileSync(resolve(repoRoot, outPath), exportCheckpointJson(final), 'utf-8')
  console.log(`\nwrote ${outPath} (${final.id})`)
  await pool.close()
}

main().catch(error => { console.error(error); process.exit(1) })
