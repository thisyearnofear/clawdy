import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import { internalMutation, query } from './_generated/server'
import { buildV } from './schema'
import { CURRENT_SEASON } from './league'

/** One verification run per account per window; a run costs real server CPU. */
export const ATTEMPT_WINDOW_MS = 60_000
const MAX_TOP = 50

const perOpponentV = v.array(v.object({
  opponent: v.string(),
  matches: v.number(),
  wins: v.number(),
  losses: v.number(),
  margin: v.number(),
}))

const entryV = v.object({
  displayName: v.string(),
  checkpointId: v.string(),
  weightsHash: v.string(),
  score: v.number(),
  perOpponent: perOpponentV,
  rulesVersion: v.string(),
  verifiedAt: v.number(),
  submissions: v.number(),
  mode: v.optional(v.string()),
  chassis: v.optional(v.string()),
})

function publicEntry(row: { displayName: string; checkpointId: string; weightsHash: string; score: number; perOpponent: { opponent: string; matches: number; wins: number; losses: number; margin: number }[]; rulesVersion: string; verifiedAt: number; submissions: number; mode?: string; chassis?: string }) {
  return {
    displayName: row.displayName,
    checkpointId: row.checkpointId,
    weightsHash: row.weightsHash,
    score: row.score,
    perOpponent: row.perOpponent,
    rulesVersion: row.rulesVersion,
    verifiedAt: row.verifiedAt,
    submissions: row.submissions,
    mode: row.mode,
    chassis: row.chassis,
  }
}

export const top = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(entryV),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(MAX_TOP, Math.floor(args.limit ?? 20)))
    const rows = await ctx.db.query('ladder').withIndex('by_score').order('desc').take(limit)
    return rows.map(publicEntry)
  },
})

export const mine = query({
  args: {},
  returns: v.union(v.null(), entryV),
  handler: async ctx => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const row = await ctx.db.query('ladder').withIndex('by_user', q => q.eq('userId', userId)).unique()
    return row ? publicEntry(row) : null
  },
})

export const beginAttempt = internalMutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now()
    const recent = await ctx.db
      .query('ladderAttempts')
      .withIndex('by_user_at', q => q.eq('userId', args.userId).gt('at', now - ATTEMPT_WINDOW_MS))
      .first()
    if (recent) throw new ConvexError('rate-limited')
    await ctx.db.insert('ladderAttempts', { userId: args.userId, at: now })
    return null
  },
})

/** Keeps an account's best verified score; every verified run still counts as a submission. */
export const recordResult = internalMutation({
  args: {
    userId: v.id('users'),
    checkpointId: v.string(),
    weightsHash: v.string(),
    score: v.number(),
    perOpponent: perOpponentV,
    seeds: v.array(v.number()),
    rulesVersion: v.string(),
    physicsVersion: v.string(),
    colliderSha256: v.string(),
    build: v.optional(buildV),
    chassis: v.optional(v.string()),
    mode: v.optional(v.string()),
  },
  returns: v.object({ improved: v.boolean(), best: v.number(), submissions: v.number() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    const displayName = (user?.name ?? 'Anonymous').slice(0, 40)
    const existing = await ctx.db.query('ladder').withIndex('by_user', q => q.eq('userId', args.userId)).unique()
    const { userId, ...result } = args
    const verifiedAt = Date.now()
    // Season is stamped server-side (league.ts CURRENT_SEASON): a re-verified
    // entry always joins the season it was scored in, not the client's claim.
    const season = CURRENT_SEASON
    if (!existing) {
      await ctx.db.insert('ladder', { userId, displayName, ...result, verifiedAt, submissions: 1, season })
      return { improved: true, best: args.score, submissions: 1 }
    }
    const submissions = existing.submissions + 1
    if (args.score > existing.score) {
      await ctx.db.patch(existing._id, { displayName, ...result, verifiedAt, submissions, season })
      return { improved: true, best: args.score, submissions }
    }
    await ctx.db.patch(existing._id, { displayName, submissions })
    return { improved: false, best: existing.score, submissions }
  },
})
