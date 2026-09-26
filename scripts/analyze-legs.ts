/**
 * scripts/analyze-legs.ts
 *
 * Diagnostic leg analyzer (WS1.0): walks the safe teacher and the trained
 * champion tick-for-tick on every eval leg (abstract held-outs, grounded
 * modes, family layouts, both sides) and dumps decision divergences with a
 * route-only counterfactual value (rolloutOutcomeDelta: trained pick vs the
 * safe pick, safe continuation, greedy rival).
 *
 * Not gated, not pinned — pure instrumentation for executor-symmetrization
 * and label work. The delta is route-only even for grounded legs (physics
 * snapshots mis-price travel time; COMPATIBILITY.md), so treat magnitudes as
 * hints and tick/timing as truth.
 *
 * Usage: npm run analyze:legs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ARENA_RULES,
  rolloutOutcomeDelta,
  type ArenaAction,
  type ArenaObservation,
  type ArenaScenario,
} from '../services/arenaEpisode'
import { HELD_OUT_SCENARIOS } from '../services/arenaScenarios'
import { ArenaRunner, collectorPolicy } from '../services/arenaPolicy'
import { applyCourseMode, type CoursePlayMode } from '../services/arenaCourse'
import { ArenaPhysics } from '../services/arenaPhysics'
import { generateCourseFamily } from '../services/courseFamily'
import { classifyAction, createLearnedPolicy } from '../services/policyModel'
import {
  buildSyllabusExamples,
  loadGroundedWorld,
  trainDistilledCheckpoint,
  type GroundedWorld,
} from './eval-lib'
import type { PolicyCheckpoint } from '../services/policyModel'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..')

interface Divergence {
  leg: string
  side: 'normal' | 'swapped'
  tick: number
  safeAction: ArenaAction
  trainedAction: ArenaAction
  safeClass: number
  trainedClass: number
  sameClassDiffEdge: boolean
  edgeDelta: number
  safeBanked: number
  trainedBanked: number
}

interface LegSummary {
  leg: string
  side: string
  safeBanked: number
  trainedBanked: number
  divergences: number
  edgeOnly: number
  deltaSum: number
}

const championContinuation = (obs: ArenaObservation) => collectorPolicy(obs, 'safe')
const rivalContinuation = (obs: ArenaObservation) => collectorPolicy(obs, 'greedy')

/**
 * Drive one leg with two runners (safe / trained) advancing tick-by-tick,
 * compare the champion decision at every decision tick, and value the
 * divergence with a route-only rollout from the safe runner's live snapshot.
 */
function analyzeLeg(
  scenario: ArenaScenario,
  trained: PolicyCheckpoint,
  side: 'normal' | 'swapped',
  collider: { vertices: Float32Array; indices: Uint32Array } | null,
  horizonTicks: number,
): { divergences: Divergence[]; summary: LegSummary } {
  const entrants: ArenaScenario['entrants'] = side === 'swapped'
    ? [
        { ...scenario.entrants[0], baseNode: scenario.entrants[1].baseNode },
        { ...scenario.entrants[1], baseNode: scenario.entrants[0].baseNode },
      ]
    : scenario.entrants
  const evalScenario = { ...scenario, entrants }

  const motionSafe = collider ? new ArenaPhysics(collider) : undefined
  const motionTrained = collider ? new ArenaPhysics(collider) : undefined
  try {
    const safeRunner = new ArenaRunner(
      evalScenario,
      { champion: 'safe', rival: 'greedy' },
      motionSafe,
    )
    const trainedRunner = new ArenaRunner(
      evalScenario,
      {
        champion: {
          strategy: 'learned',
          checkpoint: trained,
        },
        rival: 'greedy',
      },
      motionTrained,
    )
    const trainedPolicy = createLearnedPolicy(trained)

    const divergences: Divergence[] = []
    const step = (runner: ArenaRunner) => runner.advanceTicks(1)
    let guard = 0
    while (
      safeRunner.snapshot().status !== 'finished' &&
      trainedRunner.snapshot().status !== 'finished' &&
      guard++ < evalScenario.durationTicks + 10
    ) {
      const safeSnap = safeRunner.snapshot()
      const trainedSnap = trainedRunner.snapshot()
      if (
        safeSnap.tick % ARENA_RULES.decisionEveryTicks === 0 &&
        trainedSnap.tick % ARENA_RULES.decisionEveryTicks === 0
      ) {
        const safeObs = safeRunner.observe('champion')
        const trainedObs = trainedRunner.observe('champion')
        const safeAction = collectorPolicy(safeObs, 'safe')
        const trainedAction = trainedPolicy(trainedObs)
        if (JSON.stringify(safeAction) !== JSON.stringify(trainedAction) && safeObs.decisionDue) {
          const edgeDelta = rolloutOutcomeDelta(
            evalScenario,
            safeSnap,
            safeAction,
            trainedAction,
            championContinuation,
            rivalContinuation,
            horizonTicks,
          )
          divergences.push({
            leg: evalScenario.id,
            side,
            tick: safeSnap.tick,
            safeAction,
            trainedAction,
            safeClass: classifyAction(safeAction, safeObs),
            trainedClass: classifyAction(trainedAction, trainedObs),
            sameClassDiffEdge:
              safeAction.type === 'move' && trainedAction.type === 'move' &&
              classifyAction(safeAction, safeObs) === classifyAction(trainedAction, trainedObs),
            edgeDelta,
            safeBanked: safeSnap.agents.find(a => a.id === 'champion')?.banked ?? 0,
            trainedBanked: trainedSnap.agents.find(a => a.id === 'champion')?.banked ?? 0,
          })
        }
      }
      step(safeRunner)
      step(trainedRunner)
    }

    const safeBanked = safeRunner.snapshot().agents.find(a => a.id === 'champion')?.banked ?? 0
    const trainedBanked = trainedRunner.snapshot().agents.find(a => a.id === 'champion')?.banked ?? 0
    return {
      divergences,
      summary: {
        leg: evalScenario.id,
        side,
        safeBanked,
        trainedBanked,
        divergences: divergences.length,
        edgeOnly: divergences.filter(d => d.sameClassDiffEdge).length,
        deltaSum: divergences.reduce((t, d) => t + d.edgeDelta, 0),
      },
    }
  } finally {
    motionSafe?.dispose()
    motionTrained?.dispose()
  }
}

