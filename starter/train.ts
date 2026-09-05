import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ARENA_RULES, type ArenaScenario } from '../services/arenaEpisode'
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
import { proposeCorrection } from '../services/coachingEngine'

/**
 * Standard Season 0 Course Scenario for headless training & evaluation
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
      { id: 'rival-to-bank', from: 'rival-base', to: 'resource-bank', travelTicks: 30, floodable: false },
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

  // Step 2: Collect situation examples
  console.log('\n[3/5] Simulating roll-out and extracting coaching examples...')
  const examples: ArenaTrainingExample[] = []
  const basePolicy = createLearnedPolicy(SEASON_0_BASE_CHECKPOINT)

  // Synthetic practice rollout
  const { ArenaEpisode } = await import('../services/arenaEpisode')
  const sim = new ArenaEpisode(scenario)

  while (!sim.finished) {
    const tick = sim.tick
    if (tick % ARENA_RULES.decisionEveryTicks === 0) {
      const champObs = sim.observe('champion')
      const chosen = basePolicy(champObs)

      // When flooded, teach the agent to climb the ridge instead of the valley
      if (champObs.weather.flooded && champObs.availableActions.some(a => a.type === 'move' && a.edgeId === 'base-to-ridge')) {
        const correction = proposeCorrection(
          'Climb the ridge in floods to avoid submerged routes',
          champObs,
          chosen,
          scenario.id
        )
        if (correction) {
          correction.approved = true
          examples.push(correction)
        }
      }

      // When at resource-bank with cores, teach to collect cores
      if (champObs.self.nodeId === 'resource-bank' && champObs.self.cargo < ARENA_RULES.capacity) {
        const correction = proposeCorrection(
          'Prioritize adjacent energy cores when stopped at a resource node',
          champObs,
          chosen,
          scenario.id
        )
        if (correction) {
          correction.approved = true
          examples.push(correction)
        }
      }

      sim.step([{ agentId: 'champion', tick, action: chosen }])
    } else {
      sim.step([])
    }
  }

  // Deduplicate examples by tick
  const uniqueExamples = Array.from(new Map(examples.map(ex => [ex.tick, ex])).values())
  console.log(`      Collected ${uniqueExamples.length} distinct approved training examples:`)
  for (const ex of uniqueExamples) {
    console.log(`      - Tick ${ex.tick}: ${ex.rationale} -> Action: ${JSON.stringify(ex.preferredAction)}`)
  }

  // Step 3: Train checkpoint
  console.log('\n[4/5] Training neural policy via supervised momentum SGD...')
  const trainedCheckpoint = trainPolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, uniqueExamples, {
    epochs: 60,
    learningRate: 0.05,
    name: 'Builder Champion (Flood + Core Aware)',
  })

  validateCheckpoint(trainedCheckpoint)
  console.log(`      Training Loss: ${trainedCheckpoint.trainingSummary.loss.toFixed(4)}`)
  console.log(`      New Weights Hash: ${trainedCheckpoint.weightsHash.slice(0, 16)}...`)
  console.log(`      Updated from Parent: ${trainedCheckpoint.parentCheckpointId ?? 'none'}`)

  // Step 4: Evaluate trained checkpoint
  console.log('\n[5/5] Evaluating newly trained checkpoint...')
  const trainedEval = evaluatePolicyCheckpoint(trainedCheckpoint, [scenario])
  console.log(`      Trained Banked: ${trainedEval.totalBanked} | Wins: ${trainedEval.wins} | Losses: ${trainedEval.losses} | Draws: ${trainedEval.draws}`)

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
