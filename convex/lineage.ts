import { v } from 'convex/values'
import { query } from './_generated/server'

/**
 * Demo-facing lineage: latest training job + resulting checkpoint + a match
 * that used it (when present). Powers the Coach "linked in Convex" strip.
 */
export const latestChain = query({
  args: { guestKey: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      jobId: v.string(),
      jobStatus: v.string(),
      exampleCount: v.number(),
      parentCheckpointId: v.string(),
      resultCheckpointId: v.union(v.string(), v.null()),
      checkpointName: v.union(v.string(), v.null()),
      matchId: v.union(v.string(), v.null()),
      matchScenarioId: v.union(v.string(), v.null()),
      matchWinner: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query('trainingJobs')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(20)
    if (jobs.length === 0) return null
    jobs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    const job = jobs[0]

    let checkpointName: string | null = null
    if (job.resultCheckpointId) {
      const checkpoint = await ctx.db
        .query('checkpoints')
        .withIndex('by_guest_checkpoint', q =>
          q.eq('guestKey', args.guestKey).eq('checkpointId', job.resultCheckpointId!),
        )
        .unique()
      checkpointName = checkpoint?.name ?? null
    }

    const matches = await ctx.db
      .query('matches')
      .withIndex('by_guest', q => q.eq('guestKey', args.guestKey))
      .take(30)
    matches.sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1))
    const linkedMatch = matches.find(
      match => job.resultCheckpointId !== null && match.checkpointId === job.resultCheckpointId,
    ) ?? null

    return {
      jobId: job.jobId,
      jobStatus: job.status,
      exampleCount: job.exampleCount,
      parentCheckpointId: job.parentCheckpointId,
      resultCheckpointId: job.resultCheckpointId,
      checkpointName,
      matchId: linkedMatch?.matchId ?? null,
      matchScenarioId: linkedMatch?.scenarioId ?? null,
      matchWinner: linkedMatch?.winner ?? null,
    }
  },
})
