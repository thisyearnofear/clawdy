import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from '../_generated/api'
import schema from '../schema'
import { modules } from '../test.setup'
import { exportCheckpointJson } from '../../services/checkpointStorage'
import { SEASON_0_STARTER_CHECKPOINT } from '../../services/starterCheckpoint'

const starterJson = exportCheckpointJson(SEASON_0_STARTER_CHECKPOINT)

type T = ReturnType<typeof convexTest>
type Authed = Awaited<ReturnType<typeof makeUser>>['as']

async function makeUser(t: T, name: string) {
  const userId = await t.run(ctx => ctx.db.insert('users', { name }))
  return { userId, as: t.withIdentity({ subject: `${userId}|s` }) }
}

async function publish(as: Authed, brainId: string) {
  return as.action(api.leagueRun.publish, { brainId, name: `Brain ${brainId}`, checkpointJson: starterJson })
}

// The challenge action fetches the pinned terrain over HTTP exactly like prod
// (ASSET_BASE_URL); a throwaway localhost server stands in for the site.
let server: Server
beforeAll(async () => {
  const bytes = readFileSync(resolve(process.cwd(), 'public/terrain/sandstone-basin.glb'))
  server = createServer((req, res) => {
    if (req.url?.startsWith('/terrain/')) { res.end(bytes); return }
    res.statusCode = 404; res.end()
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as { port: number }
  process.env.ASSET_BASE_URL = `http://127.0.0.1:${port}`
})
afterAll(() => new Promise(done => server.close(done)))

describe('league brains', () => {
  it('requires sign-in for the pool and mutations', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.league.pool, {})).rejects.toThrow('sign-in-required')
    await expect(t.mutation(api.league.setListed, { brainId: 'x', listed: false })).rejects.toThrow('sign-in-required')
    await expect(t.action(api.leagueRun.publish, { brainId: 'b1', name: 'n', checkpointJson: starterJson })).rejects.toThrow('sign-in-required')
  })

  it('stores a validated brain and re-publishes in place', async () => {
    const t = convexTest(schema, modules)
    const { as } = await makeUser(t, 'Octo')
    expect(await publish(as, 'alpha')).toEqual({ brainId: 'alpha', replaced: false })
    expect(await publish(as, 'alpha')).toEqual({ brainId: 'alpha', replaced: true })
    const mine = await as.query(api.league.mine, {})
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ brainId: 'alpha', weightsHash: SEASON_0_STARTER_CHECKPOINT.weightsHash, mode: 'rush', listed: true, rating: 0 })
  })

  it('rejects malformed checkpoints and bad ids before writing', async () => {
    const t = convexTest(schema, modules)
    const { as } = await makeUser(t, 'Octo')
    await expect(as.action(api.leagueRun.publish, { brainId: 'b1', name: 'n', checkpointJson: '{"id":"x"}' })).rejects.toThrow('not a valid')
    await expect(as.action(api.leagueRun.publish, { brainId: 'bad id!', name: 'n', checkpointJson: starterJson })).rejects.toThrow('invalid-brain-id')
    expect(await as.query(api.league.mine, {})).toHaveLength(0)
  })

  it('hides unlisted brains from the pool and only the owner can unlist', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publish(a.as, 'alpha')
    expect(await b.as.query(api.league.pool, {})).toHaveLength(1)
    // Bob cannot unlist Alice's brain — the mutation is scoped by his identity.
    await expect(b.as.mutation(api.league.setListed, { brainId: 'alpha', listed: false })).rejects.toThrow('unknown-brain')
    await a.as.mutation(api.league.setListed, { brainId: 'alpha', listed: false })
    expect(await b.as.query(api.league.pool, {})).toHaveLength(0)
  })
})

describe('challenges', () => {
  it('refuses to challenge with a brain you do not own', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publish(a.as, 'alpha')
    const defenderDoc = (await b.as.query(api.league.pool, {}))[0] ?? (await a.as.query(api.league.mine, {}))[0]
    // Bob never published "alpha" — it is Alice's.
    await expect(b.as.action(api.leagueRun.challenge, { brainId: 'alpha', defenderBrain: defenderDoc._id })).rejects.toThrow('unknown-brain')
  })

  it('refuses unlisted or absent opponents and self-challenges', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publish(a.as, 'alpha')
    await publish(b.as, 'beta')
    const mine = await b.as.query(api.league.mine, {})
    await expect(b.as.action(api.leagueRun.challenge, { brainId: 'beta', defenderBrain: mine[0]._id })).rejects.toThrow('cannot-challenge-self')
    const aliceBrain = (await b.as.query(api.league.pool, {}))[0]
    await a.as.mutation(api.league.setListed, { brainId: 'alpha', listed: false })
    await expect(b.as.action(api.leagueRun.challenge, { brainId: 'beta', defenderBrain: aliceBrain._id })).rejects.toThrow('opponent-not-listed')
  })

  it('runs a two-account challenge end to end and serves the replay by share link', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publish(a.as, 'alpha')
    await publish(b.as, 'beta')
    const defender = (await b.as.query(api.league.pool, {}))[0]

    const result = await b.as.action(api.leagueRun.challenge, { brainId: 'beta', defenderBrain: defender._id })
    expect(result.banked).toHaveLength(2)
    expect(result.shareId).toMatch(/^[A-Za-z0-9_-]{16,}$/)

    // Identical checkpoints tie, so both ratings hold at 0 — but the match counted on both sides.
    const ratings = [await a.as.query(api.league.mine, {}), await b.as.query(api.league.mine, {})].flat()
    expect(ratings.every(brain => brain.matchesPlayed === 1)).toBe(true)

    // The replay is public by share slug and carries markers + both recordings.
    const replay = await t.query(api.league.viewReplay, { shareId: result.shareId })
    expect(replay).not.toBeNull()
    expect(replay!.participants.map(participant => participant.brainId)).toEqual(['beta', 'alpha'])
    expect(replay!.season).toBe(0)
    expect(replay!.urls).toHaveLength(2)
    expect(JSON.stringify(replay)).not.toContain(String(b.userId))

    // Both sides see it in their challenge history.
    expect(await a.as.query(api.league.challenges, {})).toHaveLength(1)
    expect(await b.as.query(api.league.challenges, {})).toHaveLength(1)
  }, 120_000)

  it('moves ratings Elo-style on a decisive result', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publish(a.as, 'alpha')
    await publish(b.as, 'beta')
    await t.mutation(internal.league.recordChallenge, {
      challengerUserId: b.userId,
      challengerBrainId: 'beta',
      defenderUserId: a.userId,
      defenderBrainId: 'alpha',
      mode: 'rush',
      seed: 1,
      winnerSide: 'challenger',
      banked: [7, 2],
      shareId: 'test-share-1',
      storageIds: [],
      championIndex: [],
      markers: [],
      rulesVersion: 'season-0.reference.3',
    })
    const [winner] = await b.as.query(api.league.mine, {})
    const [loser] = await a.as.query(api.league.mine, {})
    expect(winner.rating).toBeCloseTo(8, 1)
    expect(loser.rating).toBeCloseTo(-8, 1)
  })
})

