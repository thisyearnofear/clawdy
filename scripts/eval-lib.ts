/**
 * scripts/eval-lib.ts
 *
 * Shared deterministic evaluation machinery for `eval:holdout` (human-facing
 * report + asset-board artifact) and `eval:gate` (CI regression gate).
 *
 * Frozen training config for the distilled checkpoint lives here — changing it
 * changes measured results and must be reviewed as a migration (see
 * docs/COMPATIBILITY.md §3).
 */
import { SEASON_0_BASE_CHECKPOINT, createLearnedPolicy, type PolicyCheckpoint } from '../services/policyModel'
import { PRACTICE_SCENARIOS, rejectEvaluationExamples } from '../services/arenaScenarios'
import { ArenaEpisode, rolloutOutcomeDelta, type ArenaAction, type ArenaObservation, type ArenaScenario } from '../services/arenaEpisode'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  ARENA_WORLD,
  applyCourseMode,
  buildArenaCourse,
  type ArenaCourse,
  type CoursePlayMode,
} from '../services/arenaCourse'
import { createWorldSurface } from '../services/worldSurface'
import { ArenaPhysics, initializeArenaPhysics } from '../services/arenaPhysics'
import {
  ArenaRunner,
  collectorPolicy,
  routeOracle,
  type EntrantPolicyOption,
} from '../services/arenaPolicy'
import {
  trainPolicyCheckpoint,
  type ArenaTrainingExample,
} from '../services/policyTrainer'

export interface ScenarioResult {
  scenarioId: string
  split: 'practice' | 'evaluation'
  banked: number
  winner: 'champion' | 'rival' | null
  recoveries: number
  weatherDrains: number
}

export interface MatchResult extends ScenarioResult {
  side: 'normal' | 'swapped'
  policy: 'safe' | 'trained'
  finished: boolean
}

export interface GroundedMatchResult extends MatchResult {
  /** Course play mode for base-course legs; absent for family-layout legs. */
  mode?: CoursePlayMode
}

/** Strip gate-only fields back to the frozen asset-board result shape. */
export function toScenarioResult(match: MatchResult): ScenarioResult {
  return {
    scenarioId: match.scenarioId,
    split: match.split,
    banked: match.banked,
    winner: match.winner,
    recoveries: match.recoveries,
    weatherDrains: match.weatherDrains,
  }
}

export interface GroundedWorld {
  course: ArenaCourse
  collider: { vertices: Float32Array; indices: Uint32Array }
}

/**
 * Load the pinned terrain GLB from disk, verify its SHA against ARENA_WORLD,
 * and extract the physics collider. Mirrors the browser loader path
 * (services/arenaTerrain.ts) without fetch. Rapier runtime init is idempotent.
 */
export async function loadGroundedWorld(repoRoot: string): Promise<GroundedWorld> {
  const bytes = new Uint8Array(
    await readFile(join(repoRoot, 'public', 'terrain', 'sandstone-basin.glb')),
  )
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== ARENA_WORLD.colliderSha256) {
    throw new Error(`terrain hash mismatch (got ${digest}, want ${ARENA_WORLD.colliderSha256})`)
  }
  await initializeArenaPhysics()
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '')
  const surface = createWorldSurface(gltf.scene)
  try {
    const collider = surface.colliderData()
    const probe = new ArenaPhysics(collider)
    try {
      return { course: buildArenaCourse(probe), collider }
    } finally {
      probe.dispose()
    }
  } finally {
    surface.dispose()
  }
}

/**
 * Run one grounded-course match on an isolated physics world (same pattern as
 * tournament matches). Swap sides exchanges the two starting bases.
 */
export function runGroundedMatch(
  world: GroundedWorld,
  mode: CoursePlayMode,
  championOption: EntrantPolicyOption,
  opts: { policy: 'safe' | 'trained'; swapSides?: boolean },
): GroundedMatchResult {
  const { scenario } = applyCourseMode(world.course, mode)
  return runGroundedScenario(world, scenario, championOption, { ...opts, mode })
}

