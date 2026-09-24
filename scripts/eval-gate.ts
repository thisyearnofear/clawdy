/**
 * scripts/eval-gate.ts
 *
 * CI regression gate for the learning loop (docs/COMPATIBILITY.md, move 2).
 * Deterministic end to end: same code → same weightsHash → same pin.
 *
 * What it checks:
 *  1. Distillation determinism — the distilled checkpoint's weightsHash and
 *     datasetHash equal the pin.
 *  2. Matched evaluation — every held-out scenario × {safe, trained} ×
 *     {normal, side-swapped} reproduces the pinned banked/winner/recoveries.
 *  3. Grounded evaluation — practice + compete × {safe, trained} ×
 *     {normal, side-swapped} on isolated physics worlds over the pinned
 *     collider reproduces its pin.
 *  4. Family evaluation — 4 generated layouts × {safe, trained} ×
 *     {normal, side-swapped} on isolated physics reproduces its pin, making
 *     the held-out claim statistical instead of single-layout.
 *  5. Hard floors (independent of the pin) — every run finishes, zero
 *     recoveries anywhere. A crash is a hard failure, never a silent zero.
 *  6. Regression frames — the distilled policy reproduces the expected action
 *     class on every pinned frame in docs/regression-frames.json.
 *
 * Usage:
 *   npm run eval:gate            # compare against the pin, exit 1 on mismatch
 *   npm run eval:gate -- --update  # re-pin numbers AND frame subset, exit 0
 *                                  # (review the diff before committing)
 *
 * The frame corpus pins behaviors the current policy exhibits (passing
 * subset, see metadata). It guards against change; it does not claim
 * capability. Extend it as coaching improves.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ARENA_RULES, type ArenaObservation } from '../services/arenaEpisode'
import { HELD_OUT_SCENARIOS, PRACTICE_SCENARIOS, rejectEvaluationExamples } from '../services/arenaScenarios'
import { collectorPolicy, type EntrantPolicyOption } from '../services/arenaPolicy'
import { ArenaEpisode } from '../services/arenaEpisode'
import { POLICY_SCHEMA_VERSION, classifyAction, createLearnedPolicy, type PolicyCheckpoint } from '../services/policyModel'
import { applyCourseMode } from '../services/arenaCourse'
import {
  buildSyllabusExamples,
  loadGroundedWorld,
  runGroundedMatch,
  runGroundedScenario,
  runMatch,
  trainDistilledCheckpoint,
  type GroundedMatchResult,
  type MatchResult,
} from './eval-lib'
import { generateCourseFamily, type FamilyLayout } from '../services/courseFamily'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..')
const PIN_PATH = join(REPO_ROOT, 'docs', 'eval-gate.json')
const FRAMES_PATH = join(REPO_ROOT, 'docs', 'regression-frames.json')

const UPDATE = process.argv.slice(2).includes('--update')
const FRAMES_PER_SCENARIO = 4

interface RegressionFrame {
  id: string
  scenarioId: string
  tick: number
  observation: ArenaObservation
  expectedAction: ReturnType<typeof collectorPolicy>
  expectedClass: number
  provenance: string
}

interface GatePin {
  version: 1
  generatedAt: string
  rulesVersion: string
  worldNamespace: string
  checkpointSchema: string
  distill: {
    weightsHash: string
    datasetHash: string
    sampleCount: number
    trainingConfig: { epochs: number; learningRate: number; momentum: number; weightDecay: number }
  }
  matches: MatchResult[]
  aggregate: {
    safeTotal: number
    trainedTotal: number
    totalDelta: number
    trainedWinsVsSafe: number
    swappedSafeTotal: number
    swappedTrainedTotal: number
  }
  grounded: {
    matches: GroundedMatchResult[]
    aggregate: {
      safeTotal: number
      trainedTotal: number
      totalDelta: number
    }
  }
  family: {
    layouts: { id: string; seed: number; attempts: number; droppedEdgeIds: string[] }[]
    matches: GroundedMatchResult[]
    aggregate: {
      safeTotal: number
      trainedTotal: number
      totalDelta: number
    }
  }
  frames: { total: number; passed: number; failedIds: string[] }
}

/** Walk a practice scenario under safe-vs-safe and harvest decision frames. */
function harvestCandidateFrames(): RegressionFrame[] {
  const frames: RegressionFrame[] = []
  for (const practice of PRACTICE_SCENARIOS) {
    const episode = new ArenaEpisode(practice)
    let harvested = 0
    while (!episode.finished && harvested < FRAMES_PER_SCENARIO) {
      const tick = episode.tick
      const obs = episode.observe('champion')
      if (!obs.decisionDue) {
        episode.step()
        continue
      }
      const candidates = obs.availableActions.filter(a => a.type !== 'wait')
      const safeAction = collectorPolicy(obs, 'safe')
      if (candidates.length >= 2 && safeAction.type !== 'wait') {
        frames.push({
          id: `frame-${practice.id}-t${tick}`,
          scenarioId: practice.id,
          tick,
          observation: JSON.parse(JSON.stringify(obs)) as ArenaObservation,
          expectedAction: safeAction,
          expectedClass: classifyAction(safeAction, obs),
          provenance: `safe collector on ${practice.id} at tick ${tick}`,
        })
        harvested++
      }
      episode.step([
        { agentId: 'champion', tick, action: safeAction },
        { agentId: 'rival', tick, action: safeAction },
      ])
    }
  }
  return frames
}

