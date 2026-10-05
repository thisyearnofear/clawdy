import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import type { Auth } from 'convex/server'
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { buildV } from './schema'
import { normalizeRuleset, roundRef, rulesetOf } from './lib/ruleset'

/**
 * League brains, challenges, replays and tournament rounds (docs/LEAGUE_PLAN.md,
 * Stream C). Trust model mirrors the ladder: rows are keyed by the verified
 * `userId`, never a client-supplied identity, and everything that costs real
 * server CPU (publish validation, challenge matches, tournament rounds) lives
 * in `convex/leagueRun.ts` ('use node') which calls the internal mutations here.
 *
 * Replays: the recording JSON goes to Convex file storage (~1 MB per match,
 * too large for a document column); the `replays` row is metadata + storage
 * ids + a `shareId` capability slug — whoever holds the slug may view it.
 */

export const MAX_BRAINS_PER_USER = 8
export const MAX_ROUNDS_PER_ROUND = 8
export const RATING_START = 0
/**
 * Active league season. Rows written before seasons existed carry no `season`
 * and count as season 0 (the genesis season) — see `seasonOf`. Rolling a new
 * season means bumping this constant; boards/pools/pairings follow it.
 */
export const CURRENT_SEASON = 0
const GENESIS_SEASON = 0
const ELO_K = 16

function seasonOf(row: { season?: number }): number {
  return row.season ?? GENESIS_SEASON
}

const BRAIN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/
const LEAGUE_MODES = ['rush'] as const

const markersV = v.array(v.object({
  type: v.string(),
  tick: v.number(),
  agentId: v.optional(v.string()),
  note: v.optional(v.string()),
  /** Which stored recording the marker came from (one per side). */
  side: v.optional(v.number()),
}))

const brainPublicV = v.object({
  _id: v.id('brains'),
  brainId: v.string(),
  name: v.string(),
  checkpointId: v.string(),
  weightsHash: v.string(),
  chassis: v.optional(v.string()),
  mode: v.string(),
  rating: v.number(),
  matchesPlayed: v.number(),
  listed: v.boolean(),
  season: v.number(),
  rulesetId: v.optional(v.string()),
  createdAt: v.number(),
})

function publicBrain(row: Doc<'brains'>) {
  return {
    _id: row._id,
    brainId: row.brainId,
    name: row.name,
    checkpointId: row.checkpointId,
    weightsHash: row.weightsHash,
    chassis: row.chassis,
    mode: row.mode,
    rating: row.rating,
    matchesPlayed: row.matchesPlayed,
    listed: row.listed,
    season: seasonOf(row),
    rulesetId: rulesetOf(row),
    createdAt: row.createdAt,
  }
}

async function requireUserId(ctx: { auth: Auth }) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new ConvexError('sign-in-required')
  return userId
}

/**
 * One join row per distinct account in a replay. Replays are append-only, so
 * this is written in the same transaction as the replay row and never updated.
 */
async function addReplayParticipants(ctx: MutationCtx, replayId: Id<'replays'>, userIds: Id<'users'>[]) {
  const createdAt = Date.now()
  for (const userId of new Set(userIds)) {
    await ctx.db.insert('replayParticipants', { replayId, userId, createdAt })
  }
}

async function myBrain(ctx: QueryCtx, userId: Id<'users'>, brainId: string) {
  const brain = await ctx.db
    .query('brains')
    .withIndex('by_user_brain', q => q.eq('userId', userId).eq('brainId', brainId))
    .unique()
  if (!brain) throw new ConvexError('unknown-brain')
  return brain
}

// ---------------------------------------------------------------- queries

/** The caller's own brains. */
export const mine = query({
  args: {},
  returns: v.array(brainPublicV),
  handler: async ctx => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const rows = await ctx.db.query('brains').withIndex('by_user', q => q.eq('userId', userId)).collect()
    return rows.map(publicBrain)
  },
})

