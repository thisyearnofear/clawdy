'use node'

import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import { randomInt } from 'node:crypto'
import { internal } from './_generated/api'
import { action } from './_generated/server'
import { buildLadderContext, ladderSeeds, parseSubmission, runLadder } from '../services/ladderRunner'

/**
 * Verifies a champion on the server: the checkpoint is validated, the pinned terrain is
 * fetched and hash-checked, and fresh hidden variants are played against every house bot.
 * The client never supplies a score. Needs ASSET_BASE_URL (publicly reachable origin that
 * serves /terrain/sandstone-basin.glb; falls back to SITE_URL).
 */
interface OpponentResult { opponent: string; matches: number; wins: number; losses: number; margin: number }
interface SubmitResult { score: number; improved: boolean; best: number; submissions: number; perOpponent: OpponentResult[] }

export const submit = action({
  args: { checkpointJson: v.string() },
  returns: v.object({
    score: v.number(),
    improved: v.boolean(),
    best: v.number(),
    submissions: v.number(),
    perOpponent: v.array(v.object({ opponent: v.string(), matches: v.number(), wins: v.number(), losses: v.number(), margin: v.number() })),
  }),
  handler: async (ctx, args): Promise<SubmitResult> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('sign-in-required')

    let checkpoint
    try {
      checkpoint = parseSubmission(args.checkpointJson)
    } catch (error) {
      throw new ConvexError(error instanceof Error ? error.message : 'invalid checkpoint')
    }

    await ctx.runMutation(internal.ladder.beginAttempt, { userId })

    const origin = process.env.ASSET_BASE_URL ?? process.env.SITE_URL
    if (!origin) throw new ConvexError('ladder-not-configured')
    const response = await fetch(new URL('/terrain/sandstone-basin.glb', origin))
    if (!response.ok) throw new ConvexError(`terrain unavailable (${response.status})`)
    const context = await buildLadderContext(new Uint8Array(await response.arrayBuffer()))

    const result = runLadder(checkpoint, context, ladderSeeds(randomInt(0, 2 ** 31)))
    const recorded: { improved: boolean; best: number; submissions: number } = await ctx.runMutation(internal.ladder.recordResult, {
      userId,
      checkpointId: checkpoint.id,
      weightsHash: checkpoint.weightsHash,
      score: result.score,
      perOpponent: result.perOpponent,
      seeds: result.seeds,
      rulesVersion: result.rulesVersion,
      physicsVersion: result.physicsVersion,
      colliderSha256: result.colliderSha256,
    })
    return { score: result.score, perOpponent: result.perOpponent, ...recorded }
  },
})