/**
 * Run an arbitrary prebuilt scenario (course mode or family layout) on an
 * isolated physics world. Returns the layout mode for course scenarios and
 * the layout index for family scenarios via scenarioId.
 */
export function runGroundedScenario(
  world: GroundedWorld,
  scenario: ArenaScenario,
  championOption: EntrantPolicyOption,
  opts: { policy: 'safe' | 'trained'; swapSides?: boolean; mode?: CoursePlayMode },
): GroundedMatchResult {
  const entrants: ArenaScenario['entrants'] = opts.swapSides
    ? [
        { ...scenario.entrants[0], baseNode: scenario.entrants[1].baseNode },
        { ...scenario.entrants[1], baseNode: scenario.entrants[0].baseNode },
      ]
    : scenario.entrants
  const motion = new ArenaPhysics(world.collider)
  try {
    const runner = new ArenaRunner(
      { ...scenario, entrants },
      { champion: championOption, rival: 'greedy' },
      motion,
    )
    runner.advanceTicks(scenario.durationTicks)
    const snap = runner.snapshot()
    const champ = snap.agents.find(a => a.id === 'champion')!

    let weatherDrains = 0
    for (const batch of runner.recording().batches) {
      for (const request of batch.requests) {
        if (request.agentId === 'champion' && request.action?.type === 'drain') weatherDrains++
      }
    }

    return {
      scenarioId: scenario.id,
      split: scenario.split,
      mode: opts.mode,
      side: opts.swapSides ? 'swapped' : 'normal',
      policy: opts.policy,
      banked: champ.banked,
      winner: snap.winner as 'champion' | 'rival' | null,
      recoveries: champ.recoveries,
      weatherDrains,
      finished: snap.status === 'finished',
    }
  } finally {
    motion.dispose()
  }
}

/** Frozen distill config — pinned by services/__tests__/versions.test.ts. */
export const DISTILL_TRAINING_CONFIG = Object.freeze({
  epochs: 60,
  learningRate: 0.005,
})

/**
 * Build the oracle-routed consequence dataset across the practice syllabus
 * (base three + challenge three). Each decision tick is routed to the single
 * honest teacher (weather/patience/safe); in-transit ticks with no choice
 * are skipped. Outcome check: each label is verified by a short
 * counterfactual rollout (oracle branch vs learner-policy branch, safe
 * continuation, greedy rival) and weighted by the measured banked delta, so
 * high-stakes timing frames move the weights more than routine routing.
 * Contrast: the recorded original is the best *losing* alternative so the
 * net learns targeting, not just corridor intent.
 *
 * Integrity: practice split only (guarded by rejectEvaluationExamples);
 * held-out scenarios are never touched here. Deterministic: same code →
 * same datasetHash → same weightsHash.
 */

/**
 * Build a synthetic coaching set by distilling the rule-based safe collector
 * across the three practice scenarios. For each decision tick where the safe
 * collector would take a non-trivial action, emit a training example that
 * says "in this observation, the preferred action is what safe would do".
 *
 * Patience supervision: when safe would wait out an active flood (only wait
 * is meaningfully safe — draining from a dry station or wandering into a
 * 4x corridor is worse), emit a capped number of wait examples per scenario.
 * Without these the net never learns timing — every label is an action, so
 * the fallback head always prefers *something* over sitting out the water.
 */
