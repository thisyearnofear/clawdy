import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { checkpointDocV, exampleDocV } from './lib/payload'

/**
 * Season 0 Convex schema — system of record for the coaching lineage.
 *
 * Trust model: records are keyed by a browser-issued `guestKey` and owned by
 * `resolveOwner(guestKey)` (convex/lib/identity.ts) — the single seam for a
 * later Convex Auth swap to `user:<id>`. Convex never sits on the physics or
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

export default defineSchema({
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
})
