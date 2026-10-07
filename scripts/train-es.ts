/**
 * Evolution-strategies training on Rush, with a held-out proof at the end.
 *
 *   npx tsx scripts/train-es.ts [--gens 30] [--pairs 8] [--sigma 0.08] [--lr 1] [--tasks 3] [--seed 7] [--init checkpoint.json] [--out starter/rush-champion.json] [--val 3] [--schedule 0,2,1,0,2,3,4] [--save-every 10] [--timetable [--hub-prior 0]] [--chassis scout|hauler|raider [--ruleset skirmish]] [--steal-seek]
 *
 * `--steal-seek` (Skirmish Raider): adds Scout/Hauler house brains as PvP sparring
 * partners with their Skirmish traits, and defaults the opponent schedule to mix
 * poach intercepts with those chassis so contact/steal levers get practised.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { resolve } from 'node:path'

import { buildRushCourse } from '../services/arenaCourse'
import { ArenaPhysics } from '../services/arenaPhysics'
import type { EntrantPolicyOption } from '../services/arenaPolicy'
import { exportCheckpointJson } from '../services/checkpointStorage'
import { trainES, type EsContext, type EsEvaluator, type EsTask } from '../services/policyES'
import { baseBuild, buildToTraits, CHASSIS_IDS, type ChassisId, type RulesetId } from '../services/chassis'
import type { EntrantTraits } from '../services/arenaEpisode'
import { extendCheckpointForChassis, extendCheckpointForTimetable, type PolicyCheckpoint } from '../services/policyModel'
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
  // `--chassis` trains the brain as that chassis: it sees its own traits and every match runs with them.
  const chassisIndex = process.argv.indexOf('--chassis')
  const chassis = chassisIndex === -1 ? undefined : process.argv[chassisIndex + 1] as ChassisId
  if (chassis !== undefined && !CHASSIS_IDS.includes(chassis)) throw new Error(`--chassis must be one of ${CHASSIS_IDS.join(', ')}`)
  const rulesetIndex = process.argv.indexOf('--ruleset')
  const ruleset = rulesetIndex === -1 ? undefined : process.argv[rulesetIndex + 1] as RulesetId
  if (ruleset !== undefined && (ruleset as string) !== 'skirmish') throw new Error('--ruleset must be skirmish')
  if (ruleset && !chassis) throw new Error('--ruleset needs --chassis')
  const stealSeek = process.argv.includes('--steal-seek')
  if (stealSeek && (chassis !== 'raider' || ruleset !== 'skirmish')) {
    throw new Error('--steal-seek needs --chassis raider --ruleset skirmish')
  }
  // Steal-seeking: spar vs Scout/Hauler house brains under their Skirmish builds so
  // contactRadiusBonus / steal-all get PvP pressure (house bots alone under-train bumps).
  const opponentTraits: (EntrantTraits | undefined)[] = [undefined, undefined, undefined, undefined, undefined]
  if (stealSeek) {
    const scoutBrain = JSON.parse(readFileSync(resolve(repoRoot, 'starter/skirmish-scout.json'), 'utf-8')) as PolicyCheckpoint
    const haulerBrain = JSON.parse(readFileSync(resolve(repoRoot, 'starter/skirmish-hauler.json'), 'utf-8')) as PolicyCheckpoint
    opponents.push({ strategy: 'learned', checkpoint: scoutBrain }, { strategy: 'learned', checkpoint: haulerBrain })
    opponentTraits.push(buildToTraits(baseBuild('scout'), 'skirmish'), buildToTraits(baseBuild('hauler'), 'skirmish'))
  }
  const context: EsContext = {
    rushBase,
    opponents,
    ...(chassis ? { traits: buildToTraits(baseBuild(chassis), ruleset) } : {}),
    ...(stealSeek ? { opponentTraits } : {}),
  }
  const pool = workerPool(context, Math.max(1, cpus().length - 1))

  const config = {
    gens: arg('gens', 30), pairs: arg('pairs', 8), sigma: arg('sigma', 0.08), lr: arg('lr', 1), seed: arg('seed', 7),
  }
  console.log(`ES on Rush: ${JSON.stringify(config)}, workers ${Math.max(1, cpus().length - 1)}${stealSeek ? ', steal-seek PvP' : ''}`)
  const holdoutSeeds = Array.from({ length: 12 }, (_, index) => 9001 + index)
  await holdout('starter (before)', starter, pool.evaluator, holdoutSeeds)

  // Warm start: continue from a saved checkpoint instead of the bundled starter.
  const initIndex = process.argv.indexOf('--init')
  const loaded: PolicyCheckpoint = initIndex === -1
    ? starter
    : JSON.parse(readFileSync(resolve(repoRoot, process.argv[initIndex + 1]), 'utf-8'))
  // `--timetable` adds the public-wave inputs (zero-init); `--hub-prior w` seeds the hub edge weight.
  const timetabled = process.argv.includes('--timetable') || chassis
    ? extendCheckpointForTimetable(loaded, { hubPrior: arg('hub-prior', 0) })
    : loaded
  const parent = chassis ? extendCheckpointForChassis(timetabled) : timetabled
  let final: PolicyCheckpoint = parent
  // Hard opponents (safe=0, weather=2) twice as often by default; `--schedule 0,0,2` overrides.
  // Steal-seek default: poach (3) + Scout (5) + Hauler (6) dominate so steals get practised.
  const scheduleIndex = process.argv.indexOf('--schedule')
  const defaultSchedule = stealSeek ? [3, 5, 6, 3, 5, 6, 0, 2, 1, 3] : [0, 2, 1, 0, 2, 3, 4]
  const opponentSchedule = scheduleIndex === -1 ? defaultSchedule : process.argv[scheduleIndex + 1].split(',').map(Number)
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
