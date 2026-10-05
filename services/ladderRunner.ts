import { createHash } from 'node:crypto'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ARENA_WORLD, buildRushCourse } from './arenaCourse'
import { buildToTraits, budgetSpent, STAT_BUDGET, validateBuild, type Build, type RulesetId } from './chassis'
import { ARENA_RULES, type ArenaRecording, type ArenaScenario, type EntrantTraits } from './arenaEpisode'
import { ArenaPhysics, ROVER_PHYSICS, initializeArenaPhysics } from './arenaPhysics'
import { ArenaRunner, type EntrantPolicyOption } from './arenaPolicy'
import { replayArenaEpisode } from './arenaReplay'
import { importCheckpointJson } from './checkpointStorage'
import { scoreCheckpoint, type EsContext, type EsScore, type EsTask } from './policyES'
import type { PolicyCheckpoint } from './policyModel'
import { rushVariant, swapSides } from './rushVariants'
import { SEASON_0_STARTER_CHECKPOINT } from './starterCheckpoint'
import { createWorldSurface } from './worldSurface'

/**
 * Server-side ladder evaluation. A submitted checkpoint is re-played here on
 * the pinned terrain against the house bots; nothing the client reports is
 * trusted. Pure of Convex so the same code runs in an action, a script, or a test.
 */

export const LADDER_OPPONENTS = ['safe', 'greedy', 'weather', 'poach', 'starter'] as const
export type LadderOpponent = (typeof LADDER_OPPONENTS)[number]

/** Hard opponents count double: beating the weak bots is not what the ladder rewards. */
const OPPONENT_WEIGHT: Record<LadderOpponent, number> = { safe: 2, greedy: 1, weather: 2, poach: 1, starter: 1 }

/** Fresh hidden variants per submission, each played on both sides. */
export const LADDER_VARIANTS = 6

/** Upper bound on a submission body (a 38x32 policy is well under 100 KB of JSON). */
export const MAX_CHECKPOINT_JSON_BYTES = 1_000_000

export interface LadderOpponentResult {
  opponent: LadderOpponent
  matches: number
  wins: number
  losses: number
  margin: number
}

export interface LadderResult {
  /** Points in [-100, 100]: weighted (wins - losses) / matches across opponents. */
  score: number
  perOpponent: LadderOpponentResult[]
  seeds: number[]
  rulesVersion: string
  physicsVersion: string
  colliderSha256: string
}

export function ladderScore(perOpponent: readonly Pick<LadderOpponentResult, 'opponent' | 'matches' | 'wins' | 'losses'>[]): number {
  let weighted = 0
  let weights = 0
  for (const result of perOpponent) {
    if (result.matches === 0) continue
    const weight = OPPONENT_WEIGHT[result.opponent]
    weighted += weight * ((result.wins - result.losses) / result.matches)
    weights += weight
  }
  return weights === 0 ? 0 : Math.round((weighted / weights) * 1000) / 10
}

export function parseSubmission(json: string): PolicyCheckpoint {
  if (new TextEncoder().encode(json).byteLength > MAX_CHECKPOINT_JSON_BYTES) throw new Error('checkpoint is too large')
  // Throws on anything validateCheckpoint rejects (shape, widths, finite weights, hash).
  return importCheckpointJson(json)
}

/** Verifies the pinned collider bytes and builds the Rush scenario the ladder plays. */
export async function buildLadderContext(colliderBytes: Uint8Array): Promise<EsContext> {
  const digest = createHash('sha256').update(colliderBytes).digest('hex')
  if (digest !== ARENA_WORLD.colliderSha256) throw new Error('terrain hash mismatch')
  await initializeArenaPhysics()
  const buffer = colliderBytes.buffer.slice(colliderBytes.byteOffset, colliderBytes.byteOffset + colliderBytes.byteLength) as ArrayBuffer
  const gltf = await new GLTFLoader().parseAsync(buffer, '')
  const surface = createWorldSurface(gltf.scene)
  try {
    const probe = new ArenaPhysics(surface.colliderData())
    try {
      const opponents: EntrantPolicyOption[] = ['safe', 'greedy', 'weather', 'poach', { strategy: 'learned', checkpoint: SEASON_0_STARTER_CHECKPOINT }]
      return { rushBase: buildRushCourse(probe).scenario, opponents }
    } finally {
      probe.dispose()
    }
  } finally {
    surface.dispose()
  }
}

export function ladderSeeds(base: number, count = LADDER_VARIANTS): number[] {
  return Array.from({ length: count }, (_, index) => (base + index) >>> 0)
}

export function runLadder(checkpoint: PolicyCheckpoint, context: EsContext, seeds: number[], traits?: EntrantTraits): LadderResult {
  const perOpponent = LADDER_OPPONENTS.map((opponent, index): LadderOpponentResult => {
    const tasks: EsTask[] = seeds.map(seed => ({ kind: 'hidden', seed, opponent: index }))
    const score: EsScore = scoreCheckpoint(checkpoint, tasks, context, traits)
    return { opponent, matches: score.matches, wins: score.wins, losses: score.losses, margin: Math.round(score.margin * 100) / 100 }
  })
  return {
    score: ladderScore(perOpponent),
    perOpponent,
    seeds,
    rulesVersion: ARENA_RULES.version,
    physicsVersion: ROVER_PHYSICS.version,
    colliderSha256: ARENA_WORLD.colliderSha256,
  }
}

