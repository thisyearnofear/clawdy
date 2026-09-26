import { ConvexError, v } from 'convex/values'
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server'
import { checkpointDocV, exampleDocV } from './lib/payload'
import { resolveOwner } from './lib/identity'

/**
 * Offline-first sync protocol — the only Convex surface the client uses.
 *
 * Ordering: `updatedAtMs` is the client's LWW proposal; ties and stale
 * proposals are resolved against the existing row, and every accepted write
 * re-stamps `serverSeenAt` from the server clock so pulls converge to the
 * same total order on every device.
 *
 * Caps count live (non-tombstone) rows per guest and are enforced at WRITE
 * time — a mirror that silently grows past the client caps is not a system
 * of record, it is a liability.
 */

const CAPS = { checkpoints: 40, examples: 200, matches: 50, jobs: 40 } as const

const lwwResultV = v.union(
  v.object({ status: v.literal('ok'), serverSeenAt: v.number() }),
  v.object({
    status: v.literal('rejected-stale'),
    serverSeenAt: v.union(v.number(), v.null()),
    updatedAtMs: v.union(v.number(), v.null()),
  }),
  v.object({ status: v.literal('rejected-tombstone'), serverSeenAt: v.number() }),
)

const backfillCountsV = v.object({
  migrated: v.number(),
  rejected: v.number(),
  skipped: v.number(),
})

const syncMetaV = {
  owner: v.optional(v.string()),
  updatedAtMs: v.optional(v.number()),
  serverSeenAt: v.optional(v.number()),
  tombstone: v.optional(v.boolean()),
}

function countLive(rows: { tombstone?: boolean }[]): number {
  return rows.filter(row => row.tombstone !== true).length
}

export const pull = query({
  args: { guestKey: v.string() },
  returns: v.object({
    checkpoints: v.array(v.object({
      checkpointId: v.string(),
      name: v.string(),
      schemaVersion: v.string(),
      parentCheckpointId: v.union(v.string(), v.null()),
      weightsHash: v.string(),
      createdAt: v.string(),
      approvedExampleIds: v.array(v.string()),
      doc: v.optional(checkpointDocV),
      legacyPayload: v.optional(v.any()),
      payloadRejected: v.optional(v.boolean()),
      ...syncMetaV,
    })),
    examples: v.array(v.object({
      exampleId: v.string(),
      sourceEpisodeId: v.string(),
      tick: v.number(),
      approved: v.boolean(),
      rationale: v.string(),
      preferredActionType: v.string(),
      doc: v.optional(exampleDocV),
      legacyPayload: v.optional(v.any()),
      payloadRejected: v.optional(v.boolean()),
      ...syncMetaV,
    })),
    matches: v.array(v.object({
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
      ...syncMetaV,
    })),
    trainingJobs: v.array(v.object({
      jobId: v.string(),
      status: v.string(),
      parentCheckpointId: v.string(),
      resultCheckpointId: v.union(v.string(), v.null()),
      exampleCount: v.number(),
      message: v.union(v.string(), v.null()),
      updatedAt: v.string(),
      ...syncMetaV,
    })),
    serverTime: v.number(),
  }),
  handler: async (ctx, args) => {
    const owner = resolveOwner(args.guestKey)

    const checkpoints = await ctx.db
      .query('checkpoints')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(CAPS.checkpoints + 20)
    const examples = await ctx.db
      .query('examples')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(CAPS.examples + 20)
    const matches = await ctx.db
      .query('matches')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(CAPS.matches + 20)
    const trainingJobs = await ctx.db
      .query('trainingJobs')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(CAPS.jobs + 20)

    return {
      checkpoints: checkpoints
        .filter(row => row.owner === owner)
        .map(row => ({
          checkpointId: row.checkpointId,
          name: row.name,
          schemaVersion: row.schemaVersion,
          parentCheckpointId: row.parentCheckpointId,
          weightsHash: row.weightsHash,
          createdAt: row.createdAt,
          approvedExampleIds: row.approvedExampleIds,
          doc: row.doc,
          legacyPayload: row.doc === undefined ? row.payload : undefined,
          owner: row.owner,
          updatedAtMs: row.updatedAtMs,
          serverSeenAt: row.serverSeenAt,
          tombstone: row.tombstone,
          payloadRejected: row.payloadRejected,
        })),
      examples: examples
        .filter(row => row.owner === owner)
        .map(row => ({
          exampleId: row.exampleId,
          sourceEpisodeId: row.sourceEpisodeId,
          tick: row.tick,
          approved: row.approved,
          rationale: row.rationale,
          preferredActionType: row.preferredActionType,
          doc: row.doc,
          legacyPayload: row.doc === undefined ? row.payload : undefined,
          owner: row.owner,
          updatedAtMs: row.updatedAtMs,
          serverSeenAt: row.serverSeenAt,
          tombstone: row.tombstone,
          payloadRejected: row.payloadRejected,
        })),
      matches: matches
        .filter(row => row.owner === owner)
        .map(row => ({
          matchId: row.matchId,
          scenarioId: row.scenarioId,
          rulesVersion: row.rulesVersion,
          scored: row.scored,
          checkpointId: row.checkpointId,
          championBanked: row.championBanked,
          rivalBanked: row.rivalBanked,
          winner: row.winner,
          finishedAt: row.finishedAt,
          linkedExampleIds: row.linkedExampleIds,
          owner: row.owner,
          updatedAtMs: row.updatedAtMs,
          serverSeenAt: row.serverSeenAt,
          tombstone: row.tombstone,
        })),
      trainingJobs: trainingJobs
        .filter(row => row.owner === owner)
        .map(row => ({
          jobId: row.jobId,
          status: row.status,
          parentCheckpointId: row.parentCheckpointId,
          resultCheckpointId: row.resultCheckpointId,
          exampleCount: row.exampleCount,
          message: row.message,
          updatedAt: row.updatedAt,
          owner: row.owner,
          updatedAtMs: row.updatedAtMs,
          serverSeenAt: row.serverSeenAt,
          tombstone: row.tombstone,
        })),
      serverTime: Date.now(),
    }
  },
})

