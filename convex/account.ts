import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { GUEST_KEY_PATTERN, USER_KEY_PREFIX, resolveOwner, userKey } from './lib/identity'

/** Rows moved per call, per table. The client repeats while `remaining` is non-zero. */
const CLAIM_BATCH = 100

export const me = query({
  args: {},
  returns: v.union(v.null(), v.object({ userId: v.string(), name: v.union(v.string(), v.null()), image: v.union(v.string(), v.null()) })),
  handler: async ctx => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const user = await ctx.db.get(userId)
    return { userId, name: user?.name ?? null, image: user?.image ?? null }
  },
})

/**
 * Moves a browser's guest history onto the signed-in account. Possession of the
 * guest key is the proof (the same trust the guest rows always had). A record the
 * account already has under the same id wins; the guest copy is left untouched.
 */
export const claimGuest = mutation({
  args: { guestKey: v.string() },
  returns: v.object({ moved: v.number(), skipped: v.number(), remaining: v.number() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('sign in to claim guest history')
    if (!GUEST_KEY_PATTERN.test(args.guestKey) || args.guestKey.startsWith(USER_KEY_PREFIX)) throw new Error('invalid guest key')
    const key = userKey(userId)
    const owner = resolveOwner(key)
    const now = Date.now()
    let moved = 0
    let skipped = 0
    let remaining = 0

    const patch = { guestKey: key, owner, serverSeenAt: now }

    const checkpoints = await ctx.db.query('checkpoints').withIndex('by_guest', q => q.eq('guestKey', args.guestKey)).take(CLAIM_BATCH + 1)
    for (const row of checkpoints.slice(0, CLAIM_BATCH)) {
      const existing = await ctx.db.query('checkpoints').withIndex('by_guest_checkpoint', q => q.eq('guestKey', key).eq('checkpointId', row.checkpointId)).unique()
      if (existing) { skipped++; await ctx.db.delete(row._id); continue }
      await ctx.db.patch(row._id, patch)
      moved++
    }
    remaining += Math.max(0, checkpoints.length - CLAIM_BATCH)

    const examples = await ctx.db.query('examples').withIndex('by_guest', q => q.eq('guestKey', args.guestKey)).take(CLAIM_BATCH + 1)
    for (const row of examples.slice(0, CLAIM_BATCH)) {
      const existing = await ctx.db.query('examples').withIndex('by_guest_example', q => q.eq('guestKey', key).eq('exampleId', row.exampleId)).unique()
      if (existing) { skipped++; await ctx.db.delete(row._id); continue }
      await ctx.db.patch(row._id, patch)
      moved++
    }
    remaining += Math.max(0, examples.length - CLAIM_BATCH)

    const matches = await ctx.db.query('matches').withIndex('by_guest', q => q.eq('guestKey', args.guestKey)).take(CLAIM_BATCH + 1)
    for (const row of matches.slice(0, CLAIM_BATCH)) {
      const existing = await ctx.db.query('matches').withIndex('by_guest_match', q => q.eq('guestKey', key).eq('matchId', row.matchId)).unique()
      if (existing) { skipped++; await ctx.db.delete(row._id); continue }
      await ctx.db.patch(row._id, patch)
      moved++
    }
    remaining += Math.max(0, matches.length - CLAIM_BATCH)

    const jobs = await ctx.db.query('trainingJobs').withIndex('by_guest', q => q.eq('guestKey', args.guestKey)).take(CLAIM_BATCH + 1)
    for (const row of jobs.slice(0, CLAIM_BATCH)) {
      const existing = await ctx.db.query('trainingJobs').withIndex('by_guest_job', q => q.eq('guestKey', key).eq('jobId', row.jobId)).unique()
      if (existing) { skipped++; await ctx.db.delete(row._id); continue }
      await ctx.db.patch(row._id, patch)
      moved++
    }
    remaining += Math.max(0, jobs.length - CLAIM_BATCH)

    return { moved, skipped, remaining }
  },
})