function evaluateFrames(trained: PolicyCheckpoint, frames: RegressionFrame[]) {
  const policy = createLearnedPolicy(trained)
  return frames.map(frame => {
    const actual = classifyAction(policy(frame.observation), frame.observation)
    return { id: frame.id, expected: frame.expectedClass, actual, pass: actual === frame.expectedClass }
  })
}

function fail(message: string): never {
  console.error(`\n[gate] FAIL: ${message}`)
  process.exit(1)
}

async function main() {
  console.log('=== Clawdy eval gate ===\n')

  // Load pinned collider first: distillation drinks from the practice-split
  // physical course (openings + travel-time), then the same world feeds
  // grounded + family evaluation. Compete/family never enter the dataset.
  const world = await loadGroundedWorld(REPO_ROOT)
  console.log(`grounded world: ${world.course.config.name} (19 nodes, ${world.course.scenario.edges.length} edges)`)
  const groundedPractice = applyCourseMode(world.course, 'practice')
  const groundedDeep = applyCourseMode(world.course, 'practice-deep')
  const examples = buildSyllabusExamples([
    { scenario: groundedPractice.scenario, collider: world.collider },
    { scenario: groundedDeep.scenario, collider: world.collider },
  ])
  if (examples.length === 0) fail('no synthetic coaching examples generated')
  rejectEvaluationExamples(examples)
  const trained = trainDistilledCheckpoint(examples)
  console.log(`distilled: hash=${trained.weightsHash.slice(0, 14)} dataset=${trained.trainingSummary.datasetHash} samples=${trained.trainingSummary.sampleCount}`)

  // Matched evaluation: every scenario × policy × side.
  const safeOption: EntrantPolicyOption = 'safe'
  const trainedOption: EntrantPolicyOption = { strategy: 'learned', checkpoint: trained }
  const matches: MatchResult[] = []
  const crashes: string[] = []
  for (const scenario of HELD_OUT_SCENARIOS) {
    for (const [option, policy] of [[safeOption, 'safe'], [trainedOption, 'trained']] as const) {
      for (const swapSides of [false, true]) {
        try {
          matches.push(runMatch(scenario, option, { policy, swapSides }))
        } catch (err) {
          crashes.push(`${scenario.id}/${policy}/${swapSides ? 'swapped' : 'normal'}: ${err instanceof Error ? err.message : err}`)
        }
      }
    }
  }
  if (crashes.length > 0) fail(`crashed matches:\n  - ${crashes.join('\n  - ')}`)

  // Grounded course: practice + compete × {safe, trained} × {normal, swapped}
  // on isolated physics worlds over the pinned collider.
  const groundedMatches: GroundedMatchResult[] = []
  for (const mode of ['practice', 'compete'] as const) {
    for (const [option, policy] of [[safeOption, 'safe'], [trainedOption, 'trained']] as const) {
      for (const swapSides of [false, true]) {
        try {
          groundedMatches.push(runGroundedMatch(world, mode, option, { policy, swapSides }))
        } catch (err) {
          crashes.push(`sandstone-${mode}/${policy}/${swapSides ? 'swapped' : 'normal'}: ${err instanceof Error ? err.message : err}`)
        }
      }
    }
  }
  if (crashes.length > 0) fail(`crashed matches:\n  - ${crashes.join('\n  - ')}`)

  // Family layouts: same grammar on new geometry, same collider. Generated
  // deterministically from pinned seeds; rejections would throw here.
  const familyStart = Date.now()
  const family: FamilyLayout[] = generateCourseFamily(world.collider)
  console.log(`family: ${family.length} layouts (${family.map(l => `${l.scenario.id}@${l.attempts}`).join(', ')}) in ${Date.now() - familyStart}ms`)
  const familyMatches: GroundedMatchResult[] = []
  for (const layout of family) {
    for (const [option, policy] of [[safeOption, 'safe'], [trainedOption, 'trained']] as const) {
      for (const swapSides of [false, true]) {
        try {
          familyMatches.push(runGroundedScenario(world, layout.scenario, option, { policy, swapSides }))
        } catch (err) {
          crashes.push(`${layout.scenario.id}/${policy}/${swapSides ? 'swapped' : 'normal'}: ${err instanceof Error ? err.message : err}`)
        }
      }
    }
  }
  if (crashes.length > 0) fail(`crashed matches:\n  - ${crashes.join('\n  - ')}`)

  const allRuns: MatchResult[] = [...matches, ...groundedMatches, ...familyMatches]
  const unfinished = allRuns.filter(m => !m.finished)
  if (unfinished.length > 0) fail(`unfinished runs: ${unfinished.map(m => `${m.scenarioId}/${m.policy}/${m.side}`).join(', ')}`)
  const recovered = allRuns.filter(m => m.recoveries > 0)
  if (recovered.length > 0) {
    fail(`recoveries above the zero floor: ${recovered.map(m => `${m.scenarioId}/${m.policy}/${m.side}=${m.recoveries}`).join(', ')}`)
  }

  // Regression frames.
  let frames: RegressionFrame[]
  if (UPDATE || !existsSync(FRAMES_PATH)) {
    const candidates = harvestCandidateFrames()
    const results = evaluateFrames(trained, candidates)
    const passing = candidates.filter(c => results.find(r => r.id === c.id)?.pass)
    console.log(`frames harvested: ${candidates.length} candidates, ${passing.length} passing (pinning passing subset)`)
    frames = passing
    writeFileSync(FRAMES_PATH, JSON.stringify({
      version: 1,
      pinnedFrom: {
        weightsHash: trained.weightsHash,
        datasetHash: trained.trainingSummary.datasetHash,
        note: 'Passing subset pin — guards against change, does not claim capability. Extend as coaching improves.',
      },
      frames,
    }, null, 2))
    console.log(`wrote ${FRAMES_PATH}`)
  } else {
    const stored = JSON.parse(readFileSync(FRAMES_PATH, 'utf8')) as { frames: RegressionFrame[] }
    frames = stored.frames
  }
  const frameResults = evaluateFrames(trained, frames)
  const frameFailures = frameResults.filter(r => !r.pass)

  const normal = matches.filter(m => m.side === 'normal')
  const swapped = matches.filter(m => m.side === 'swapped')
  const sum = (rows: MatchResult[], policy: 'safe' | 'trained') =>
    rows.filter(r => r.policy === policy).reduce((total, r) => total + r.banked, 0)
  const groundedSafe = groundedMatches.filter(m => m.policy === 'safe').reduce((t, m) => t + m.banked, 0)
  const groundedTrained = groundedMatches.filter(m => m.policy === 'trained').reduce((t, m) => t + m.banked, 0)
  const familySafe = familyMatches.filter(m => m.policy === 'safe').reduce((t, m) => t + m.banked, 0)
  const familyTrained = familyMatches.filter(m => m.policy === 'trained').reduce((t, m) => t + m.banked, 0)
  const actual: GatePin = {
    version: 1,
    generatedAt: new Date().toISOString(),
    rulesVersion: ARENA_RULES.version,
    worldNamespace: 'builder-abstract-v1',
    checkpointSchema: POLICY_SCHEMA_VERSION,
    distill: {
      weightsHash: trained.weightsHash,
      datasetHash: trained.trainingSummary.datasetHash,
      sampleCount: trained.trainingSummary.sampleCount,
      trainingConfig: trained.trainingConfig!,
    },
    matches,
    aggregate: {
      safeTotal: sum(normal, 'safe'),
      trainedTotal: sum(normal, 'trained'),
      totalDelta: sum(normal, 'trained') - sum(normal, 'safe'),
      trainedWinsVsSafe: normal.filter(m => m.policy === 'trained').filter((m, i) =>
        m.banked > normal.filter(n => n.policy === 'safe')[i].banked).length,
      swappedSafeTotal: sum(swapped, 'safe'),
      swappedTrainedTotal: sum(swapped, 'trained'),
    },
    grounded: {
      matches: groundedMatches,
      aggregate: {
        safeTotal: groundedSafe,
        trainedTotal: groundedTrained,
        totalDelta: groundedTrained - groundedSafe,
      },
    },
    family: {
      layouts: family.map(l => ({ id: l.scenario.id, seed: l.seed, attempts: l.attempts, droppedEdgeIds: l.droppedEdgeIds })),
      matches: familyMatches,
      aggregate: {
        safeTotal: familySafe,
        trainedTotal: familyTrained,
        totalDelta: familyTrained - familySafe,
      },
    },
    frames: { total: frames.length, passed: frames.length - frameFailures.length, failedIds: frameFailures.map(f => f.id) },
  }

  console.log('\nMatched results (banked, champion vs greedy rival):')
  console.log('| Scenario | Side | Safe | Trained | Safe winner | Trained winner |')
  console.log('| --- | --- | --- | --- | --- | --- |')
  for (const scenario of HELD_OUT_SCENARIOS) {
    for (const side of ['normal', 'swapped'] as const) {
      const legs = matches.filter(m => m.scenarioId === scenario.id && m.side === side)
      const safeLeg = legs.find(l => l.policy === 'safe')!
      const trainedLeg = legs.find(l => l.policy === 'trained')!
      console.log(`| ${scenario.id} | ${side} | ${safeLeg.banked} | ${trainedLeg.banked} | ${safeLeg.winner ?? 'draw'} | ${trainedLeg.winner ?? 'draw'} |`)
    }
  }
  console.log(`\nframes: ${actual.frames.passed}/${actual.frames.total} passing`)
  if (frameFailures.length > 0) {
    for (const f of frameFailures) console.log(`  FAIL ${f.id}: expected class ${f.expected}, got ${f.actual}`)
  }
  console.log('\nFamily layouts (banked, champion vs greedy rival, isolated physics):')
  console.log('| Layout | Side | Safe | Trained | Safe winner | Trained winner |')
  console.log('| --- | --- | --- | --- | --- | --- |')
  for (const layout of family) {
    for (const side of ['normal', 'swapped'] as const) {
      const legs = familyMatches.filter(m => m.scenarioId === layout.scenario.id && m.side === side)
      const safeLeg = legs.find(l => l.policy === 'safe')!
      const trainedLeg = legs.find(l => l.policy === 'trained')!
      console.log(`| ${layout.scenario.id} | ${side} | ${safeLeg.banked} | ${trainedLeg.banked} | ${safeLeg.winner ?? 'draw'} | ${trainedLeg.winner ?? 'draw'} |`)
    }
  }
  console.log('\nGrounded course (banked, champion vs greedy rival, isolated physics):')
  console.log('| Scenario | Side | Safe | Trained | Safe winner | Trained winner |')
  console.log('| --- | --- | --- | --- | --- | --- |')
  for (const mode of ['practice', 'compete'] as const) {
    for (const side of ['normal', 'swapped'] as const) {
      const legs = groundedMatches.filter(m => m.mode === mode && m.side === side)
      const safeLeg = legs.find(l => l.policy === 'safe')!
      const trainedLeg = legs.find(l => l.policy === 'trained')!
      console.log(`| ${safeLeg.scenarioId} | ${side} | ${safeLeg.banked} | ${trainedLeg.banked} | ${safeLeg.winner ?? 'draw'} | ${trainedLeg.winner ?? 'draw'} |`)
    }
  }

  if (UPDATE) {
    const previous = existsSync(PIN_PATH) ? JSON.parse(readFileSync(PIN_PATH, 'utf8')) as GatePin : null
    writeFileSync(PIN_PATH, JSON.stringify(actual, null, 2))
    console.log(`\nwrote pin ${PIN_PATH}`)
    if (previous && JSON.stringify({ ...previous, generatedAt: '' }) !== JSON.stringify({ ...actual, generatedAt: '' })) {
      console.log('[gate] pin changed vs previous — review the diff before committing.')
    }
    if (frameFailures.length > 0) fail(`${frameFailures.length} pinned frames fail even after update`)
    return
  }

  if (!existsSync(PIN_PATH)) fail(`missing pin ${PIN_PATH} — run with --update to create it`)
  const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8')) as GatePin
  const strip = (p: GatePin) => ({ ...p, generatedAt: '' })
  if (JSON.stringify(strip(pin)) !== JSON.stringify(strip(actual))) {
    const pinMap = new Map(pin.matches.map(m => [`${m.scenarioId}/${m.policy}/${m.side}`, m]))
    console.log('\nDivergent abstract matches (pinned → actual):')
    for (const m of actual.matches) {
      const key = `${m.scenarioId}/${m.policy}/${m.side}`
      const p = pinMap.get(key)
      if (!p || JSON.stringify(p) !== JSON.stringify(m)) {
        console.log(`  ${key}: pinned=${p ? `${p.banked}/${p.winner ?? 'draw'}/rec${p.recoveries}` : 'missing'} actual=${m.banked}/${m.winner ?? 'draw'}/rec${m.recoveries}`)
      }
    }
    const groundedPinMap = new Map(((pin.grounded as GatePin['grounded'] | undefined)?.matches ?? []).map(m => [`${m.scenarioId}/${m.policy}/${m.side}`, m]))
    console.log('Divergent grounded matches (pinned → actual):')
    for (const m of actual.grounded.matches) {
      const key = `${m.scenarioId}/${m.policy}/${m.side}`
      const p = groundedPinMap.get(key)
      if (!p || JSON.stringify(p) !== JSON.stringify(m)) {
        console.log(`  ${key}: pinned=${p ? `${p.banked}/${p.winner ?? 'draw'}/rec${p.recoveries}` : 'missing'} actual=${m.banked}/${m.winner ?? 'draw'}/rec${m.recoveries}`)
      }
    }
    const familyPinMap = new Map(((pin as Partial<GatePin>).family?.matches ?? []).map(m => [`${m.scenarioId}/${m.policy}/${m.side}`, m]))
    console.log('Divergent family matches (pinned → actual):')
    for (const m of actual.family.matches) {
      const key = `${m.scenarioId}/${m.policy}/${m.side}`
      const p = familyPinMap.get(key)
      if (!p || JSON.stringify(p) !== JSON.stringify(m)) {
        console.log(`  ${key}: pinned=${p ? `${p.banked}/${p.winner ?? 'draw'}/rec${p.recoveries}` : 'missing'} actual=${m.banked}/${m.winner ?? 'draw'}/rec${m.recoveries}`)
      }
    }
    if (pin.distill.weightsHash !== actual.distill.weightsHash) {
      console.log(`  distill weightsHash: pinned=${pin.distill.weightsHash.slice(0, 14)} actual=${actual.distill.weightsHash.slice(0, 14)}`)
    }
    fail('gate pin mismatch — behavior changed. Review the diff; re-pin with --update only if the change is intended.')
  }
  if (frameFailures.length > 0) fail(`${frameFailures.length} pinned frames fail`)
  console.log('\n[gate] PASS: 16/16 abstract + 8/8 grounded + 16/16 family legs reproduce the pin, hard floors hold, all frames pass.')
}

main().catch(err => {
  console.error(`\n[gate] FAIL: unhandled error: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
