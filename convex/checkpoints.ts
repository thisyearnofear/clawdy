import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const MAX_CHECKPOINTS_PER_GUEST = 40

export const listForGuest = query({
  args: { guestKey: v.string() },
  returns: v.array(
    v.object({
      _id: v.id('checkpoints'),
      checkpointId: v.string(),
      name: v.string(),
      schemaVersion: v.string(),
      parentCheckpointId: v.union(v.string(), v.null()),
      weightsHash: v.string(),
      createdAt: v.string(),
      approvedExampleIds: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('checkpoints')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(MAX_CHECKPOINTS_PER_GUEST)
    return rows.map(row => ({
      _id: row._id,
      checkpointId: row.checkpointId,
      name: row.name,
      schemaVersion: row.schemaVersion,
      parentCheckpointId: row.parentCheckpointId,
      weightsHash: row.weightsHash,
      createdAt: row.createdAt,
      approvedExampleIds: row.approvedExampleIds,
    }))
  },
})

export const getPayload = query({
  args: {
    guestKey: v.string(),
    checkpointId: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('checkpoints')
      .withIndex('by_guest_checkpoint', q =>
        q.eq('guestKey', args.guestKey).eq('checkpointId', args.checkpointId),
      )
      .unique()
    return row?.payload ?? null
  },
})

export const upsert = mutation({
  args: {
    guestKey: v.string(),
    checkpointId: v.string(),
    name: v.string(),
    schemaVersion: v.string(),
    parentCheckpointId: v.union(v.string(), v.null()),
    weightsHash: v.string(),
    createdAt: v.string(),
    approvedExampleIds: v.array(v.string()),
    payload: v.any(),
  },
  returns: v.id('checkpoints'),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('checkpoints')
      .withIndex('by_guest_checkpoint', q =>
        q.eq('guestKey', args.guestKey).eq('checkpointId', args.checkpointId),
      )
      .unique()
    const fields = {
      guestKey: args.guestKey,
      checkpointId: args.checkpointId,
      name: args.name,
      schemaVersion: args.schemaVersion,
      parentCheckpointId: args.parentCheckpointId,
      weightsHash: args.weightsHash,
      createdAt: args.createdAt,
      approvedExampleIds: args.approvedExampleIds,
      payload: args.payload,
    }
    if (existing) {
      await ctx.db.patch(existing._id, fields)
      return existing._id
    }
    return await ctx.db.insert('checkpoints', fields)
  },
})
