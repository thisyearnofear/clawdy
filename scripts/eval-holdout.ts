/**
 * scripts/eval-holdout.ts
 *
 * Runs the held-out evaluation suite defined in services/arenaScenarios.ts
 * and reports a safe-baseline-vs-trained table. Used for the Tripothon S1
 * submission's "measurable generalization" claim.
 *
 * The training set is small and synthetic: a handful of coaching rules
 * applied to one practice scenario. The point is not to win the held-out
 * scenarios (some are adversarial by design); the point is to show that
 * coaching the base brain with even a small set of corrections makes it
 * competitive with the rule-based safe collector on held-out scenarios
 * neither of them has seen.
 *
 * Usage:
 *   npm run eval:holdout
 *
 * Output: a markdown table on stdout + a JSON file written to
 * docs/eval-holdout.json for the asset board.
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SEASON_0_BASE_CHECKPOINT } from '../services/policyModel'
import { HELD_OUT_SCENARIOS, PRACTICE_SCENARIOS, isEvaluationScenario } from '../services/arenaScenarios'
import {
  ArenaRunner,
  collectorPolicy,
  type EntrantPolicyOption,
} from '../services/arenaPolicy'
import { ArenaEpisode } from '../services/arenaEpisode'
import {
  trainPolicyCheckpoint,
  type ArenaTrainingExample,
} from '../services/policyTrainer'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..')
const OUTPUT_PATH = join(REPO_ROOT, 'docs', 'eval-holdout.json')

interface ScenarioResult {
  scenarioId: string
  split: 'practice' | 'evaluation'
  banked: number
  winner: 'champion' | 'rival' | null
  recoveries: number
  weatherDrains: number
}

/**
 * Build a synthetic coaching set by distilling the rule-based safe collector
 * across the three practice scenarios. For each decision tick where the safe
 * collector would take a non-trivial action, we emit a training example that
 * says "in this observation, the preferred action is what safe would do".
 *
 * This is the minimum-viable coach: replay the practice course under the safe
 * collector, label its decisions as ground truth, train on them. The trained
 * champion becomes a learned approximation of safe that can be improved
 * further with human-approved coaching later.
 */
function buildSyntheticExamples(): ArenaTrainingExample[] {
  const examples: ArenaTrainingExample[] = []

  for (const practice of PRACTICE_SCENARIOS) {
    const episode = new ArenaEpisode(practice)
    let perScenario = 0

    while (!episode.finished && perScenario < 25) {
      const tick = episode.tick
      const champObs = episode.observe('champion')
      if (!champObs.decisionDue) {
        episode.step()
        continue
      }

      // Pick a recorded action (something that differs from safe, so the
      // training signal is meaningful — otherwise we're just teaching the
      // network what it already kind of knows).
      const candidates = champObs.availableActions.filter(a => a.type !== 'wait')
      if (candidates.length < 2) {
        episode.step([{ agentId: 'champion', tick, action: { type: 'wait' } }, { agentId: 'rival', tick, action: { type: 'wait' } }])
        continue
      }
      const safeAction = collectorPolicy(champObs, 'safe')
      const recorded = candidates.find(candidate => JSON.stringify(candidate) !== JSON.stringify(safeAction)) ?? candidates[0]

      if (safeAction.type !== 'wait') {
        examples.push({
          id: `distill-${practice.id}-${tick}`,
          sourceEpisodeId: practice.id,
          tick,
          observation: champObs,
          originalAction: recorded,
          preferredAction: safeAction,
          rationale: `Safe collector would ${safeAction.type}${safeAction.type === 'move' ? ' along a non-floodable route when applicable' : ''}.`,
          approved: true,
          source: 'approved',
        })
        perScenario++
      }

      // Advance both rovers with the safe action so the recorded observations
      // are representative of safe play.
      episode.step([
        { agentId: 'champion', tick, action: safeAction },
        { agentId: 'rival', tick, action: safeAction },
      ])
    }
  }

  return examples
}

/**
 * Run a single scenario once with the given champion strategy. The rival
 * uses the greedy collector in all cases, so the comparison is "same
 * opponent, different champion brain".
 */
function evaluateChampion(
  championOption: EntrantPolicyOption,
  scenario: typeof HELD_OUT_SCENARIOS[number]
): ScenarioResult {
  let runner: ArenaRunner
  try {
    runner = new ArenaRunner(scenario, {
      champion: championOption,
      rival: 'greedy',
    })
  } catch (err) {
    console.error(`[eval] Failed on scenario ${scenario.id}:`, err)
    console.error(`[eval] entrants:`, scenario.entrants)
    throw err
  }
  runner.advanceTicks(scenario.durationTicks)
  const snap = runner.snapshot()
  const champ = snap.agents.find(a => a.id === 'champion')!

  let weatherDrains = 0
  const recording = runner.recording()
  for (const batch of recording.batches) {
    for (const request of batch.requests) {
      if (request.agentId === 'champion' && request.action?.type === 'drain') weatherDrains++
    }
  }

  return {
    scenarioId: scenario.id,
    split: scenario.split,
    banked: champ.banked,
    winner: snap.winner as 'champion' | 'rival' | null,
    recoveries: champ.recoveries,
    weatherDrains,
  }
}

