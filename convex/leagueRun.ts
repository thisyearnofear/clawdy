'use node'

import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import { randomInt, randomBytes } from 'node:crypto'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, internalAction } from './_generated/server'
import { buildV } from './schema'
import { buildLadderContext, legalLeagueBuild, parseSubmission, runMatch, traitsForBuild } from '../services/ladderRunner'
import { budgetSpent, STAT_BUDGET, validateBuild, type Build } from '../services/chassis'
import { summarizeReplayMarkers } from '../services/replayMarkers'
import { normalizeRuleset } from './lib/ruleset'

/**
 * League write path (docs/LEAGUE_PLAN.md, Stream C). Everything here runs in
 * the Node runtime because checkpoint validation, terrain hashing and match
 * replay need the same services code as the ladder (`services/ladderRunner.ts`).
 * Public functions only authenticate and shape args; database writes happen in
 * the internal mutations of convex/league.ts, inside one transaction per match.
 *
 * Rate limiting shares `ladderAttempts` with `ladderRun.submit`: one verified
 * server run per account per minute across submits and challenges.
 */

function shareSlug(): string {
  // Capability URL slug: 128 bits, URL-safe. Possession = permission to view.
  return randomBytes(16).toString('base64url')
}

async function terrainOrigin(): Promise<string> {
  const origin = process.env.ASSET_BASE_URL ?? process.env.SITE_URL
  if (!origin) throw new ConvexError('ladder-not-configured')
  return origin
}

async function leagueContext() {
  const origin = await terrainOrigin()
  const response = await fetch(new URL('/terrain/sandstone-basin.glb', origin))
  if (!response.ok) throw new ConvexError(`terrain unavailable (${response.status})`)
  return buildLadderContext(new Uint8Array(await response.arrayBuffer()))
}

/** Publish a brain to the league: validated checkpoint + optional build. */
export const publish = action({
  args: {
    brainId: v.string(),
    name: v.string(),
    checkpointJson: v.string(),
    build: v.optional(buildV),
    mode: v.optional(v.string()),
    rulesetId: v.optional(v.string()),
  },
  returns: v.object({ brainId: v.string(), replaced: v.boolean() }),
  handler: async (ctx, args): Promise<{ brainId: string; replaced: boolean }> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('sign-in-required')

    const rulesetId = normalizeRuleset(args.rulesetId)
    // Skirmish perks come from the chassis, so a build is part of the entry.
    if (rulesetId && !args.build) throw new ConvexError('build-required')

    let checkpoint
    try {
      checkpoint = parseSubmission(args.checkpointJson)
    } catch (error) {
      throw new ConvexError(error instanceof Error ? error.message : 'invalid checkpoint')
    }
    if (args.build && legalLeagueBuild(args.build) === undefined) {
      const typed = args.build as Build
      const errors = validateBuild(typed)
      throw new ConvexError(errors.length > 0 ? `invalid build: ${errors.join('; ')}` : `build costs ${budgetSpent(typed)} but the budget is ${STAT_BUDGET}`)
    }

    // Publishing costs no match CPU, so it does not draw on the attempt budget.
    return await ctx.runMutation(internal.league.upsertBrain, {
      userId,
      brainId: args.brainId,
      name: args.name,
      checkpointId: checkpoint.id,
      weightsHash: checkpoint.weightsHash,
      checkpointJson: args.checkpointJson,
      build: args.build,
      chassis: args.build?.chassis,
      mode: args.mode ?? 'rush',
      rulesetId,
    })
  },
})

/**
 * Challenge another player's listed brain. The server runs the match itself —
 * fresh hidden seed, both sides, recordings replay-verified before they are
 * stored. Neither client reports a score.
 */
