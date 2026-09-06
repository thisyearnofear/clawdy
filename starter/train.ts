import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ARENA_RULES, type ArenaAction, type ArenaObservation, type ArenaScenario } from '../services/arenaEpisode'
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

/**
 * Standard Season 0 builder scenario for headless training & evaluation.
 */
function createTrainingScenario(id = 'builder-course-01', seed = 20260905): ArenaScenario {
  return {
    id,
    worldVersion: 'course-01-v2',
    split: 'practice',
    seed,
    durationTicks: 600,
    nodes: [
      { id: 'champion-base', position: [0, 0, 0] },
      { id: 'rival-base', position: [14, 0, 8] },
      { id: 'low-pass', position: [4, 0, 2] },
      { id: 'ridge-center', position: [7, 3, 5] },
      { id: 'resource-bank', position: [10, 0, 3] },
    ],
    edges: [
      { id: 'base-to-low', from: 'champion-base', to: 'low-pass', travelTicks: 25, floodable: true },
      { id: 'base-to-ridge', from: 'champion-base', to: 'ridge-center', travelTicks: 40, floodable: false },
      { id: 'low-to-bank', from: 'low-pass', to: 'resource-bank', travelTicks: 25, floodable: true },
      { id: 'ridge-to-bank', from: 'ridge-center', to: 'resource-bank', travelTicks: 35, floodable: false },
      // Rival is deliberately placed on a long edge so the builder scenario
      // focuses on teaching the champion without contention.
      { id: 'rival-to-bank', from: 'rival-base', to: 'resource-bank', travelTicks: 1000, floodable: false },
    ],
    entrants: [
      { id: 'champion', baseNode: 'champion-base', policyVersion: 'baseline.safe.v2' },
      { id: 'rival', baseNode: 'rival-base', policyVersion: 'reference.greedy.v2' },
    ],
    resources: [
      { id: 'core-1', nodeId: 'resource-bank', value: 1 },
      { id: 'core-2', nodeId: 'resource-bank', value: 1 },
      { id: 'core-3', nodeId: 'ridge-center', value: 1 },
      { id: 'core-4', nodeId: 'resource-bank', value: 1 },
    ],
    floods: [
      { startTick: 50, endTick: 300 },
      { startTick: 400, endTick: 550 },
    ],
  }
}

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

function uniqueExampleId(tick: number, index: number): string {
  return `ex-${tick.toString(36)}-${index.toString(36)}`
}

async function runBuilderTrainer() {
  console.log('='.repeat(70))
  console.log('  CLAWDY BUILDER STARTER: TRAIN YOUR CHAMPION (SEASON 0)')
  console.log('='.repeat(70))
  console.log()

  const scenario = createTrainingScenario()
  console.log(`[1/5] Initializing scenario "${scenario.id}" (${scenario.durationTicks} ticks)...`)
  console.log(`      Base checkpoint: ${SEASON_0_BASE_CHECKPOINT.name}`)
  console.log(`      Initial weights hash: ${SEASON_0_BASE_CHECKPOINT.weightsHash.slice(0, 16)}...`)

  // Step 1: Run baseline evaluation
  console.log('\n[2/5] Evaluating baseline policy...')
  const baseEval = evaluatePolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, [scenario])
  console.log(`      Baseline Banked: ${baseEval.totalBanked} | Wins: ${baseEval.wins} | Losses: ${baseEval.losses} | Draws: ${baseEval.draws}`)

  // Step 2: Roll out a safe baseline to collect training demonstrations
  console.log('\n[3/5] Simulating reference rollout and extracting coaching examples...')
  const examples: ArenaTrainingExample[] = []
  const basePolicy = createLearnedPolicy(SEASON_0_BASE_CHECKPOINT)

  const { ArenaEpisode } = await import('../services/arenaEpisode')
  const sim = new ArenaEpisode(scenario)

  while (!sim.finished) {
    const tick = sim.tick
    if (tick % ARENA_RULES.decisionEveryTicks === 0) {
      const champObs = sim.observe('champion')
      const rivalObs = sim.observe('rival')

      const champAction = collectorPolicy(champObs, 'safe')
      const baseAction = basePolicy(champObs)
      const rivalAction = collectorPolicy(rivalObs, 'weather')

      // Record the demonstration as a correction from the random base policy
      // toward the safe-oracle action. The preference is what drives training.
      // Skip "wait" examples: the environment already enforces waiting while in transit,
      // so the network should learn only the station-level decisions.
      if (champAction.type === 'wait') {
        sim.step([
          { agentId: 'champion', tick, action: champAction },
          { agentId: 'rival', tick, action: rivalAction },
        ])
        continue
      }

      examples.push({
        id: uniqueExampleId(tick, examples.length),
        sourceEpisodeId: scenario.id,
        tick,
        observation: champObs,
        originalAction: baseAction,
        preferredAction: champAction,
        rationale: actionRationale(champAction, champObs),
        approved: true,
      })

      sim.step([
        { agentId: 'champion', tick, action: champAction },
        { agentId: 'rival', tick, action: rivalAction },
      ])
    } else {
      sim.step([])
    }
  }

  // Deduplicate examples by tick (one per decision tick is enough)
  const uniqueExamples = Array.from(new Map(examples.map(ex => [ex.tick, ex])).values())
  console.log(`      Collected ${uniqueExamples.length} distinct approved training examples:`)
  for (const ex of uniqueExamples.slice(0, 12)) {
    console.log(`      - Tick ${ex.tick}: ${ex.rationale} -> Action: ${JSON.stringify(ex.preferredAction)}`)
  }
  if (uniqueExamples.length > 12) {
    console.log(`      ... and ${uniqueExamples.length - 12} more`)
  }

  // Step 3: Train checkpoint
  console.log('\n[4/5] Training neural policy via supervised momentum SGD...')
  // Use a smaller learning rate and enough epochs so the small MLP actually
  // learns the demonstration labels rather than overshooting or collapsing.
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

  // Step 4: Evaluate trained checkpoint
  console.log('\n[5/5] Evaluating newly trained checkpoint...')
  const trainedEval = evaluatePolicyCheckpoint(trainedCheckpoint, [scenario])
  console.log(`      Trained Banked: ${trainedEval.totalBanked} | Wins: ${trainedEval.wins} | Losses: ${trainedEval.losses} | Draws: ${trainedEval.draws}`)

  const improvement = trainedEval.totalBanked - baseEval.totalBanked
  if (improvement > 0) {
    console.log(`\n      Improvement: +${improvement} banked resources over baseline`)
  } else if (improvement < 0) {
    console.log(`\n      Warning: trained checkpoint banked ${improvement} fewer resources than baseline`)
  } else {
    console.log('\n      Note: trained checkpoint matched baseline score; the rollout may need more diverse examples or a richer scenario.')
  }

  // Step 5: Export checkpoint JSON
  const outputPath = join(process.cwd(), 'starter', 'champion-checkpoint.json')
  const jsonContent = exportCheckpointJson(trainedCheckpoint)
  writeFileSync(outputPath, jsonContent, 'utf-8')
  console.log(`\nSuccess! Exported trained checkpoint to: ${outputPath}`)
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
