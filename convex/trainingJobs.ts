import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { resolveOwner } from './lib/identity'

const MAX_JOBS_PER_GUEST = 40

export const listForGuest = query({
  args: { guestKey: v.string() },
  returns: v.array(
    v.object({
      _id: v.id('trainingJobs'),
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
      serverSeenAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('trainingJobs')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(MAX_JOBS_PER_GUEST + 20)
    return rows
      .filter(row => row.tombstone !== true)
      .slice(0, MAX_JOBS_PER_GUEST)
      .map(row => ({
        _id: row._id,
        jobId: row.jobId,
        status: row.status,
        parentCheckpointId: row.parentCheckpointId,
        resultCheckpointId: row.resultCheckpointId,
        exampleCount: row.exampleCount,
        message: row.message,
        updatedAt: row.updatedAt,
        serverSeenAt: row.serverSeenAt,
      }))
  },
})

export const upsert = mutation({
  args: {
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
  },
  returns: v.id('trainingJobs'),
  handler: async (ctx, args) => {
    const owner = resolveOwner(args.guestKey)
    const existing = await ctx.db
      .query('trainingJobs')
      .withIndex('by_guest_job', q =>
        q.eq('guestKey', args.guestKey).eq('jobId', args.jobId),
      )
      .unique()
    const serverSeenAt = Date.now()
    const fields = {
      guestKey: args.guestKey,
      jobId: args.jobId,
      status: args.status,
      parentCheckpointId: args.parentCheckpointId,
      resultCheckpointId: args.resultCheckpointId,
      exampleCount: args.exampleCount,
      message: args.message,
      updatedAt: args.updatedAt,
      owner,
      serverSeenAt,
    }
    if (existing) {
      await ctx.db.patch(existing._id, fields)
      return existing._id
    }
    const live = await ctx.db
      .query('trainingJobs')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(MAX_JOBS_PER_GUEST + 1)
    if (live.filter(row => row.tombstone !== true).length >= MAX_JOBS_PER_GUEST) {
      throw new ConvexError('cap-exceeded')
    }
    return await ctx.db.insert('trainingJobs', { ...fields, tombstone: false })
  },
})
