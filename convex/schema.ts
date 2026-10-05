import { defineSchema, defineTable } from 'convex/server'
import { authTables } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { checkpointDocV, exampleDocV } from './lib/payload'

/**
 * Season 0 Convex schema — system of record for the coaching lineage.
 *
 * Trust model: records are keyed by a browser-issued `guestKey` (guests) or a
 * server-derived `user-<id>` key (signed in via Convex Auth), owned by
 * `resolveOwner(key)`; see convex/lib/identity.ts. Convex never sits on the physics or
 * inference path.
 *
 * Sync protocol (services/syncEngine.ts ⇄ convex/sync.ts):
 *  - `updatedAtMs`   client wall clock, the LWW proposal.
 *  - `serverSeenAt`  server clock stamped in every mutation; authoritative
 *                    ordering (client ISO strings stay display data).
 *  - `tombstone`     deletes are soft; pulls carry tombstones so every
 *                    device converges.
 *  - `doc`           typed payload (convex/lib/payload.ts). The legacy
 *                    `payload: v.any()` column remains for rows written
 *                    before validation existed; `sync.backfillLegacy` moves
 *                    rows it can, flags the rest `payloadRejected`, and the
 *                    old column is dropped in the follow-up cleanup push.
 *
 * Uniqueness: Convex has no unique index primitive; the `(guestKey, id)`
 * guarantee is transactional — every writer reads by the composite index
 * first (`.unique()`), and Convex transactions serialize conflicting inserts.
 */
const syncFields = {
  owner: v.optional(v.string()),
  updatedAtMs: v.optional(v.number()),
  serverSeenAt: v.optional(v.number()),
  tombstone: v.optional(v.boolean()),
}

/**
 * A build as the league stores it (docs/LEAGUE_PLAN.md shared interfaces).
 * Structural validation only — the stat budget and module list are enforced
 * by services/chassis.ts (Stream A) wherever it is loaded; rows written
 * before then carry whatever validated shape the client sent.
 */
export const buildV = v.object({
  chassis: v.string(),
  points: v.object({
    navigation: v.number(),
    speed: v.number(),
    hardiness: v.number(),
    defence: v.number(),
    attack: v.number(),
  }),
  modules: v.array(v.string()),
})

