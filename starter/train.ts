import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ARENA_RULES, type ArenaAction, type ArenaObservation } from '../services/arenaEpisode'
import { collectorPolicy } from '../services/arenaPolicy'
import {
  createLearnedPolicy,
  SEASON_0_BASE_CHECKPOINT,
  validateCheckpoint,
} from '../services/policyModel'
import {
  type ArenaTrainingExample,
  evaluatePolicyCheckpoint,
  trainPolicyCheckpoint,
} from '../services/policyTrainer'
import { exportCheckpointJson } from '../services/checkpointStorage'
import {
  HELD_OUT_SCENARIOS,
  PRACTICE_SCENARIOS,
  rejectEvaluationExamples,
} from '../services/arenaScenarios'

function actionRationale(action: ArenaAction, observation: ArenaObservation): string {
  if (action.type === 'bank') return 'Cargo is available; deliver it to the base to score.'
  if (action.type === 'collect') return 'A core is available at the current station; collect it.'
  if (action.type === 'drain') return 'Spend energy to clear flood water and reopen the low route.'
  if (action.type === 'wait') return 'No urgent action; wait for the next decision window.'
  if (action.type === 'move') {
    const edge = observation.edges.find(e => e.id === action.edgeId)
    if (!edge) return `Move along ${action.edgeId}.`
    if (edge.floodable) return 'The low route is clear; take the short path.'
    const target = edge.from === observation.self.nodeId ? edge.to : edge.from
    if (target === observation.self.baseNode) return 'Return to base with cargo.'
    if (observation.resources.some(r => r.nodeId === target)) return 'Move toward a node with an available core.'
    return 'The ridge route is safe; use the elevated path.'
  }
  return 'Demonstrated action from safe baseline rollout.'
}