export function buildSyntheticExamples(): ArenaTrainingExample[] {
  const examples: ArenaTrainingExample[] = []
  // Base learner for consequence rollouts AND disagreement mining: the frozen
  // v2 base checkpoint's policy (what the student would do before coaching).
  const basePolicy = createLearnedPolicy(SEASON_0_BASE_CHECKPOINT)
  const championContinuation = (obs: ArenaObservation) => collectorPolicy(obs, 'safe')
  const rivalContinuation = (obs: ArenaObservation) => collectorPolicy(obs, 'greedy')

  // Phase 1 — oracle path: walk the syllabus with oracle actions, emitting
  // routed labels (safe routing + patience waits). Per-SCENARIO caps (not
  // global) so every syllabus board — especially the challenge variants —
  // contributes labels; global caps let the first scenario eat the budget.
  const seenTicks = new Set<string>()
  const teacherTotals = { safe: 0, weather: 0, patience: 0 }
  const TEACHER_TOTAL_CAPS = { safe: 85, weather: 12, patience: 10 }

  const tryEmit = (
    practice: (typeof PRACTICE_SCENARIOS)[number],
    tick: number,
    champObs: ArenaObservation,
    snapshot: Parameters<typeof rolloutOutcomeDelta>[1],
    label: { action: ArenaAction; teacher: 'safe' | 'weather' | 'patience'; reason: string },
    candidates: ArenaAction[],
  ): boolean => {
    const key = `${practice.id}:${tick}`
    if (seenTicks.has(key) || teacherTotals[label.teacher] >= TEACHER_TOTAL_CAPS[label.teacher]) return false
    // Contrast original: the base learner's pick when it disagrees (that IS
    // the mistake); else any non-oracle candidate. In-transit patience
    // labels (only wait legal) record drain as the losing alternative so the
    // fallback head learns wait-over-drain timing.
    const learnerPick = basePolicy(champObs)
    const recorded =
      JSON.stringify(learnerPick) !== JSON.stringify(label.action) ? learnerPick
      : label.action.type === 'wait' ? { type: 'drain' } as ArenaAction
      : (candidates.find(candidate => JSON.stringify(candidate) !== JSON.stringify(label.action)) ?? candidates[0])
    const outcomeDelta = rolloutOutcomeDelta(
      practice,
      snapshot,
      label.action,
      recorded,
      championContinuation,
      rivalContinuation,
      120,
    )
    // Labels the rollout contradicts are dropped — the teacher was wrong
    // there and the outcome overrides. Tolerance: fractional deltas below
    // 0.25 are rollout noise (cargo/collect weighting), not contradiction;
    // only strictly negative, meaningful deltas veto.
    if (outcomeDelta < -0.25) return false
    seenTicks.add(key)
    teacherTotals[label.teacher]++
    examples.push({
      id: `distill-${practice.id}-${tick}`,
      sourceEpisodeId: practice.id,
      tick,
      observation: champObs,
      originalAction: recorded,
      preferredAction: label.action,
      rationale:
        label.teacher === 'safe' ? `Safe collector would ${label.action.type}${label.action.type === 'move' ? ' along a non-floodable route when applicable' : ''}.`
        : label.teacher === 'weather' ? 'Weather oracle would drain while swimming flood water (measured).'
        : 'Patience oracle would wait out the flood with cargo aboard (measured).',
      approved: true,
      source: 'approved',
      provenance: { kind: 'oracle-consequence', teacher: label.teacher, reason: label.reason, outcomeDelta },
      outcomeDelta,
    })
    return true
  }

  for (const practice of PRACTICE_SCENARIOS) {
    const episode = new ArenaEpisode(practice)
    // Per-scenario emit budget + per-teacher per-scenario caps: every board
    // teaches, no board dominates.
    let emittedHere = 0
    const hereCounts = { safe: 0, weather: 0, patience: 0 }

    while (!episode.finished && examples.length < 150) {
      const tick = episode.tick
      const champObs = episode.observe('champion')
      if (!champObs.decisionDue) {
        episode.step()
        continue
      }

      const candidates = champObs.availableActions.filter(a => a.type !== 'wait')
      // In-transit patience states (only wait legal, flooded, cargo aboard)
      // emit here too: the base fallback predicts drain there, so a wait
      // label teaches timing the oracle path otherwise never demonstrates.
      const transitPatience =
        candidates.length === 0 &&
        champObs.self.transit !== null &&
        champObs.self.cargo > 0 &&
        champObs.weather.flooded
      if ((candidates.length >= 2 || transitPatience) && emittedHere < 25) {
        const label = routeOracle(champObs)
        if (label) {
          // Timing labels are rare by design: patience over-generalizes
          // (wait ↔ cargo) if it exceeds ~15% of the set. Routing dominates.
          const perTeacherCap = label.teacher === 'safe' ? 17 : label.teacher === 'weather' ? 4 : 3
          if (hereCounts[label.teacher] < perTeacherCap) {
            const before = examples.length
            if (tryEmit(practice, tick, champObs, episode.snapshot(), label, candidates.length > 0 ? candidates : champObs.availableActions) && examples.length > before) {
              emittedHere++
              hereCounts[label.teacher]++
            }
          }
        }
      }
      // Walk the syllabus with oracle actions so later states stay on-policy.
      const fallback = routeOracle(champObs)?.action ?? collectorPolicy(champObs, 'safe')
      episode.step([
        { agentId: 'champion', tick, action: fallback },
        { agentId: 'rival', tick, action: fallback },
      ])
    }
  }

  // Phase 2 — disagreement mining: walk the syllabus with the BASE policy
  // (the student's actual behavior) and emit oracle corrections wherever the
  // base disagrees. This is where weather labels come from: the base wanders
  // into flood water in transit, and the oracle demonstrates drain. Also
  // surfaces junction mistakes (wrong ridge) the oracle path never visits.
  // Same per-scenario discipline: every board contributes, none dominates.
  for (const practice of PRACTICE_SCENARIOS) {
    const episode = new ArenaEpisode(practice)
    let minedHere = 0

    while (!episode.finished && examples.length < 200) {
      const tick = episode.tick
      const champObs = episode.observe('champion')
      if (!champObs.decisionDue) {
        episode.step()
        continue
      }
      const baseAction = basePolicy(champObs)
      const label = routeOracle(champObs)
      if (label && JSON.stringify(baseAction) !== JSON.stringify(label.action) && minedHere < 12) {
        const before = examples.length
        if (tryEmit(practice, tick, champObs, episode.snapshot(), label, champObs.availableActions) && examples.length > before) {
          minedHere++
        }
      }
      episode.step([
        { agentId: 'champion', tick, action: baseAction },
        { agentId: 'rival', tick, action: collectorPolicy(episode.observe('rival'), 'greedy') },
      ])
    }
  }

  rejectEvaluationExamples(examples)
  return examples
}