/**
 * Shared LWW decision: stale/tombstoned rows refuse the proposal; fresh ones
 * accept and re-stamp the server clock. `doc`-bearing tables validate the
 * payload at write time through the schema column itself.
 */
function lwwGate(existing: { tombstone?: boolean; updatedAtMs?: number; serverSeenAt?: number } | null, incomingMs: number) {
  if (!existing) return { kind: 'insert' as const }
  if (existing.tombstone === true) {
    return { kind: 'tombstoned' as const, serverSeenAt: existing.serverSeenAt ?? Date.now() }
  }
  if ((existing.updatedAtMs ?? 0) >= incomingMs) {
    return {
      kind: 'stale' as const,
      serverSeenAt: existing.serverSeenAt ?? null,
      updatedAtMs: existing.updatedAtMs ?? null,
    }
  }
  return { kind: 'patch' as const }
}

export const upsertCheckpoint = mutation({
  args: {
    guestKey: v.string(),
    checkpointId: v.string(),
    name: v.string(),
    schemaVersion: v.string(),
    parentCheckpointId: v.union(v.string(), v.null()),
    weightsHash: v.string(),
    createdAt: v.string(),
    approvedExampleIds: v.array(v.string()),
    doc: checkpointDocV,
    updatedAtMs: v.number(),
  },
  returns: lwwResultV,
  handler: async (ctx, args) => {
    const owner = resolveOwner(args.guestKey)
    const existing = await ctx.db
      .query('checkpoints')
      .withIndex('by_guest_checkpoint', q => q.eq('guestKey', args.guestKey).eq('checkpointId', args.checkpointId))
      .unique()

    const gate = lwwGate(existing, args.updatedAtMs)
    if (gate.kind === 'tombstoned') return { status: 'rejected-tombstone' as const, serverSeenAt: gate.serverSeenAt }
    if (gate.kind === 'stale') return { status: 'rejected-stale' as const, serverSeenAt: gate.serverSeenAt, updatedAtMs: gate.updatedAtMs }

    const serverSeenAt = Date.now()
    if (gate.kind === 'patch' && existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        schemaVersion: args.schemaVersion,
        parentCheckpointId: args.parentCheckpointId,
        weightsHash: args.weightsHash,
        createdAt: args.createdAt,
        approvedExampleIds: args.approvedExampleIds,
        doc: args.doc,
        payload: undefined,
        owner,
        updatedAtMs: args.updatedAtMs,
        serverSeenAt,
      })
      return { status: 'ok' as const, serverSeenAt }
    }

    const liveRows = await ctx.db
      .query('checkpoints')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(CAPS.checkpoints + 1)
    if (countLive(liveRows) >= CAPS.checkpoints) throw new ConvexError('cap-exceeded')
    await ctx.db.insert('checkpoints', {
      guestKey: args.guestKey,
      checkpointId: args.checkpointId,
      name: args.name,
      schemaVersion: args.schemaVersion,
      parentCheckpointId: args.parentCheckpointId,
      weightsHash: args.weightsHash,
      createdAt: args.createdAt,
      approvedExampleIds: args.approvedExampleIds,
      doc: args.doc,
      owner,
      updatedAtMs: args.updatedAtMs,
      serverSeenAt,
      tombstone: false,
    })
    return { status: 'ok' as const, serverSeenAt }
  },
})

