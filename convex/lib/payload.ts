import { v } from 'convex/values'

/**
 * Server-side payload validators for the synced training record.
 *
 * These mirror the client types in services/policyModel.ts and
 * services/policyTrainer.ts. The wire stays permissive where the arena owns
 * the schema (observation blobs are versioned by services/arenaEpisode.ts and
 * carried as v.any()) but every Season 0 lineage field is typed here so a
 * corrupt mirror is rejected at write time, not discovered at boot.
 */

const arenaActionV = v.union(
  v.object({ type: v.literal('wait') }),
  v.object({ type: v.literal('bank') }),
  v.object({ type: v.literal('collect') }),
  v.object({ type: v.literal('drain') }),
  v.object({ type: v.literal('move'), edgeId: v.string() }),
)

const policyLayerV = v.object({
  weights: v.array(v.array(v.number())),
  biases: v.array(v.number()),
})

const trainingSummaryV = v.object({
  epochs: v.number(),
  loss: v.number(),
  sampleCount: v.number(),
  datasetHash: v.string(),
  accuracy: v.number(),
})

const trainingConfigV = v.object({
  epochs: v.number(),
  learningRate: v.number(),
  momentum: v.number(),
  weightDecay: v.number(),
  learningRateDecay: v.optional(v.object({ atEpoch: v.number(), factor: v.number() })),
})

const evaluationRecordV = v.object({
  scenarioId: v.string(),
  split: v.union(v.literal('practice'), v.literal('evaluation')),
  banked: v.number(),
  winner: v.union(v.literal('champion'), v.literal('rival'), v.null()),
  recoveries: v.number(),
  weatherDrains: v.number(),
  recordedAt: v.string(),
})

const oracleTeacherV = v.union(v.literal('safe'), v.literal('weather'), v.literal('patience'))

export const checkpointDocV = v.object({
  schemaVersion: v.string(),
  id: v.string(),
  name: v.string(),
  parentCheckpointId: v.union(v.string(), v.null()),
  createdAt: v.string(),
  weightsHash: v.string(),
  trainingSummary: trainingSummaryV,
  trainingConfig: v.optional(trainingConfigV),
  evaluationRecords: v.optional(v.array(evaluationRecordV)),
  weights: v.object({
    hidden1: policyLayerV,
    hidden2: policyLayerV,
    actionHead: policyLayerV,
    // checkpoint v3 adds the linear edge-pointer head; v1/v2 legacy rows
    // (metadata-readable) omit it.
    edgeHead: v.optional(policyLayerV),
  }),
})

export const exampleDocV = v.object({
  id: v.string(),
  sourceEpisodeId: v.string(),
  tick: v.number(),
  /** Arena observations are versioned client-side (arenaEpisode); mirror raw. */
  observation: v.any(),
  originalAction: arenaActionV,
  preferredAction: arenaActionV,
  rationale: v.string(),
  approved: v.boolean(),
  source: v.union(v.literal('draft'), v.literal('approved'), v.literal('generated')),
  provenance: v.optional(
    v.union(
      v.object({ kind: v.literal('human') }),
      v.object({ kind: v.literal('oracle'), teacher: oracleTeacherV, reason: v.string() }),
      v.object({
        kind: v.literal('oracle-consequence'),
        teacher: oracleTeacherV,
        reason: v.string(),
        outcomeDelta: v.number(),
      }),
      // WS1.2 expert iteration lands under this arm; declared here so the
      // validator does not freeze before the trainer emits it.
      v.object({
        kind: v.literal('outcome-argmax'),
        teacher: oracleTeacherV,
        reason: v.string(),
        outcomeDelta: v.number(),
      }),
    ),
  ),
  outcomeDelta: v.optional(v.number()),
})