/** Train the distilled champion from oracle-routed consequence examples (frozen config). */
export function trainDistilledCheckpoint(examples: ArenaTrainingExample[]): PolicyCheckpoint {
  const approved = examples.filter(e => e.approved)
  // Consequence weights: 1 + clamped outcome delta (routine 1.0 → verified 3.0).
  // Floor at 0.5 (never zero — every kept label teaches something); vetoed
  // labels never reach here (dropped in tryEmit).
  const sampleWeights = approved.map(e => Math.max(0.5, 1 + Math.min(2, Math.max(-0.25, e.outcomeDelta ?? 0))))
  return trainPolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, examples, {
    ...DISTILL_TRAINING_CONFIG,
    sampleWeights,
    name: `Champion v1 (+${examples.length} synthetic examples)`,
  })
}

/**
 * Run one scenario with the given champion strategy against the greedy rival.
 * With `swapSides`, champion and rival exchange starting bases — the matched
 * comparison that exposes side bias. A crash propagates as an exception so
 * the gate records it as a hard failure, never a silent zero.
 */
export function runMatch(
  scenario: ArenaScenario,
  championOption: EntrantPolicyOption,
  opts: { policy: 'safe' | 'trained'; swapSides?: boolean },
): MatchResult {
  const entrants: ArenaScenario['entrants'] = opts.swapSides
    ? [
        { ...scenario.entrants[0], baseNode: scenario.entrants[1].baseNode },
        { ...scenario.entrants[1], baseNode: scenario.entrants[0].baseNode },
      ]
    : scenario.entrants
  const runner = new ArenaRunner(
    { ...scenario, entrants },
    { champion: championOption, rival: 'greedy' },
  )
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
    side: opts.swapSides ? 'swapped' : 'normal',
    policy: opts.policy,
    banked: champ.banked,
    winner: snap.winner as 'champion' | 'rival' | null,
    recoveries: champ.recoveries,
    weatherDrains,
    finished: snap.status === 'finished',
  }
}