export default defineSchema({
  ...authTables,

  checkpoints: defineTable({
    guestKey: v.string(),
    checkpointId: v.string(),
    name: v.string(),
    schemaVersion: v.string(),
    parentCheckpointId: v.union(v.string(), v.null()),
    weightsHash: v.string(),
    createdAt: v.string(),
    approvedExampleIds: v.array(v.string()),
    payload: v.optional(v.any()),
    doc: v.optional(checkpointDocV),
    payloadRejected: v.optional(v.boolean()),
    ...syncFields,
  })
    .index('by_guest', ['guestKey'])
    .index('by_guest_checkpoint', ['guestKey', 'checkpointId'])
    .index('by_guest_seen', ['guestKey', 'serverSeenAt']),

  examples: defineTable({
    guestKey: v.string(),
    exampleId: v.string(),
    sourceEpisodeId: v.string(),
    tick: v.number(),
    approved: v.boolean(),
    rationale: v.string(),
    preferredActionType: v.string(),
    payload: v.optional(v.any()),
    doc: v.optional(exampleDocV),
    payloadRejected: v.optional(v.boolean()),
    ...syncFields,
  })
    .index('by_guest', ['guestKey'])
    .index('by_guest_example', ['guestKey', 'exampleId'])
    .index('by_guest_seen', ['guestKey', 'serverSeenAt']),

  matches: defineTable({
    guestKey: v.string(),
    matchId: v.string(),
    scenarioId: v.string(),
    rulesVersion: v.string(),
    scored: v.boolean(),
    checkpointId: v.union(v.string(), v.null()),
    championBanked: v.number(),
    rivalBanked: v.number(),
    winner: v.union(v.string(), v.null()),
    finishedAt: v.string(),
    linkedExampleIds: v.array(v.string()),
    ...syncFields,
  })
    .index('by_guest', ['guestKey'])
    .index('by_guest_match', ['guestKey', 'matchId'])
    .index('by_guest_seen', ['guestKey', 'serverSeenAt']),

  trainingJobs: defineTable({
    guestKey: v.string(),
    jobId: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('running'),
      v.literal('succeeded'),
      v.literal('failed'),
    ),
    parentCheckpointId: v.string(),
    resultCheckpointId: v.union(v.string(), v.null()),
    exampleCount: v.number(),
    message: v.union(v.string(), v.null()),
    updatedAt: v.string(),
    ...syncFields,
  })
    .index('by_guest', ['guestKey'])
    .index('by_guest_job', ['guestKey', 'jobId'])
    .index('by_guest_seen', ['guestKey', 'serverSeenAt']),

  // Server-verified ladder: one best entry per account. Rows are written only by
  // internal mutations after the server has replayed the submission itself.
  // `mode` / `build` / `chassis` are additive (league plan, Stream C): entries
  // submitted before builds existed carry none and group under the default.
  ladder: defineTable({
    userId: v.id('users'),
    displayName: v.string(),
    checkpointId: v.string(),
    weightsHash: v.string(),
    score: v.number(),
    perOpponent: v.array(v.object({
      opponent: v.string(),
      matches: v.number(),
      wins: v.number(),
      losses: v.number(),
      margin: v.number(),
    })),
    seeds: v.array(v.number()),
    rulesVersion: v.string(),
    physicsVersion: v.string(),
    colliderSha256: v.string(),
    verifiedAt: v.number(),
    submissions: v.number(),
    mode: v.optional(v.string()),
    chassis: v.optional(v.string()),
    build: v.optional(buildV),
    /** League season the entry was verified in; missing counts as season 0. */
    season: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_score', ['score']),

  ladderAttempts: defineTable({
    userId: v.id('users'),
    at: v.number(),
  }).index('by_user_at', ['userId', 'at']),

  // League brains (docs/LEAGUE_PLAN.md Stream C): a signed-in player's stored
  // checkpoint plus its build. Guest keys are exhibition-only, so brains are
  // keyed by the verified account id — challenges and tournament pairings
  // must never act on an identity the client supplied.
  brains: defineTable({
    userId: v.id('users'),
    /** Player-chosen slug, unique per account (transactional like sync). */
    brainId: v.string(),
    name: v.string(),
    checkpointId: v.string(),
    weightsHash: v.string(),
    /** The validated PolicyCheckpoint JSON (data only — server-parsed once). */
    checkpointJson: v.string(),
    build: v.optional(buildV),
    chassis: v.optional(v.string()),
    mode: v.string(),
    /** Elo-style rating for pairing; starts at ELO_START. */
    rating: v.number(),
    matchesPlayed: v.number(),
    /** Whether this brain appears in the challenge pool. */
    listed: v.boolean(),
    /** League season the brain was last published in; missing counts as 0. */
    season: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_brain', ['userId', 'brainId'])
    .index('by_mode_listed', ['mode', 'listed']),

  // A challenge between two stored brains, run and scored by the server
  // (convex/leagueRun.ts). The replay lives in file storage; `replayId`
  // points at the replays row that owns it.
  challenges: defineTable({
    challengerUserId: v.id('users'),
    challengerBrainId: v.string(),
    challengerName: v.string(),
    defenderUserId: v.id('users'),
    defenderBrainId: v.string(),
    defenderName: v.string(),
    mode: v.string(),
    seed: v.number(),
    winnerSide: v.union(v.literal('challenger'), v.literal('defender'), v.null()),
    banked: v.array(v.number()),
    status: v.union(v.literal('done'), v.literal('failed')),
    message: v.optional(v.string()),
    replayId: v.optional(v.id('replays')),
    season: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_challenger', ['challengerUserId', 'createdAt'])
    .index('by_defender', ['defenderUserId', 'createdAt']),

  // Stored match replays. The recording JSON is a file in Convex storage —
  // a full match is ~1 MB, past what a document column should carry — and the
  // row carries shareId (a capability slug: holding it is permission to view),
  // the per-side participants, and the attribution markers the sim emitted.
  replays: defineTable({
    shareId: v.string(),
    kind: v.union(v.literal('challenge'), v.literal('tournament')),
    /** challenge doc id or `round-<n>` — ties the replay back to its match. */
    refId: v.string(),
    /** One recording per side, aligned with `championIndex`. */
    storageIds: v.array(v.id('_storage')),
    /** participants[i] took the champion slot in storageIds[championIndex[i]]… */
    participants: v.array(v.object({ name: v.string(), brainId: v.string(), userId: v.id('users') })),
    /** participants index that held the champion slot per recording. */
    championIndex: v.array(v.number()),
    banked: v.array(v.number()),
    winnerIndex: v.union(v.number(), v.null()),
    markers: v.array(v.object({
      type: v.string(),
      tick: v.number(),
      agentId: v.optional(v.string()),
      note: v.optional(v.string()),
      /** Which stored recording the marker came from (one per side). */
      side: v.optional(v.number()),
    })),
    mode: v.string(),
    seed: v.number(),
    rulesVersion: v.string(),
    season: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_share', ['shareId'])
    .index('by_ref', ['refId']),

  // One row per scheduled tournament round (convex/crons.ts → leagueRun.runRound).
  tournamentRounds: defineTable({
    mode: v.string(),
    round: v.number(),
    seed: v.number(),
    pairings: v.number(),
    season: v.optional(v.number()),
    createdAt: v.number(),
  }).index('by_mode', ['mode', 'round']),

  // Forge your champion (docs/LEAGUE_PLAN.md Stream D). One row per forge request.
  // `credits` is reserved while pending/ready and refunded (row marked failed) on
  // any Tripo failure, so the global cap is the sum over pending + ready rows.
  forges: defineTable({
    userId: v.id('users'),
    chassis: v.string(),
    paint: v.string(),
    status: v.union(v.literal('pending'), v.literal('ready'), v.literal('failed')),
    credits: v.number(),
    taskId: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    errorCode: v.optional(v.string()),
    createdAt: v.number(),
    deadline: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId', 'createdAt'])
    .index('by_status', ['status']),
})
