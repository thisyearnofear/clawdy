import { createHash } from 'node:crypto'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ARENA_WORLD, buildRushCourse } from './arenaCourse'
import { ARENA_RULES } from './arenaEpisode'
import { ArenaPhysics, ROVER_PHYSICS, initializeArenaPhysics } from './arenaPhysics'
import type { EntrantPolicyOption } from './arenaPolicy'
import { importCheckpointJson } from './checkpointStorage'
import { scoreCheckpoint, type EsContext, type EsScore, type EsTask } from './policyES'
import type { PolicyCheckpoint } from './policyModel'
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

export function runLadder(checkpoint: PolicyCheckpoint, context: EsContext, seeds: number[]): LadderResult {
  const perOpponent = LADDER_OPPONENTS.map((opponent, index): LadderOpponentResult => {
    const tasks: EsTask[] = seeds.map(seed => ({ kind: 'hidden', seed, opponent: index }))
    const score: EsScore = scoreCheckpoint(checkpoint, tasks, context)
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