export const upsertExample = mutation({
  args: {
    guestKey: v.string(),
    exampleId: v.string(),
    sourceEpisodeId: v.string(),
    tick: v.number(),
    approved: v.boolean(),
    rationale: v.string(),
    preferredActionType: v.string(),
    doc: exampleDocV,
    updatedAtMs: v.number(),
  },
  returns: lwwResultV,
  handler: async (ctx, args) => {
    const owner = resolveOwner(args.guestKey)
    const existing = await ctx.db
      .query('examples')
      .withIndex('by_guest_example', q => q.eq('guestKey', args.guestKey).eq('exampleId', args.exampleId))
      .unique()

    const gate = lwwGate(existing, args.updatedAtMs)
    if (gate.kind === 'tombstoned') return { status: 'rejected-tombstone' as const, serverSeenAt: gate.serverSeenAt }
    if (gate.kind === 'stale') return { status: 'rejected-stale' as const, serverSeenAt: gate.serverSeenAt, updatedAtMs: gate.updatedAtMs }

    const serverSeenAt = Date.now()
    if (gate.kind === 'patch' && existing) {
      await ctx.db.patch(existing._id, {
        sourceEpisodeId: args.sourceEpisodeId,
        tick: args.tick,
        approved: args.approved,
        rationale: args.rationale,
        preferredActionType: args.preferredActionType,
        doc: args.doc,
        payload: undefined,
        owner,
        updatedAtMs: args.updatedAtMs,
        serverSeenAt,
      })
      return { status: 'ok' as const, serverSeenAt }
    }

    const liveRows = await ctx.db
      .query('examples')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(CAPS.examples + 1)
    if (countLive(liveRows) >= CAPS.examples) throw new ConvexError('cap-exceeded')
    await ctx.db.insert('examples', {
      guestKey: args.guestKey,
      exampleId: args.exampleId,
      sourceEpisodeId: args.sourceEpisodeId,
      tick: args.tick,
      approved: args.approved,
      rationale: args.rationale,
      preferredActionType: args.preferredActionType,
      doc: args.doc,
      owner,
      updatedAtMs: args.updatedAtMs,
      serverSeenAt,
      tombstone: false,
    })
    return { status: 'ok' as const, serverSeenAt }
  },
})

const deleteArgs = { guestKey: v.string(), recordId: v.string(), updatedAtMs: v.number() }

function deleteGate<R extends { tombstone?: boolean; updatedAtMs?: number; serverSeenAt?: number }>(
  existing: R | null,
  updatedAtMs: number,
) {
  if (!existing) return { kind: 'missing' as const }
  const gate = lwwGate(existing, updatedAtMs)
  if (gate.kind === 'tombstoned') return { kind: 'rejected' as const, result: { status: 'rejected-tombstone' as const, serverSeenAt: gate.serverSeenAt } }
  if (gate.kind === 'stale') return { kind: 'rejected' as const, result: { status: 'rejected-stale' as const, serverSeenAt: gate.serverSeenAt, updatedAtMs: gate.updatedAtMs } }
  return { kind: 'patch' as const, row: existing }
}

export const deleteCheckpoint = mutation({
  args: deleteArgs,
  returns: lwwResultV,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('checkpoints')
      .withIndex('by_guest_checkpoint', q => q.eq('guestKey', args.guestKey).eq('checkpointId', args.recordId))
      .unique()
    const gate = deleteGate(existing, args.updatedAtMs)
    if (gate.kind === 'missing') return { status: 'rejected-stale' as const, serverSeenAt: null, updatedAtMs: null }
    if (gate.kind === 'rejected') return gate.result
    const serverSeenAt = Date.now()
    await ctx.db.patch(gate.row._id, {
      tombstone: true,
      updatedAtMs: args.updatedAtMs,
      serverSeenAt,
      owner: resolveOwner(args.guestKey),
    })
    return { status: 'ok' as const, serverSeenAt }
  },
})