/**
 * The challenge pool: other accounts' listed brains in a mode. Signed-in only —
 * this is how you pick a defender, not a public directory.
 */
export const pool = query({
  args: { mode: v.optional(v.string()), rulesetId: v.optional(v.string()) },
  returns: v.array(v.object({ ...brainPublicV.fields, owner: v.string() })),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const mode = args.mode ?? 'rush'
    const rulesetId = normalizeRuleset(args.rulesetId)
    const rows = await ctx.db
      .query('brains')
      .withIndex('by_ruleset_mode_listed', q => q.eq('rulesetId', rulesetId).eq('mode', mode).eq('listed', true))
      .take(200)
    const out = []
    for (const row of rows) {
      if (row.userId === userId || seasonOf(row) !== CURRENT_SEASON) continue
      const owner = await ctx.db.get(row.userId)
      out.push({ ...publicBrain(row), owner: (owner?.name ?? 'Anonymous').slice(0, 40) })
    }
    return out
  },
})

/** The caller's recent challenges, either side, with share links joined in. */
export const challenges = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id('challenges'),
    mode: v.string(),
    seed: v.number(),
    winnerSide: v.union(v.literal('challenger'), v.literal('defender'), v.null()),
    banked: v.array(v.number()),
    status: v.union(v.literal('done'), v.literal('failed')),
    challengerName: v.string(),
    defenderName: v.string(),
    challengerBrainId: v.string(),
    defenderBrainId: v.string(),
    side: v.union(v.literal('challenger'), v.literal('defender')),
    shareId: v.union(v.string(), v.null()),
    season: v.number(),
    rulesetId: v.optional(v.string()),
    createdAt: v.number(),
  })),
  handler: async ctx => {
    const userId = await requireUserId(ctx)
    const [asChallenger, asDefender] = await Promise.all([
      ctx.db.query('challenges').withIndex('by_challenger', q => q.eq('challengerUserId', userId)).order('desc').take(20),
      ctx.db.query('challenges').withIndex('by_defender', q => q.eq('defenderUserId', userId)).order('desc').take(20),
    ])
    const rows = [
      ...asChallenger.map(row => ({ row, side: 'challenger' as const })),
      ...asDefender.map(row => ({ row, side: 'defender' as const })),
    ]
      .sort((a, b) => b.row.createdAt - a.row.createdAt)
      .slice(0, 20)
    return await Promise.all(rows.map(async ({ row, side }) => ({
      _id: row._id,
      mode: row.mode,
      seed: row.seed,
      winnerSide: row.winnerSide,
      banked: row.banked,
      status: row.status,
      challengerName: row.challengerName,
      defenderName: row.defenderName,
      challengerBrainId: row.challengerBrainId,
      defenderBrainId: row.defenderBrainId,
      side,
      shareId: row.replayId ? ((await ctx.db.get(row.replayId))?.shareId ?? null) : null,
      season: seasonOf(row),
      rulesetId: rulesetOf(row),
      createdAt: row.createdAt,
    })))
  },
})

/**
 * View a replay by share slug. Public on purpose: the slug is the capability.
 * Returns storage URLs plus the denormalized match metadata — user ids are
 * deliberately not in the response.
 */
