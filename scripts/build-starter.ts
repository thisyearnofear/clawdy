/**
 * scripts/build-starter.ts
 *
 * Regenerates the bundled first-run starter (starter/champion-checkpoint.json)
 * using the grounded distillation syllabus — the same pipeline the eval gate
 * uses for its own trained legs. The builder CLI (starter/train.ts) trains on
 * abstract scenarios only; the shipped artifact needs physical-course
 * examples too, or the first-run champion limit-cycles on grounded edges
 * (Sep 2026 audit: 770-tick ridge-north↔ridge-n1 ping-pong, banked 3).
 *
 * Reports abstract practice/held-out and grounded practice results for both
 * the incumbent artifact and the candidate, then writes the artifact only
 * when the candidate is at least as good on both surfaces.
 *
 * Usage: npx tsx scripts/build-starter.ts
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyCourseMode } from '../services/arenaCourse'
import { exportCheckpointJson } from '../services/checkpointStorage'
import type { PolicyCheckpoint } from '../services/policyModel'
import { attachEvaluationRecords, evaluatePolicyCheckpoint } from '../services/policyTrainer'
import { HELD_OUT_SCENARIOS, PRACTICE_SCENARIOS } from '../services/arenaScenarios'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import {
  buildSyllabusExamples,
  loadGroundedWorld,
  runGroundedMatch,
  trainDistilledCheckpoint,
} from './eval-lib'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..')
const ARTIFACT = join(REPO_ROOT, 'starter', 'champion-checkpoint.json')
const STARTER_NAME = 'Starter brain (house-trained)'

async function main() {
  const world = await loadGroundedWorld(REPO_ROOT)
  const practice = applyCourseMode(world.course, 'practice')
  const deep = applyCourseMode(world.course, 'practice-deep')

  const examples = buildSyllabusExamples([
    { scenario: practice.scenario, collider: world.collider },
    { scenario: deep.scenario, collider: world.collider },
  ])
  const trained = trainDistilledCheckpoint(examples)
  const candidate: PolicyCheckpoint = { ...trained, name: STARTER_NAME }

  const report = (label: string, ckpt: PolicyCheckpoint) => {
    const absPractice = evaluatePolicyCheckpoint(ckpt, PRACTICE_SCENARIOS)
    const absHeldOut = evaluatePolicyCheckpoint(ckpt, HELD_OUT_SCENARIOS)
    const gNormal = runGroundedMatch(world, 'practice', { strategy: 'learned', checkpoint: ckpt }, { policy: 'trained' })
    const gSwapped = runGroundedMatch(world, 'practice', { strategy: 'learned', checkpoint: ckpt }, { policy: 'trained', swapSides: true })
    console.log(
      `${label}: abstract practice=${absPractice.totalBanked} heldout=${absHeldOut.totalBanked} | ` +
      `grounded normal=${gNormal.banked} (rec=${gNormal.recoveries}) swapped=${gSwapped.banked} (rec=${gSwapped.recoveries})`,
    )
    return { absPractice, absHeldOut, gNormal, gSwapped }
  }

  const inc = report('incumbent', SEASON_0_STARTER_CHECKPOINT)
  const cand = report('candidate', candidate)

  const groundedBetter = cand.gNormal.banked + cand.gSwapped.banked >= inc.gNormal.banked + inc.gSwapped.banked
  const abstractBetter = cand.absPractice.totalBanked >= inc.absPractice.totalBanked
  const force = process.argv.includes('--force')
  if ((!groundedBetter || !abstractBetter) && !force) {
    console.log('\nCandidate did not clear the incumbent on both surfaces — artifact unchanged.')
    process.exit(1)
  }
  if (!groundedBetter || !abstractBetter) {
    // --force exists for artifact recovery: starter:train writes the same
    // path with its abstract-only artifact, which then "wins" this guard on
    // abstract score while limit-cycling on grounded play.
    console.log('\n--force: writing candidate despite guard (artifact recovery)')
  }

  const withRecords = attachEvaluationRecords(candidate, [...PRACTICE_SCENARIOS, ...HELD_OUT_SCENARIOS])
  const groundedRecords = [cand.gNormal, cand.gSwapped].map(m => ({
    scenarioId: m.scenarioId,
    split: 'practice' as const,
    banked: m.banked,
    winner: m.winner,
    recoveries: m.recoveries,
    weatherDrains: m.weatherDrains,
    recordedAt: new Date().toISOString(),
  }))
  const final = { ...withRecords, evaluationRecords: [...(withRecords.evaluationRecords ?? []), ...groundedRecords] }
  writeFileSync(ARTIFACT, exportCheckpointJson(final), 'utf-8')
  console.log(`\nwrote ${ARTIFACT} (weightsHash=${final.weightsHash.slice(0, 14)})`)
}

main().catch(err => { console.error(err); process.exit(1) })