export const challenge = action({
  args: { brainId: v.string(), defenderBrain: v.id('brains') },
  returns: v.object({
    shareId: v.string(),
    winnerSide: v.union(v.literal('challenger'), v.literal('defender'), v.null()),
    banked: v.array(v.number()),
  }),
  handler: async (ctx, args): Promise<{ shareId: string; winnerSide: 'challenger' | 'defender' | null; banked: number[] }> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('sign-in-required')

    // Authz before the attempt budget: a call that could never run must not
    // spend the caller's one verified run this minute.
    const { challenger, defender } = await ctx.runQuery(internal.league.loadChallenge, {
      userId,
      brainId: args.brainId,
      defenderBrain: args.defenderBrain,
    })

    await ctx.runMutation(internal.ladder.beginAttempt, { userId })

    const rulesetId = normalizeRuleset(challenger.rulesetId)
    const seed = randomInt(0, 2 ** 31)
    try {
      const context = await leagueContext()
      const result = runMatch(
        { checkpoint: parseSubmission(challenger.checkpointJson), traits: traitsForBuild(challenger.build, rulesetId) },
        { checkpoint: parseSubmission(defender.checkpointJson), traits: traitsForBuild(defender.build, rulesetId) },
        context.rushBase,
        seed,
        rulesetId,
      )

      const storageIds = []
      for (const recording of result.recordings) {
        storageIds.push(await ctx.storage.store(new Blob([JSON.stringify(recording)], { type: 'application/json' })))
      }
      const markers = result.recordings.flatMap((recording, side) =>
        summarizeReplayMarkers(recording).map(marker => ({ ...marker, side })),
      )

      const recorded = await ctx.runMutation(internal.league.recordChallenge, {
        challengerUserId: userId,
        challengerBrainId: challenger.brainId,
        defenderUserId: defender.userId,
        defenderBrainId: defender.brainId,
        mode: challenger.mode,
        seed,
        winnerSide: result.winner === 'a' ? 'challenger' : result.winner === 'b' ? 'defender' : null,
        banked: [result.banked.a, result.banked.b],
        shareId: shareSlug(),
        storageIds,
        championIndex: [0, 1],
        markers,
        rulesVersion: result.rulesVersion,
      })
      return { shareId: recorded.shareId, winnerSide: result.winner === 'a' ? 'challenger' : result.winner === 'b' ? 'defender' : null, banked: [result.banked.a, result.banked.b] }
    } catch (error) {
      await ctx.runMutation(internal.league.failChallenge, {
        challengerUserId: userId,
        challengerBrainId: challenger.brainId,
        defenderUserId: defender.userId,
        defenderBrainId: defender.brainId,
        mode: challenger.mode,
        seed,
        message: error instanceof Error ? error.message : 'match failed',
        rulesetId,
      })
      throw error
    }
  },
})

/**
 * One scheduled tournament round: listed brains in a mode are sorted by
 * rating and paired adjacently (1v2, 3v4, …), each pair plays a fresh
 * hidden-seed match, and ratings move Elo-style. Invoked by convex/crons.ts;
 * also runnable by hand for demos: `npx convex run --prod leagueRun:runRound`.
 */
export const runRound = internalAction({
  args: { mode: v.optional(v.string()), seed: v.optional(v.number()), rulesetId: v.optional(v.string()) },
  returns: v.object({ round: v.union(v.number(), v.null()), pairings: v.number() }),
  handler: async (ctx, args): Promise<{ round: number | null; pairings: number }> => {
    const mode = args.mode ?? 'rush'
    const rulesetId = normalizeRuleset(args.rulesetId)
    const brains: { userId: Id<'users'>; brainId: string; name: string; checkpointJson: string; chassis?: string; build?: { chassis: string; points: Record<string, number>; modules: string[] }; rating: number }[] =
      await ctx.runQuery(internal.league.listedForRound, { mode, rulesetId })
    if (brains.length < 2) return { round: null, pairings: 0 }

    const context = await leagueContext()
    const baseSeed = args.seed ?? randomInt(0, 2 ** 31)
    const matches: {
      aUserId: Id<'users'>; aBrainId: string; aName: string
      bUserId: Id<'users'>; bBrainId: string; bName: string
      winnerIndex: number | null; banked: number[]
      shareId: string; storageIds: Id<'_storage'>[]; championIndex: number[]
      markers: { type: string; tick: number; agentId?: string; note?: string; side?: number }[]
      rulesVersion: string
    }[] = []
    for (let pair = 0; pair + 1 < brains.length; pair += 2) {
      const a = brains[pair]
      const b = brains[pair + 1]
      const seed = (baseSeed + pair) >>> 0
      const result = runMatch(
        { checkpoint: parseSubmission(a.checkpointJson), traits: traitsForBuild(a.build, rulesetId) },
        { checkpoint: parseSubmission(b.checkpointJson), traits: traitsForBuild(b.build, rulesetId) },
        context.rushBase,
        seed,
        rulesetId,
      )
      const storageIds = []
      for (const recording of result.recordings) {
        storageIds.push(await ctx.storage.store(new Blob([JSON.stringify(recording)], { type: 'application/json' })))
      }
      const markers = result.recordings.flatMap((recording, side) =>
        summarizeReplayMarkers(recording).map(marker => ({ ...marker, side })),
      )
      const [aUser, bUser] = await Promise.all([ctx.runQuery(internal.league.displayName, { userId: a.userId }), ctx.runQuery(internal.league.displayName, { userId: b.userId })])
      matches.push({
        aUserId: a.userId,
        aBrainId: a.brainId,
        aName: `${aUser} · ${a.name}`,
        bUserId: b.userId,
        bBrainId: b.brainId,
        bName: `${bUser} · ${b.name}`,
        winnerIndex: result.winner === 'a' ? 0 : result.winner === 'b' ? 1 : null,
        banked: [result.banked.a, result.banked.b],
        shareId: shareSlug(),
        storageIds,
        championIndex: [0, 1],
        markers,
        rulesVersion: result.rulesVersion,
      })
    }
    return await ctx.runMutation(internal.league.recordRound, { mode, rulesetId, seed: baseSeed, matches })
  },
})