export const viewReplay = query({
  args: { shareId: v.string() },
  returns: v.union(v.null(), v.object({
    shareId: v.string(),
    kind: v.union(v.literal('challenge'), v.literal('tournament')),
    participants: v.array(v.object({ name: v.string(), brainId: v.string() })),
    championIndex: v.array(v.number()),
    banked: v.array(v.number()),
    winnerIndex: v.union(v.number(), v.null()),
    markers: markersV,
    urls: v.array(v.string()),
    mode: v.string(),
    seed: v.number(),
    rulesVersion: v.string(),
    season: v.number(),
    rulesetId: v.optional(v.string()),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('replays').withIndex('by_share', q => q.eq('shareId', args.shareId)).unique()
    if (!row) return null
    const urls = await Promise.all(row.storageIds.map(id => ctx.storage.getUrl(id)))
    return {
      shareId: row.shareId,
      kind: row.kind,
      participants: row.participants.map(({ name, brainId }) => ({ name, brainId })),
      championIndex: row.championIndex,
      banked: row.banked,
      winnerIndex: row.winnerIndex,
      markers: row.markers,
      urls: urls.filter((url): url is string => url !== null),
      mode: row.mode,
      seed: row.seed,
      rulesVersion: row.rulesVersion,
      season: seasonOf(row),
      rulesetId: rulesetOf(row),
      createdAt: row.createdAt,
    }
  },
})

/**
 * Per-chassis best on the verified ladder: the "per-build leaderboard".
 * `season` defaults to the current one; passing a past season is the hall of
 * fame — entries verified before seasons existed count as season 0.
 */
export const topByChassis = query({
  args: { season: v.optional(v.number()), rulesetId: v.optional(v.string()) },
  returns: v.array(v.object({
    chassis: v.string(),
    displayName: v.string(),
    score: v.number(),
    checkpointId: v.string(),
    verifiedAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const season = args.season ?? CURRENT_SEASON
    const rulesetId = normalizeRuleset(args.rulesetId)
    const rows = await ctx.db.query('ladder').withIndex('by_ruleset_score', q => q.eq('rulesetId', rulesetId)).order('desc').take(50)
    const best = new Map<string, { chassis: string; displayName: string; score: number; checkpointId: string; verifiedAt: number }>()
    for (const row of rows) {
      if (seasonOf(row) !== season) continue
      const chassis = row.chassis ?? 'hauler'
      if (!best.has(chassis)) {
        best.set(chassis, { chassis, displayName: row.displayName, score: row.score, checkpointId: row.checkpointId, verifiedAt: row.verifiedAt })
      }
    }
    return [...best.values()]
  },
})

/**
 * Per-axis report card: mean and max points per stat axis across the league's
 * published brains that carry a build — what the field actually races — plus
 * the caller's most-played brain for comparison.
 */
export const reportCard = query({
  args: { mode: v.optional(v.string()), season: v.optional(v.number()), rulesetId: v.optional(v.string()) },
  returns: v.object({
    entriesWithBuilds: v.number(),
    axes: v.array(v.object({ axis: v.string(), mean: v.number(), max: v.number() })),
    mine: v.union(v.null(), v.object({ chassis: v.string(), points: v.record(v.string(), v.number()) })),
  }),
  handler: async (ctx, args) => {
    const season = args.season ?? CURRENT_SEASON
    const rulesetId = normalizeRuleset(args.rulesetId)
    const rows = await ctx.db
      .query('brains')
      .withIndex('by_ruleset_mode_listed', q => q.eq('rulesetId', rulesetId).eq('mode', args.mode ?? 'rush'))
      .collect()
    const axes = ['navigation', 'speed', 'hardiness', 'defence', 'attack']
    const totals = new Map<string, { sum: number; max: number }>(axes.map(axis => [axis, { sum: 0, max: 0 }]))
    let entriesWithBuilds = 0
    for (const row of rows) {
      if (!row.build || seasonOf(row) !== season) continue
      entriesWithBuilds++
      for (const axis of axes) {
        const stat = totals.get(axis)!
        const value = (row.build.points as Record<string, number>)[axis] ?? 0
        stat.sum += value
        stat.max = Math.max(stat.max, value)
      }
    }
    const userId = await getAuthUserId(ctx)
    const mineRows = userId
      ? await ctx.db.query('brains').withIndex('by_user', q => q.eq('userId', userId)).collect()
      : []
    const mineRow = mineRows
      .filter(row => row.build && seasonOf(row) === season && rulesetOf(row) === rulesetId)
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed || b.createdAt - a.createdAt)[0]
    return {
      entriesWithBuilds,
      axes: axes.map(axis => {
        const stat = totals.get(axis)!
        return { axis, mean: entriesWithBuilds ? Math.round((stat.sum / entriesWithBuilds) * 100) / 100 : 0, max: stat.max }
      }),
      mine: mineRow?.build ? { chassis: mineRow.chassis ?? 'hauler', points: mineRow.build.points } : null,
    }
  },
})

/**
 * The caller's replay library, newest first, with share links. Unions the
 * `replayParticipants` join table (every replay written since it existed,
 * challenge or tournament) with the caller's challenges (covers challenge
 * replays stored before the join table). Deduped by replay.
 */
export const myReplays = query({
  args: { rulesetId: v.optional(v.string()) },
  returns: v.array(v.object({
    shareId: v.string(),
    kind: v.union(v.literal('challenge'), v.literal('tournament')),
    names: v.array(v.string()),
    mySide: v.union(v.number(), v.null()),
    banked: v.array(v.number()),
    winnerIndex: v.union(v.number(), v.null()),
    mode: v.string(),
    rulesetId: v.optional(v.string()),
    season: v.number(),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const rulesetId = args.rulesetId === undefined ? undefined : normalizeRuleset(args.rulesetId)
    const filtering = args.rulesetId !== undefined
    const [joined, asChallenger, asDefender] = await Promise.all([
      ctx.db.query('replayParticipants').withIndex('by_user', q => q.eq('userId', userId)).order('desc').take(50),
      ctx.db.query('challenges').withIndex('by_challenger', q => q.eq('challengerUserId', userId)).order('desc').take(50),
      ctx.db.query('challenges').withIndex('by_defender', q => q.eq('defenderUserId', userId)).order('desc').take(50),
    ])
    const ids = new Set<Id<'replays'>>(joined.map(row => row.replayId))
    for (const challenge of [...asChallenger, ...asDefender]) if (challenge.replayId) ids.add(challenge.replayId)
    const rows = (await Promise.all([...ids].map(id => ctx.db.get(id))))
      .filter((row): row is Doc<'replays'> => row !== null)
      .filter(row => !filtering || rulesetOf(row) === rulesetId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
    return rows.map(row => {
      const side = row.participants.findIndex(participant => participant.userId === userId)
      return {
        shareId: row.shareId,
        kind: row.kind,
        names: row.participants.map(participant => participant.name),
        mySide: side === -1 ? null : side,
        banked: row.banked,
        winnerIndex: row.winnerIndex,
        mode: row.mode,
        rulesetId: rulesetOf(row),
        season: seasonOf(row),
        createdAt: row.createdAt,
      }
    })
  },
})

// ------------------------------------------------------------- mutations

/** Toggle whether a brain appears in the challenge pool. Own brains only. */
export const setListed = mutation({
  args: { brainId: v.string(), listed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const brain = await myBrain(ctx, userId, args.brainId)
    await ctx.db.patch(brain._id, { listed: args.listed })
    return null
  },
})

/** Remove a stored brain. Own brains only; replays and challenges stay. */
export const remove = mutation({
  args: { brainId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const brain = await myBrain(ctx, userId, args.brainId)
    await ctx.db.delete(brain._id)
    return null
  },
})

// ------------------------------------------------ internal writes & reads

/** Insert or replace a brain. Called only by the publish action after validation. */
export const upsertBrain = internalMutation({
  args: {
    userId: v.id('users'),
    brainId: v.string(),
    name: v.string(),
    checkpointId: v.string(),
    weightsHash: v.string(),
    checkpointJson: v.string(),
    build: v.optional(buildV),
    chassis: v.optional(v.string()),
    mode: v.string(),
    rulesetId: v.optional(v.string()),
  },
  returns: v.object({ brainId: v.string(), replaced: v.boolean() }),
  handler: async (ctx, args) => {
    if (!BRAIN_ID_PATTERN.test(args.brainId)) throw new ConvexError('invalid-brain-id')
    if (!LEAGUE_MODES.includes(args.mode as never)) throw new ConvexError('unknown-mode')
    const rulesetId = normalizeRuleset(args.rulesetId)
    const name = args.name.slice(0, 40) || args.checkpointId
    const existing = await ctx.db
      .query('brains')
      .withIndex('by_user_brain', q => q.eq('userId', args.userId).eq('brainId', args.brainId))
      .unique()
    if (existing) {
      // A brain id is bound to the ruleset it was published for: moving it would
      // carry its rating across rulesets. Publish under a new id instead.
      if (rulesetOf(existing) !== rulesetId) throw new ConvexError('ruleset-mismatch')
      await ctx.db.patch(existing._id, {
        name,
        checkpointId: args.checkpointId,
        weightsHash: args.weightsHash,
        checkpointJson: args.checkpointJson,
        build: args.build,
        chassis: args.chassis,
        season: CURRENT_SEASON,
      })
      return { brainId: args.brainId, replaced: true }
    }
    const count = (await ctx.db.query('brains').withIndex('by_user', q => q.eq('userId', args.userId)).collect()).length
    if (count >= MAX_BRAINS_PER_USER) throw new ConvexError('brain-cap')
    await ctx.db.insert('brains', {
      userId: args.userId,
      brainId: args.brainId,
      name,
      checkpointId: args.checkpointId,
      weightsHash: args.weightsHash,
      checkpointJson: args.checkpointJson,
      build: args.build,
      chassis: args.chassis,
      mode: args.mode,
      rating: RATING_START,
      matchesPlayed: 0,
      listed: true,
      season: CURRENT_SEASON,
      ...(rulesetId ? { rulesetId } : {}),
      createdAt: Date.now(),
    })
    return { brainId: args.brainId, replaced: false }
  },
})

function elo(rating: number, opponent: number, score: number): number {
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400))
  return Math.round((rating + ELO_K * (score - expected)) * 10) / 10
}

/**
 * Atomically records a finished challenge: the challenge row, the replay row
 * (metadata + storage ids + markers), and both brains' ratings. The action has
 * already run and verified the match; this mutation is the only writer.
 */
export const recordChallenge = internalMutation({
  args: {
    challengerUserId: v.id('users'),
    challengerBrainId: v.string(),
    defenderUserId: v.id('users'),
    defenderBrainId: v.string(),
    mode: v.string(),
    seed: v.number(),
    winnerSide: v.union(v.literal('challenger'), v.literal('defender'), v.null()),
    banked: v.array(v.number()),
    shareId: v.string(),
    storageIds: v.array(v.id('_storage')),
    championIndex: v.array(v.number()),
    markers: markersV,
    rulesVersion: v.string(),
  },
  returns: v.object({ challengeId: v.id('challenges'), shareId: v.string() }),
  handler: async (ctx, args) => {
    const challenger = await ctx.db
      .query('brains')
      .withIndex('by_user_brain', q => q.eq('userId', args.challengerUserId).eq('brainId', args.challengerBrainId))
      .unique()
    const defender = await ctx.db
      .query('brains')
      .withIndex('by_user_brain', q => q.eq('userId', args.defenderUserId).eq('brainId', args.defenderBrainId))
      .unique()
    if (!challenger || !defender) throw new ConvexError('brain-gone')
    // The ruleset is derived from the stored brains, never supplied by the caller.
    const rulesetId = rulesetOf(challenger)
    if (rulesetOf(defender) !== rulesetId) throw new ConvexError('ruleset-mismatch')
    const [challengerUser, defenderUser] = await Promise.all([ctx.db.get(args.challengerUserId), ctx.db.get(args.defenderUserId)])
    const challengerName = `${(challengerUser?.name ?? 'Anonymous').slice(0, 40)} · ${challenger.name}`
    const defenderName = `${(defenderUser?.name ?? 'Anonymous').slice(0, 40)} · ${defender.name}`

    // Replays are append-only: a shareId that already exists is a collision
    // the caller must retry with a fresh slug, never an overwrite.
    const collision = await ctx.db.query('replays').withIndex('by_share', q => q.eq('shareId', args.shareId)).unique()
    if (collision) throw new ConvexError('share-id-collision')

    const challengeId = await ctx.db.insert('challenges', {
      challengerUserId: args.challengerUserId,
      challengerBrainId: args.challengerBrainId,
      challengerName,
      defenderUserId: args.defenderUserId,
      defenderBrainId: args.defenderBrainId,
      defenderName,
      mode: args.mode,
      seed: args.seed,
      winnerSide: args.winnerSide,
      banked: args.banked,
      status: 'done',
      season: CURRENT_SEASON,
      ...(rulesetId ? { rulesetId } : {}),
      createdAt: Date.now(),
    })
    const replayId = await ctx.db.insert('replays', {
      shareId: args.shareId,
      kind: 'challenge',
      refId: challengeId,
      storageIds: args.storageIds,
      participants: [
        { name: challengerName, brainId: args.challengerBrainId, userId: args.challengerUserId },
        { name: defenderName, brainId: args.defenderBrainId, userId: args.defenderUserId },
      ],
      championIndex: args.championIndex,
      banked: args.banked,
      winnerIndex: args.winnerSide === 'challenger' ? 0 : args.winnerSide === 'defender' ? 1 : null,
      markers: args.markers,
      mode: args.mode,
      seed: args.seed,
      rulesVersion: args.rulesVersion,
      season: CURRENT_SEASON,
      ...(rulesetId ? { rulesetId } : {}),
      createdAt: Date.now(),
    })
    await ctx.db.patch(challengeId, { replayId })
    await addReplayParticipants(ctx, replayId, [args.challengerUserId, args.defenderUserId])

    const score = args.winnerSide === 'challenger' ? 1 : args.winnerSide === 'defender' ? 0 : 0.5
    await ctx.db.patch(challenger._id, { rating: elo(challenger.rating, defender.rating, score), matchesPlayed: challenger.matchesPlayed + 1 })
    await ctx.db.patch(defender._id, { rating: elo(defender.rating, challenger.rating, 1 - score), matchesPlayed: defender.matchesPlayed + 1 })
    return { challengeId, shareId: args.shareId }
  },
})

/** Marks a challenge as failed (the match could not be run/verified server-side). */
export const failChallenge = internalMutation({
  args: {
    challengerUserId: v.id('users'),
    challengerBrainId: v.string(),
    defenderUserId: v.id('users'),
    defenderBrainId: v.string(),
    mode: v.string(),
    seed: v.number(),
    message: v.string(),
    rulesetId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert('challenges', {
      challengerUserId: args.challengerUserId,
      challengerBrainId: args.challengerBrainId,
      challengerName: '',
      defenderUserId: args.defenderUserId,
      defenderBrainId: args.defenderBrainId,
      defenderName: '',
      mode: args.mode,
      seed: args.seed,
      winnerSide: null,
      banked: [],
      status: 'failed',
      message: args.message.slice(0, 200),
      season: CURRENT_SEASON,
      ...(normalizeRuleset(args.rulesetId) ? { rulesetId: normalizeRuleset(args.rulesetId) } : {}),
      createdAt: Date.now(),
    })
    return null
  },
})

/** Everything the challenge action needs, read under one transaction. */
export const loadChallenge = internalQuery({
  args: {
    userId: v.id('users'),
    brainId: v.string(),
    defenderBrain: v.id('brains'),
  },
  returns: v.object({
    challenger: v.object({ brainId: v.string(), name: v.string(), checkpointJson: v.string(), chassis: v.optional(v.string()), build: v.optional(buildV), mode: v.string(), rulesetId: v.optional(v.string()) }),
    defender: v.object({ brainId: v.string(), name: v.string(), checkpointJson: v.string(), chassis: v.optional(v.string()), build: v.optional(buildV), mode: v.string(), userId: v.id('users') }),
  }),
  handler: async (ctx, args) => {
    const challenger = await ctx.db
      .query('brains')
      .withIndex('by_user_brain', q => q.eq('userId', args.userId).eq('brainId', args.brainId))
      .unique()
    if (!challenger) throw new ConvexError('unknown-brain')
    const defender = await ctx.db.get(args.defenderBrain)
    if (!defender) throw new ConvexError('unknown-opponent')
    if (defender.userId === args.userId) throw new ConvexError('cannot-challenge-self')
    if (!defender.listed) throw new ConvexError('opponent-not-listed')
    if (defender.mode !== challenger.mode) throw new ConvexError('mode-mismatch')
    // Ratings and pools never mix across rulesets.
    if (rulesetOf(defender) !== rulesetOf(challenger)) throw new ConvexError('ruleset-mismatch')
    if (seasonOf(challenger) !== CURRENT_SEASON || seasonOf(defender) !== CURRENT_SEASON) throw new ConvexError('wrong-season')
    return {
      challenger: { brainId: challenger.brainId, name: challenger.name, checkpointJson: challenger.checkpointJson, chassis: challenger.chassis, build: challenger.build, mode: challenger.mode, rulesetId: rulesetOf(challenger) },
      defender: { brainId: defender.brainId, name: defender.name, checkpointJson: defender.checkpointJson, chassis: defender.chassis, build: defender.build, mode: defender.mode, userId: defender.userId },
    }
  },
})

/** Listed brains in a mode for a scheduled round, strongest first. */
export const listedForRound = internalQuery({
  args: { mode: v.string(), rulesetId: v.optional(v.string()) },
  returns: v.array(v.object({
    userId: v.id('users'),
    brainId: v.string(),
    name: v.string(),
    checkpointJson: v.string(),
    chassis: v.optional(v.string()),
    build: v.optional(buildV),
    rating: v.number(),
  })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('brains')
      .withIndex('by_ruleset_mode_listed', q => q.eq('rulesetId', normalizeRuleset(args.rulesetId)).eq('mode', args.mode).eq('listed', true))
      .collect()
    return rows
      .filter(row => seasonOf(row) === CURRENT_SEASON)
      .sort((a, b) => b.rating - a.rating || a.createdAt - b.createdAt)
      .slice(0, MAX_ROUNDS_PER_ROUND * 2)
      .map(({ userId, brainId, name, checkpointJson, chassis, build, rating }) => ({ userId, brainId, name, checkpointJson, chassis, build, rating }))
  },
})

/** Display name lookup for building participant labels in actions. */
export const displayName = internalQuery({
  args: { userId: v.id('users') },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    return (user?.name ?? 'Anonymous').slice(0, 40)
  },
})

/** The next round number for a mode. */
export const nextRound = internalQuery({
  args: { mode: v.string(), rulesetId: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('tournamentRounds').withIndex('by_ruleset_mode', q => q.eq('rulesetId', normalizeRuleset(args.rulesetId)).eq('mode', args.mode)).collect()
    return rows.reduce((max, row) => Math.max(max, row.round), 0) + 1
  },
})

/**
 * Records one scheduled round: the round row, a replay row per pairing, and
 * rating updates. One transaction — a round is either fully recorded or not.
 */
export const recordRound = internalMutation({
  args: {
    mode: v.string(),
    rulesetId: v.optional(v.string()),
    seed: v.number(),
    matches: v.array(v.object({
      aUserId: v.id('users'),
      aBrainId: v.string(),
      aName: v.string(),
      bUserId: v.id('users'),
      bBrainId: v.string(),
      bName: v.string(),
      winnerIndex: v.union(v.number(), v.null()),
      banked: v.array(v.number()),
      shareId: v.string(),
      storageIds: v.array(v.id('_storage')),
      championIndex: v.array(v.number()),
      markers: markersV,
      rulesVersion: v.string(),
    })),
  },
  returns: v.object({ round: v.number(), pairings: v.number() }),
  handler: async (ctx, args) => {
    const rulesetId = normalizeRuleset(args.rulesetId)
    const existing = await ctx.db.query('tournamentRounds').withIndex('by_ruleset_mode', q => q.eq('rulesetId', rulesetId).eq('mode', args.mode)).collect()
    const round = existing.reduce((max, row) => Math.max(max, row.round), 0) + 1
    const refId = roundRef(rulesetId, round)
    for (const match of args.matches) {
      // Replays are append-only: a shareId that already exists is a collision
      // the caller must retry with a fresh slug, never an overwrite.
      const collision = await ctx.db.query('replays').withIndex('by_share', q => q.eq('shareId', match.shareId)).unique()
      if (collision) throw new ConvexError('share-id-collision')
      const replayId = await ctx.db.insert('replays', {
        shareId: match.shareId,
        kind: 'tournament',
        refId,
        storageIds: match.storageIds,
        participants: [
          { name: match.aName, brainId: match.aBrainId, userId: match.aUserId },
          { name: match.bName, brainId: match.bBrainId, userId: match.bUserId },
        ],
        championIndex: match.championIndex,
        banked: match.banked,
        winnerIndex: match.winnerIndex,
        markers: match.markers,
        mode: args.mode,
        seed: args.seed,
        rulesVersion: match.rulesVersion,
        season: CURRENT_SEASON,
        ...(rulesetId ? { rulesetId } : {}),
        createdAt: Date.now(),
      })
      await addReplayParticipants(ctx, replayId, [match.aUserId, match.bUserId])
      const a = await ctx.db.query('brains').withIndex('by_user_brain', q => q.eq('userId', match.aUserId).eq('brainId', match.aBrainId)).unique()
      const b = await ctx.db.query('brains').withIndex('by_user_brain', q => q.eq('userId', match.bUserId).eq('brainId', match.bBrainId)).unique()
      if (a && b) {
        const score = match.winnerIndex === 0 ? 1 : match.winnerIndex === 1 ? 0 : 0.5
        await ctx.db.patch(a._id, { rating: elo(a.rating, b.rating, score), matchesPlayed: a.matchesPlayed + 1 })
        await ctx.db.patch(b._id, { rating: elo(b.rating, a.rating, 1 - score), matchesPlayed: b.matchesPlayed + 1 })
      }
    }
    await ctx.db.insert('tournamentRounds', { mode: args.mode, round, seed: args.seed, pairings: args.matches.length, season: CURRENT_SEASON, ...(rulesetId ? { rulesetId } : {}), createdAt: Date.now() })
    return { round, pairings: args.matches.length }
  },
})

/**
 * One-off, idempotent backfill of `replayParticipants` for replays stored
 * before the table existed. Run until `isDone`, passing back `continueCursor`:
 * `npx convex run league:backfillReplayParticipants '{}'`.
 */
export const backfillReplayParticipants = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ isDone: v.boolean(), continueCursor: v.string(), inserted: v.number() }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query('replays').paginate({ numItems: 100, cursor: args.cursor ?? null })
    let inserted = 0
    for (const replay of page.page) {
      for (const userId of new Set(replay.participants.map(participant => participant.userId))) {
        const have = await ctx.db
          .query('replayParticipants')
          .withIndex('by_replay', q => q.eq('replayId', replay._id).eq('userId', userId))
          .first()
        if (have) continue
        await ctx.db.insert('replayParticipants', { replayId: replay._id, userId, createdAt: replay.createdAt })
        inserted++
      }
    }
    return { isDone: page.isDone, continueCursor: page.continueCursor, inserted }
  },
})
