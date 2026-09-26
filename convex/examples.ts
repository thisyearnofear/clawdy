import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const MAX_EXAMPLES_PER_GUEST = 200

export const listForGuest = query({
  args: { guestKey: v.string() },
  returns: v.array(
    v.object({
      _id: v.id('examples'),
      exampleId: v.string(),
      sourceEpisodeId: v.string(),
      tick: v.number(),
      approved: v.boolean(),
      rationale: v.string(),
      preferredActionType: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('examples')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(MAX_EXAMPLES_PER_GUEST)
    return rows.map(row => ({
      _id: row._id,
      exampleId: row.exampleId,
      sourceEpisodeId: row.sourceEpisodeId,
      tick: row.tick,
      approved: row.approved,
      rationale: row.rationale,
      preferredActionType: row.preferredActionType,
    }))
  },
})

export const upsert = mutation({
  args: {
    guestKey: v.string(),
    exampleId: v.string(),
    sourceEpisodeId: v.string(),
    tick: v.number(),
    approved: v.boolean(),
    rationale: v.string(),
    preferredActionType: v.string(),
    payload: v.any(),
  },
  returns: v.id('examples'),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('examples')
      .withIndex('by_guest_example', q =>
        q.eq('guestKey', args.guestKey).eq('exampleId', args.exampleId),
      )
      .unique()
    const fields = {
      guestKey: args.guestKey,
      exampleId: args.exampleId,
      sourceEpisodeId: args.sourceEpisodeId,
      tick: args.tick,
      approved: args.approved,
      rationale: args.rationale,
      preferredActionType: args.preferredActionType,
      payload: args.payload,
    }
    if (existing) {
      await ctx.db.patch(existing._id, fields)
      return existing._id
    }
    return await ctx.db.insert('examples', fields)
  },
})
