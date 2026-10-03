/**
 * Local teacher harness: turn a function you wrote into a normal checkpoint.
 *
 *   npx tsx scripts/teacher-run.ts starter/teachers/ridge-runner.ts [--out starter/teacher-checkpoint.json] [--epochs 300]
 *
 * The teacher only ever sees practice scenarios. Held-out scenarios are used afterwards, to
 * score the trained checkpoint against the untrained base. No scored match, ladder run or
 * network call is involved. The module must `export default` a `Teacher`.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { exportCheckpointJson } from '../services/checkpointStorage'
import { HELD_OUT_SCENARIOS, PRACTICE_SCENARIOS } from '../services/arenaScenarios'
import { SEASON_0_BASE_CHECKPOINT } from '../services/policyModel'
import { attachEvaluationRecords, compareCheckpoints } from '../services/policyTrainer'
import { distillTeacher, type Teacher } from '../services/teacher'

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main() {
  const modulePath = process.argv[2]
  if (!modulePath || modulePath.startsWith('--')) {
    console.error('usage: npx tsx scripts/teacher-run.ts <teacher-module.ts> [--out file.json] [--epochs n]')
    process.exit(2)
  }
  const loaded = await import(pathToFileURL(resolve(process.cwd(), modulePath)).href)
  const teacher: Teacher | undefined = loaded.default
  if (typeof teacher !== 'function') throw new Error(`${modulePath} must export default a function (observation) => action`)

  const base = SEASON_0_BASE_CHECKPOINT
  const result = distillTeacher(teacher, PRACTICE_SCENARIOS, base, {
    name: `Taught by ${modulePath.split('/').pop()?.replace(/\.[tj]s$/, '')}`,
    training: flag('epochs') ? { epochs: Number(flag('epochs')) } : undefined,
  })

  console.log(`teacher examples: ${result.examples.length}  illegal choices: ${result.illegalChoices}  threw: ${result.failures.count}`)
  if (result.failures.firstMessage) console.log(`  first error: ${result.failures.firstMessage}`)
  console.log('teacher banked while demonstrating (practice):')
  for (const [key, banked] of Object.entries(result.banked)) console.log(`  ${key.padEnd(44)} ${banked}`)

  for (const [label, scenarios] of [['practice', PRACTICE_SCENARIOS], ['held-out', HELD_OUT_SCENARIOS]] as const) {
    const comparison = compareCheckpoints(base, result.checkpoint, scenarios)
    console.log(`\n${label}: base banked ${comparison.baseline.totalBanked} (W${comparison.baseline.wins}/L${comparison.baseline.losses}) -> taught ${comparison.candidate.totalBanked} (W${comparison.candidate.wins}/L${comparison.candidate.losses})  delta ${comparison.totalDelta >= 0 ? '+' : ''}${comparison.totalDelta}`)
  }

  const out = resolve(process.cwd(), flag('out') ?? 'starter/teacher-checkpoint.json')
  writeFileSync(out, exportCheckpointJson(attachEvaluationRecords(result.checkpoint, [...PRACTICE_SCENARIOS, ...HELD_OUT_SCENARIOS])), 'utf-8')
  console.log(`\nwrote ${out} (${result.checkpoint.id}). Import it in the app, or submit it to the ladder.`)
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
