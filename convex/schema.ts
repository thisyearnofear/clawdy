import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Season 0 Convex schema.
 *
 * Exhibition trust model: records are keyed by a browser-issued `guestKey`
 * (no Convex Auth yet). Scored-match isolation still lives in the local
 * runner — Convex never sits on the physics / inference path.
 */
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
    /** Full Season 0 checkpoint JSON (small MLP — fine as a document). */
    payload: v.any(),
  })
    .index('by_guest', ['guestKey'])
    .index('by_guest_checkpoint', ['guestKey', 'checkpointId']),

  examples: defineTable({
    guestKey: v.string(),
    exampleId: v.string(),
    sourceEpisodeId: v.string(),
    tick: v.number(),
    approved: v.boolean(),
    rationale: v.string(),
    preferredActionType: v.string(),
    /** Full ArenaTrainingExample JSON. */
    payload: v.any(),
  })
    .index('by_guest', ['guestKey'])
    .index('by_guest_example', ['guestKey', 'exampleId']),

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
    /** Optional lineage: examples that produced the active checkpoint. */
    linkedExampleIds: v.array(v.string()),
  })
    .index('by_guest', ['guestKey'])
    .index('by_guest_match', ['guestKey', 'matchId']),

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
  })
    .index('by_guest', ['guestKey'])
    .index('by_guest_job', ['guestKey', 'jobId']),
})
