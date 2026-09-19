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
import { SEASON_0_BASE_CHECKPOINT, type PolicyCheckpoint } from '../services/policyModel'
import { PRACTICE_SCENARIOS } from '../services/arenaScenarios'
import type { ArenaScenario } from '../services/arenaEpisode'
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
  type EntrantPolicyOption,
} from '../services/arenaPolicy'
import { ArenaEpisode } from '../services/arenaEpisode'
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
  learningRate: 0.02,
})

/**
 * Build a synthetic coaching set by distilling the rule-based safe collector
 * across the three practice scenarios. For each decision tick where the safe
 * collector would take a non-trivial action, emit a training example that
 * says "in this observation, the preferred action is what safe would do".
 */
export function buildSyntheticExamples(): ArenaTrainingExample[] {
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

      episode.step([
        { agentId: 'champion', tick, action: safeAction },
        { agentId: 'rival', tick, action: safeAction },
      ])
    }
  }

  return examples
}

/** Train the distilled champion from synthetic examples (frozen config). */
export function trainDistilledCheckpoint(examples: ArenaTrainingExample[]): PolicyCheckpoint {
  return trainPolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, examples, {
    ...DISTILL_TRAINING_CONFIG,
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