export const deleteExample = mutation({
  args: deleteArgs,
  returns: lwwResultV,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('examples')
      .withIndex('by_guest_example', q => q.eq('guestKey', args.guestKey).eq('exampleId', args.recordId))
      .unique()
    const gate = deleteGate(existing, args.updatedAtMs)
    if (gate.kind === 'missing') return { status: 'rejected-stale' as const, serverSeenAt: null, updatedAtMs: null }
    if (gate.kind === 'rejected') return gate.result
    const serverSeenAt = Date.now()
    await ctx.db.patch(gate.row._id, {
      tombstone: true,
      updatedAtMs: args.updatedAtMs,
      serverSeenAt,
      owner: resolveOwner(args.guestKey),
    })
    return { status: 'ok' as const, serverSeenAt }
  },
})

/**
 * One-time internal backfill for rows written before this protocol existed:
 * stamps owner / LWW clocks / tombstone from the legacy ISO display fields and
 * promotes `payload: v.any()` into the typed `doc` column where it validates.
 * The schema column itself does the validation: a non-conforming blob makes
 * the doc-bearing patch throw, so the retry path keeps the blob readable via
 * the legacy column and flags `payloadRejected` (surfaced in the Coach status
 * chip). Idempotent — already-stamped rows are skipped.
 */
function legacyStamp(guestKey: string, stampSource: string | number | undefined) {
  let owner: string
  try {
    owner = resolveOwner(guestKey)
  } catch {
    owner = 'guest:invalid'
  }
  const parsed = typeof stampSource === 'string' ? Date.parse(stampSource) : NaN
  return {
    owner,
    tombstone: false,
    updatedAtMs: Number.isFinite(parsed) ? parsed : Date.now(),
    serverSeenAt: Date.now(),
  }
}

async function backfillCheckpoints(ctx: MutationCtx) {
  let migrated = 0
  let rejected = 0
  let skipped = 0
  const rows = await ctx.db.query('checkpoints').collect()
  for (const row of rows) {
    if (row.doc !== undefined || row.owner !== undefined) {
      skipped += 1
      continue
    }
    const base = legacyStamp(row.guestKey, row.createdAt)
    if (row.payload !== undefined) {
      try {
        await ctx.db.patch(row._id, { ...base, doc: row.payload, payload: undefined })
        migrated += 1
        continue
      } catch {
        await ctx.db.patch(row._id, { ...base, payloadRejected: true })
        rejected += 1
        continue
      }
    }
    await ctx.db.patch(row._id, base)
    migrated += 1
  }
  return { migrated, rejected, skipped }
}

async function backfillExamples(ctx: MutationCtx) {
  let migrated = 0
  let rejected = 0
  let skipped = 0
  const rows = await ctx.db.query('examples').collect()
  for (const row of rows) {
    if (row.doc !== undefined || row.owner !== undefined) {
      skipped += 1
      continue
    }
    const base = legacyStamp(row.guestKey, row.tick)
    if (row.payload !== undefined) {
      try {
        await ctx.db.patch(row._id, { ...base, doc: row.payload, payload: undefined })
        migrated += 1
        continue
      } catch {
        await ctx.db.patch(row._id, { ...base, payloadRejected: true })
        rejected += 1
        continue
      }
    }
    await ctx.db.patch(row._id, base)
    migrated += 1
  }
  return { migrated, rejected, skipped }
}

export const backfillLegacy = internalMutation({
  args: {},
  returns: v.object({
    checkpoints: backfillCountsV,
    examples: backfillCountsV,
    history: backfillCountsV,
  }),
  handler: async ctx => {
    const checkpoints = await backfillCheckpoints(ctx)
    const examples = await backfillExamples(ctx)
    let migrated = 0
    const rejected = 0
    let skipped = 0
    const matchRows = await ctx.db.query('matches').collect()
    for (const row of matchRows) {
      if (row.owner !== undefined) {
        skipped += 1
        continue
      }
      await ctx.db.patch(row._id, legacyStamp(row.guestKey, row.finishedAt))
      migrated += 1
    }
    const jobRows = await ctx.db.query('trainingJobs').collect()
    for (const row of jobRows) {
      if (row.owner !== undefined) {
        skipped += 1
        continue
      }
      await ctx.db.patch(row._id, legacyStamp(row.guestKey, row.updatedAt))
      migrated += 1
    }
    return { checkpoints, examples, history: { migrated, rejected, skipped } }
  },
})