async function main() {
  console.log('=== Clawdy leg analyzer (diagnostic) ===\n')
  const world: GroundedWorld = await loadGroundedWorld(REPO_ROOT)
  const groundedPractice = applyCourseMode(world.course, 'practice')
  const groundedDeep = applyCourseMode(world.course, 'practice-deep')
  const examples = buildSyllabusExamples([
    { scenario: groundedPractice.scenario, collider: world.collider },
    { scenario: groundedDeep.scenario, collider: world.collider },
  ])
  const trained = trainDistilledCheckpoint(examples)
  console.log(`trained: hash=${trained.weightsHash.slice(0, 14)} samples=${trained.trainingSummary.sampleCount}\n`)

  const allDivergences: Divergence[] = []
  const summaries: LegSummary[] = []

  const runLeg = (
    scenario: ArenaScenario,
    collider: { vertices: Float32Array; indices: Uint32Array } | null,
    horizonTicks: number,
  ) => {
    for (const side of ['normal', 'swapped'] as const) {
      const { divergences, summary } = analyzeLeg(scenario, trained, side, collider, horizonTicks)
      allDivergences.push(...divergences)
      summaries.push(summary)
      console.log(
        `${summary.leg}/${summary.side}: safe=${summary.safeBanked} trained=${summary.trainedBanked} ` +
        `divergences=${summary.divergences} (edge-only=${summary.edgeOnly}) deltaSum=${summary.deltaSum.toFixed(2)}`,
      )
    }
  }

  for (const scenario of HELD_OUT_SCENARIOS) runLeg(scenario, null, 120)
  for (const mode of ['practice', 'compete'] as CoursePlayMode[]) {
    runLeg(applyCourseMode(world.course, mode).scenario, world.collider, 240)
  }
  for (const layout of generateCourseFamily(world.collider)) runLeg(layout.scenario, world.collider, 240)

  allDivergences.sort((a, b) => Math.abs(b.edgeDelta) - Math.abs(a.edgeDelta))
  const worst = allDivergences.filter(d => d.edgeDelta < 0).slice(0, 25)
  const best = allDivergences.filter(d => d.edgeDelta > 0).slice(0, 25)
  const fmt = (d: Divergence) =>
    `  ${d.leg}/${d.side} t${d.tick}: safe=${d.safeAction.type}${d.safeAction.type === 'move' ? `(${(d.safeAction as { edgeId: string }).edgeId})` : ''}[c${d.safeClass}] ` +
    `trained=${d.trainedAction.type}${d.trainedAction.type === 'move' ? `(${(d.trainedAction as { edgeId: string }).edgeId})` : ''}[c${d.trainedClass}] ` +
    `delta=${d.edgeDelta.toFixed(2)} banked ${d.safeBanked}|${d.trainedBanked}`

  console.log(`\nTop divergences where TRAINED was worse (route-only value of safe pick − trained pick):`)
  for (const d of worst) console.log(fmt(d))
  console.log(`\nTop divergences where TRAINED was better:`)
  for (const d of best) console.log(fmt(d))

  const edgeOnly = allDivergences.filter(d => d.sameClassDiffEdge)
  console.log(`\nTOTALS: divergences=${allDivergences.length} edge-only=${edgeOnly.length} ` +
    `trained-worse=${allDivergences.filter(d => d.edgeDelta < -0.25).length} ` +
    `trained-better=${allDivergences.filter(d => d.edgeDelta > 0.25).length}`)
  console.log(`edge-only delta mass: ${edgeOnly.reduce((t, d) => t + d.edgeDelta, 0).toFixed(2)}`)

  const out = join(REPO_ROOT, 'docs', 'analyze-legs.json')
  writeFileSync(out, JSON.stringify({
    generatedAt: new Date().toISOString(),
    weightsHash: trained.weightsHash,
    legs: summaries,
    divergences: allDivergences,
  }, null, 2))
  console.log(`\nwrote ${out}`)
}

main().catch(err => {
  console.error(`[analyze] unhandled error: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
