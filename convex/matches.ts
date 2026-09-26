import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const MAX_MATCHES_PER_GUEST = 50

export const listForGuest = query({
  args: { guestKey: v.string() },
  returns: v.array(
    v.object({
      _id: v.id('matches'),
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
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('matches')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(MAX_MATCHES_PER_GUEST)
    return rows.map(row => ({
      _id: row._id,
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
    }))
  },
})

export const record = mutation({
  args: {
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
  },
  returns: v.id('matches'),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('matches')
      .withIndex('by_guest_match', q =>
        q.eq('guestKey', args.guestKey).eq('matchId', args.matchId),
      )
      .unique()
    const fields = {
      guestKey: args.guestKey,
      matchId: args.matchId,
      scenarioId: args.scenarioId,
      rulesVersion: args.rulesVersion,
      scored: args.scored,
      checkpointId: args.checkpointId,
      championBanked: args.championBanked,
      rivalBanked: args.rivalBanked,
      winner: args.winner,
      finishedAt: args.finishedAt,
      linkedExampleIds: args.linkedExampleIds,
    }
    if (existing) {
      await ctx.db.patch(existing._id, fields)
      return existing._id
    }
    return await ctx.db.insert('matches', fields)
  },
})