// ------------------------------------------------------------------ builds

/**
 * The league's build gate, shared by ladder submits and PvP. `validateBuild`
 * only checks the flat stat cap; the escalating point-buy curve
 * (`budgetSpent`) is the match authority's own check — a hand-authored build
 * can be flat-legal yet over the curve, and it must not race.
 */
export function legalLeagueBuild(build: { chassis: string; points: Record<string, number>; modules: string[] } | undefined): Build | undefined {
  if (!build) return undefined
  const typed = build as Build
  if (validateBuild(typed).length > 0 || budgetSpent(typed) > STAT_BUDGET) return undefined
  return typed
}

/** Simulation traits for a stored build, or the hauler baseline when absent/illegal. */
export function traitsForBuild(build: { chassis: string; points: Record<string, number>; modules: string[] } | undefined, rulesetId?: RulesetId): EntrantTraits | undefined {
  const legal = legalLeagueBuild(build)
  return legal ? buildToTraits(legal, rulesetId) : undefined
}

// ------------------------------------------------------------------ PvP

/**
 * One stored brain on the league: a validated checkpoint plus the optional
 * per-entrant sim overrides a build produced (`services/chassis.ts`, Stream A).
 * `traits` is `undefined` for brains published before builds existed — they
 * run on the pinned `ARENA_RULES` exactly like a ladder submission.
 */
export interface MatchEntrant {
  checkpoint: PolicyCheckpoint
  traits?: EntrantTraits
}

export interface MatchResult {
  /** `a` / `b` by aggregate banked across both sides; null on an exact tie. */
  winner: 'a' | 'b' | null
  banked: { a: number; b: number }
  margin: number
  /** One recording per side: [0] has `a` as champion, [1] has `b` as champion. */
  recordings: [ArenaRecording, ArenaRecording]
  seed: number
  rulesVersion: string
  /** Both recordings re-simulated cleanly (fail-closed: a diverging replay throws instead). */
  replayVerified: true
}

function withTraits(scenario: ArenaScenario, champion: MatchEntrant, rival: MatchEntrant): ArenaScenario {
  return {
    ...scenario,
    entrants: [
      { ...scenario.entrants[0], traits: champion.traits },
      { ...scenario.entrants[1], traits: rival.traits },
    ],
  }
}

function playSide(scenario: ArenaScenario, champion: MatchEntrant, rival: MatchEntrant): { recording: ArenaRecording; banked: [number, number] } {
  const runner = new ArenaRunner(
    withTraits(scenario, champion, rival),
    {
      champion: { strategy: 'learned', checkpoint: champion.checkpoint },
      rival: { strategy: 'learned', checkpoint: rival.checkpoint },
    },
    undefined,
    { record: true },
  )
  runner.advanceTicks(scenario.durationTicks)
  const recording = runner.recording()
  const final = runner.snapshot()
  const banked: [number, number] = [
    final.agents.find(agent => agent.id === 'champion')!.banked,
    final.agents.find(agent => agent.id === 'rival')!.banked,
  ]
  return { recording, banked }
}

/**
 * `runMatch(brainA, brainB, scenario, seed)` — the shared PvP contract
 * (docs/LEAGUE_PLAN.md). Two learned policies race a fresh hidden Rush
 * variant, once on each side so neither keeps a base advantage; the winner is
 * decided by aggregate banked. Route-only like the ladder (no physics motion):
 * deterministic, cheap enough to run inside a Convex action, and honest — the
 * recording is re-simulated before it is returned, so a stored replay is
 * always a faithful receipt.
 */
export function runMatch(a: MatchEntrant, b: MatchEntrant, base: ArenaScenario, seed: number, rulesetId?: RulesetId): MatchResult {
  if (!Number.isSafeInteger(seed)) throw new Error('Match seed must be an integer')
  // The tag rides in the scenario, hence in both stored recordings: a replay
  // names the ruleset it was played under and re-simulates from its own traits.
  const variant = { ...rushVariant(base, 'hidden', seed), ...(rulesetId ? { rulesetId } : {}) }
  const first = playSide(variant, a, b)
  const second = playSide(swapSides(variant), b, a)
  const banked = { a: first.banked[0] + second.banked[1], b: first.banked[1] + second.banked[0] }
  for (const { recording } of [first, second]) {
    if (replayArenaEpisode(recording).divergedAt !== null) {
      throw new Error('match replay diverged — refusing to record an unverifiable result')
    }
  }
  return {
    winner: banked.a === banked.b ? null : banked.a > banked.b ? 'a' : 'b',
    banked,
    margin: banked.a - banked.b,
    recordings: [first.recording, second.recording],
    seed,
    rulesVersion: ARENA_RULES.version,
    replayVerified: true,
  }
}
