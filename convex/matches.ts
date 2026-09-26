import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { resolveOwner } from './lib/identity'

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
      serverSeenAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('matches')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(MAX_MATCHES_PER_GUEST + 20)
    return rows
      .filter(row => row.tombstone !== true)
      .slice(0, MAX_MATCHES_PER_GUEST)
      .map(row => ({
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
        serverSeenAt: row.serverSeenAt,
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
    const owner = resolveOwner(args.guestKey)
    const existing = await ctx.db
      .query('matches')
      .withIndex('by_guest_match', q =>
        q.eq('guestKey', args.guestKey).eq('matchId', args.matchId),
      )
      .unique()
    const serverSeenAt = Date.now()
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
      owner,
      serverSeenAt,
    }
    if (existing) {
      await ctx.db.patch(existing._id, fields)
      return existing._id
    }
    const live = await ctx.db
      .query('matches')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(MAX_MATCHES_PER_GUEST + 1)
    if (live.filter(row => row.tombstone !== true).length >= MAX_MATCHES_PER_GUEST) {
      throw new ConvexError('cap-exceeded')
    }
    return await ctx.db.insert('matches', { ...fields, tombstone: false })
  },
})