function main() {
  console.log('=== Clawdy held-out evaluation ===\n')

  const examples = buildSyntheticExamples()
  if (examples.length === 0) {
    console.error('No synthetic coaching examples were generated; the practice scenario did not produce a flood + safe-move pair within the first 6 decisions. Aborting.')
    process.exit(1)
  }

  console.log(`Training on ${examples.length} synthetic coaching examples distilled across ${new Set(examples.map(e => e.sourceEpisodeId)).size} practice scenario(s).\n`)

  // Sanity guard: no example may come from a held-out scenario.
  for (const ex of examples) {
    if (isEvaluationScenario(ex.sourceEpisodeId)) {
      throw new Error(`Training data leak: example from held-out scenario "${ex.sourceEpisodeId}".`)
    }
  }

  const trained = trainPolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, examples, {
    epochs: 60,
    learningRate: 0.02,
    name: `Champion v1 (+${examples.length} synthetic examples)`,
  })

  console.log(`Trained checkpoint: ${trained.id}`)
  console.log(`  hash: ${trained.weightsHash.slice(0, 14)}`)
  console.log(`  loss: ${trained.trainingSummary.loss.toFixed(4)}`)
  console.log(`  accuracy: ${(trained.trainingSummary.accuracy * 100).toFixed(0)}%`)
  console.log(`  samples: ${trained.trainingSummary.sampleCount}\n`)

  const baselineOption: EntrantPolicyOption = 'safe'
  const trainedOption: EntrantPolicyOption = { strategy: 'learned', checkpoint: trained }

  const perScenario = HELD_OUT_SCENARIOS.map(scenario => {
    const baseline = evaluateChampion(baselineOption, scenario)
    const candidate = evaluateChampion(trainedOption, scenario)
    return { scenarioId: scenario.id, baseline, candidate, delta: candidate.banked - baseline.banked }
  })

  let baselineTotal = 0
  let candidateTotal = 0
  let baselineWins = 0
  let candidateWins = 0
  let draws = 0
  let candidateBeatsRival = 0
  let baselineBeatsRival = 0

  console.log('Held-out scenario breakdown (champion vs greedy rival):')
  console.log('| Scenario | Safe banked | Trained banked | Delta | Safe winner | Trained winner |')
  console.log('| --- | --- | --- | --- | --- | --- |')
  for (const row of perScenario) {
    baselineTotal += row.baseline.banked
    candidateTotal += row.candidate.banked
    if (row.candidate.banked > row.baseline.banked) candidateWins++
    else if (row.candidate.banked < row.baseline.banked) baselineWins++
    else draws++
    if (row.candidate.winner === 'champion') candidateBeatsRival++
    if (row.baseline.winner === 'champion') baselineBeatsRival++
    const safeWin = row.baseline.winner === 'champion' ? 'win' : row.baseline.winner === 'rival' ? 'loss' : 'draw'
    const trainedWin = row.candidate.winner === 'champion' ? 'win' : row.candidate.winner === 'rival' ? 'loss' : 'draw'
    const delta = row.delta >= 0 ? `+${row.delta}` : `${row.delta}`
    console.log(`| ${row.scenarioId} | ${row.baseline.banked} | ${row.candidate.banked} | ${delta} | ${safeWin} | ${trainedWin} |`)
  }
  console.log('')

  console.log('Aggregate:')
  console.log(`  safe collector total banked:   ${baselineTotal} (${baselineBeatsRival}/${perScenario.length} wins against greedy rival)`)
  console.log(`  trained champion total banked: ${candidateTotal} (${candidateBeatsRival}/${perScenario.length} wins against greedy rival)`)
  console.log(`  total delta (trained − safe): ${candidateTotal - baselineTotal >= 0 ? '+' : ''}${candidateTotal - baselineTotal}`)
  console.log(`  scenarios where trained > safe: ${candidateWins}/${perScenario.length}`)
  console.log(`  scenarios where safe > trained: ${baselineWins}/${perScenario.length}`)
  console.log(`  draws: ${draws}/${perScenario.length}`)

  // Write the JSON artifact for the asset board.
  const artifact = {
    generatedAt: new Date().toISOString(),
    baseCheckpoint: {
      id: SEASON_0_BASE_CHECKPOINT.id,
      weightsHash: SEASON_0_BASE_CHECKPOINT.weightsHash,
      note: 'Randomly initialized base; safe collector is the meaningful baseline.',
    },
    trainedCheckpoint: {
      id: trained.id,
      name: trained.name,
      weightsHash: trained.weightsHash,
      trainingSummary: trained.trainingSummary,
    },
    examples: examples.map(ex => ({
      id: ex.id,
      sourceEpisodeId: ex.sourceEpisodeId,
      tick: ex.tick,
      rationale: ex.rationale,
    })),
    perScenario,
    aggregate: {
      baselineTotal,
      candidateTotal,
      totalDelta: candidateTotal - baselineTotal,
      scenariosWonByTrained: candidateWins,
      scenariosWonByBaseline: baselineWins,
      draws,
      candidateBeatsRival,
      baselineBeatsRival,
    },
    notes: [
      'Baseline uses the rule-based safe collector; rival uses the rule-based greedy collector.',
      'Training data is drawn from the first practice scenario only.',
      'No held-out scenario is used for training. The split is enforced by services/arenaScenarios.ts.',
      'Numbers are reproducible: same base seed + same examples → same weightsHash → same evaluation output.',
    ],
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(artifact, null, 2))
  console.log(`\nWrote artifact: ${OUTPUT_PATH}`)
}

main()