describe('scheduled rounds', () => {
  it('pairs listed brains by rating and stores replay metadata', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    const c = await makeUser(t, 'Cara')
    await publish(a.as, 'alpha')
    await publish(b.as, 'beta')
    await publish(c.as, 'gamma')

    const outcome = await t.action(internal.leagueRun.runRound, { mode: 'rush', seed: 7 })
    expect(outcome).toEqual({ round: 1, pairings: 1 }) // 3 brains → one pairing, one bye

    const played = [...await a.as.query(api.league.mine, {}), ...await b.as.query(api.league.mine, {}), ...await c.as.query(api.league.mine, {})]
    expect(played.filter(brain => brain.matchesPlayed === 1)).toHaveLength(2)
    expect(played.filter(brain => brain.matchesPlayed === 0)).toHaveLength(1)

    const replays = await t.run(ctx => ctx.db.query('replays').collect())
    expect(replays).toHaveLength(1)
    expect(replays[0].kind).toBe('tournament')
    expect(replays[0].refId).toBe('round-1')
    expect(await t.query(api.league.viewReplay, { shareId: replays[0].shareId })).not.toBeNull()
  }, 120_000)

  it('is a no-op with fewer than two listed brains', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    await publish(a.as, 'alpha')
    expect(await t.action(internal.leagueRun.runRound, { mode: 'rush', seed: 1 })).toEqual({ round: null, pairings: 0 })
  })
})

describe('seasons', () => {
  it('stamps new brains and treats unseasoned rows as the genesis season', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publish(a.as, 'alpha')
    const mine = await a.as.query(api.league.mine, {})
    expect(mine[0].season).toBe(0)

    // A row written before seasons existed (no `season` field) counts as 0 —
    // the current season — so it stays in the pool.
    await t.run(ctx => ctx.db.insert('brains', {
      userId: b.userId,
      brainId: 'legacy',
      name: 'Legacy',
      checkpointId: 'cp',
      weightsHash: 'wh',
      checkpointJson: '{}',
      mode: 'rush',
      rating: 0,
      matchesPlayed: 0,
      listed: true,
      createdAt: Date.now(),
    }))
    expect((await a.as.query(api.league.pool, {})).map(row => row.brainId)).toEqual(['legacy'])
  })

  it('keeps a past-season brain out of the pool, pairings and challenges', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publish(a.as, 'alpha')
    await publish(b.as, 'beta')
    const betaId = (await t.run(ctx => ctx.db
      .query('brains')
      .withIndex('by_user_brain', q => q.eq('userId', b.userId).eq('brainId', 'beta'))
      .unique()))!._id
    // Bob's brain belongs to a different season once season 1 opens.
    await t.run(ctx => ctx.db.patch(betaId, { season: 1 }))

    expect(await a.as.query(api.league.pool, {})).toHaveLength(0)
    await expect(a.as.action(api.leagueRun.challenge, { brainId: 'alpha', defenderBrain: betaId })).rejects.toThrow('wrong-season')
    expect(await t.action(internal.leagueRun.runRound, { mode: 'rush', seed: 1 })).toEqual({ round: null, pairings: 0 })
  })

  it('serves the hall of fame: the per-chassis board filters by season', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    // A legacy entry — verified before seasons existed — is season 0.
    await t.run(ctx => ctx.db.insert('ladder', {
      userId: a.userId,
      displayName: 'Alice',
      checkpointId: 'cp',
      weightsHash: 'wh',
      score: 10,
      perOpponent: [],
      seeds: [1],
      rulesVersion: 'v',
      physicsVersion: 'p',
      colliderSha256: 'sha',
      verifiedAt: 1,
      submissions: 1,
      chassis: 'scout',
    }))
    expect(await t.query(api.league.topByChassis, {})).toEqual([
      { chassis: 'scout', displayName: 'Alice', score: 10, checkpointId: 'cp', verifiedAt: 1 },
    ])
    expect(await t.query(api.league.topByChassis, { season: 1 })).toHaveLength(0)
  })
})