async function runBuilderTrainer() {
  console.log('='.repeat(70))
  console.log('  CLAWDY BUILDER STARTER: TRAIN YOUR CHAMPION (SEASON 0)')
  console.log('='.repeat(70))
  console.log()

  console.log(`[1/6] Loading ${PRACTICE_SCENARIOS.length} practice scenarios and ${HELD_OUT_SCENARIOS.length} held-out scenario...`)
  console.log(`      Base checkpoint: ${SEASON_0_BASE_CHECKPOINT.name}`)
  console.log(`      Initial weights hash: ${SEASON_0_BASE_CHECKPOINT.weightsHash.slice(0, 16)}...`)

  // Step 1: Baseline evaluation on practice and held-out sets
  console.log('\n[2/6] Evaluating baseline policy...')
  const basePracticeEval = evaluatePolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, PRACTICE_SCENARIOS)
  const baseHeldOutEval = evaluatePolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, HELD_OUT_SCENARIOS)
  console.log(`      Practice — Banked: ${basePracticeEval.totalBanked} | Wins: ${basePracticeEval.wins} | Losses: ${basePracticeEval.losses} | Draws: ${basePracticeEval.draws}`)
  console.log(`      Held-out — Banked: ${baseHeldOutEval.totalBanked} | Wins: ${baseHeldOutEval.wins} | Losses: ${baseHeldOutEval.losses} | Draws: ${baseHeldOutEval.draws}`)

  // Step 2: Roll out the safe baseline on each practice scenario and collect demonstrations
  console.log('\n[3/6] Simulating reference rollouts and extracting coaching examples...')
  const { ArenaEpisode } = await import('../services/arenaEpisode')
  const examples: ArenaTrainingExample[] = []
  const basePolicy = createLearnedPolicy(SEASON_0_BASE_CHECKPOINT)

  for (const scenario of PRACTICE_SCENARIOS) {
    const sim = new ArenaEpisode(scenario)
    let localCount = 0

    while (!sim.finished) {
      const tick = sim.tick
      if (tick % ARENA_RULES.decisionEveryTicks === 0) {
        const champObs = sim.observe('champion')
        const rivalObs = sim.observe('rival')
        const champAction = collectorPolicy(champObs, 'safe')
        const baseAction = basePolicy(champObs)
        const rivalAction = collectorPolicy(rivalObs, 'weather')

        // Skip "wait" examples: the environment already enforces waiting while in transit,
        // so the network should learn only the station-level decisions.
        if (champAction.type !== 'wait') {
          examples.push({
            id: `ex-${scenario.id}-${tick}-${localCount.toString(36)}`,
            sourceEpisodeId: scenario.id,
            tick,
            observation: champObs,
            originalAction: baseAction,
            preferredAction: champAction,
            rationale: actionRationale(champAction, champObs),
            approved: true,
          })
          localCount += 1
        }

        sim.step([
          { agentId: 'champion', tick, action: champAction },
          { agentId: 'rival', tick, action: rivalAction },
        ])
      } else {
        sim.step([])
      }
    }

    const banked = sim.snapshot().agents.find(a => a.id === 'champion')?.banked ?? 0
    console.log(`      ${scenario.id}: collected ${localCount} non-wait examples · oracle banked ${banked}`)
  }

  const uniqueExamples = Array.from(new Map(examples.map(ex => [ex.id, ex])).values())
  console.log(`      Collected ${uniqueExamples.length} distinct approved training examples across practice scenarios.`)
  rejectEvaluationExamples(uniqueExamples)

  // Step 4: Train checkpoint
  console.log('\n[4/6] Training neural policy via supervised momentum SGD...')
  const trainedCheckpoint = trainPolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, uniqueExamples, {
    epochs: 500,
    learningRate: 0.01,
    momentum: 0.9,
    name: 'Builder Champion (Safe Baseline Clone)',
  })

  validateCheckpoint(trainedCheckpoint)
  console.log(`      Training Loss: ${trainedCheckpoint.trainingSummary.loss.toFixed(4)}`)
  console.log(`      Accuracy: ${trainedCheckpoint.trainingSummary.accuracy.toFixed(3)}`)
  console.log(`      New Weights Hash: ${trainedCheckpoint.weightsHash.slice(0, 16)}...`)
  console.log(`      Updated from Parent: ${trainedCheckpoint.parentCheckpointId ?? 'none'}`)

  // Step 5: Evaluate trained checkpoint on both splits
  console.log('\n[5/6] Evaluating newly trained checkpoint...')
  const trainedPracticeEval = evaluatePolicyCheckpoint(trainedCheckpoint, PRACTICE_SCENARIOS)
  const trainedHeldOutEval = evaluatePolicyCheckpoint(trainedCheckpoint, HELD_OUT_SCENARIOS)

  console.log(`      Practice — Banked: ${trainedPracticeEval.totalBanked} | Wins: ${trainedPracticeEval.wins} | Losses: ${trainedPracticeEval.losses} | Draws: ${trainedPracticeEval.draws}`)
  console.log(`      Held-out — Banked: ${trainedHeldOutEval.totalBanked} | Wins: ${trainedHeldOutEval.wins} | Losses: ${trainedHeldOutEval.losses} | Draws: ${trainedHeldOutEval.draws}`)

  const practiceImprovement = trainedPracticeEval.totalBanked - basePracticeEval.totalBanked
  const heldOutImprovement = trainedHeldOutEval.totalBanked - baseHeldOutEval.totalBanked
  if (heldOutImprovement > 0) {
    console.log(`\n      Held-out improvement: +${heldOutImprovement} banked resources over baseline`)
  } else if (heldOutImprovement < 0) {
    console.log(`\n      Warning: trained checkpoint banked ${heldOutImprovement} fewer resources on held-out than baseline`)
  } else {
    console.log('\n      Note: trained checkpoint matched baseline on held-out; the policy has not yet generalized beyond the practice scenarios.')
  }
  if (practiceImprovement !== heldOutImprovement) {
    console.log(`      Practice improvement: ${practiceImprovement >= 0 ? '+' : ''}${practiceImprovement} banked resources`)
  }

  // Step 6: Export checkpoint JSON
  const outputPath = join(process.cwd(), 'starter', 'champion-checkpoint.json')
  const jsonContent = exportCheckpointJson(trainedCheckpoint)
  writeFileSync(outputPath, jsonContent, 'utf-8')
  console.log(`\n[6/6] Success! Exported trained checkpoint to: ${outputPath}`)
  console.log()
  console.log('To use this trained champion in the live 3D arena:')
  console.log('  1. Open http://localhost:3000 in your browser')
  console.log('  2. Scroll to the "Coach & Train Studio" section')
  console.log('  3. Click "Import JSON" and select "starter/champion-checkpoint.json"')
  console.log('  4. Watch your custom trained champion compete autonomously!')
  console.log('='.repeat(70))
}

runBuilderTrainer().catch(err => {
  console.error('Builder training failed:', err)
  process.exit(1)
})
