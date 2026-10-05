import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import schema from '../schema'
import { modules } from '../test.setup'
import { exportCheckpointJson } from '../../services/checkpointStorage'
import { SEASON_0_STARTER_CHECKPOINT } from '../../services/starterCheckpoint'
import { baseBuild } from '../../services/chassis'
import { replayArenaEpisode } from '../../services/arenaReplay'
import type { ArenaRecording } from '../../services/arenaEpisode'

const starterJson = exportCheckpointJson(SEASON_0_STARTER_CHECKPOINT)

type T = ReturnType<typeof convexTest>
type Authed = Awaited<ReturnType<typeof makeUser>>['as']

async function makeUser(t: T, name: string) {
  const userId = await t.run(ctx => ctx.db.insert('users', { name }))
  return { userId, as: t.withIdentity({ subject: `${userId}|s` }) }
}

const hauler = baseBuild('hauler')
const raider = baseBuild('raider')

function publishSkirmish(as: Authed, brainId: string, build = hauler) {
  return as.action(api.leagueRun.publish, { brainId, name: `Brain ${brainId}`, checkpointJson: starterJson, build, rulesetId: 'skirmish' })
}

function publishGrounds(as: Authed, brainId: string) {
  return as.action(api.leagueRun.publish, { brainId, name: `Brain ${brainId}`, checkpointJson: starterJson })
}

// Blobs cannot cross the t.run boundary, so the text is read inside it.
async function readRecording(t: T, storageId: Id<'_storage'>): Promise<ArenaRecording> {
  const text = await t.run(async ctx => (await (await ctx.storage.get(storageId))!.text()))
  return JSON.parse(text) as ArenaRecording
}

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

describe('ruleset publishing', () => {
  it('rejects unknown rulesets and requires a build for Skirmish', async () => {
    const t = convexTest(schema, modules)
    const { as } = await makeUser(t, 'Octo')
    await expect(as.action(api.leagueRun.publish, { brainId: 'a', name: 'n', checkpointJson: starterJson, rulesetId: 'nope' })).rejects.toThrow('unknown-ruleset')
    await expect(as.action(api.leagueRun.publish, { brainId: 'a', name: 'n', checkpointJson: starterJson, rulesetId: 'skirmish' })).rejects.toThrow('build-required')
    expect(await as.query(api.league.mine, {})).toHaveLength(0)
  })

  it('tags the brain and keeps a brain id bound to one ruleset', async () => {
    const t = convexTest(schema, modules)
    const { as } = await makeUser(t, 'Octo')
    await publishSkirmish(as, 'skirm')
    await publishGrounds(as, 'grounds')
    const mine = await as.query(api.league.mine, {})
    expect(mine.find(brain => brain.brainId === 'skirm')?.rulesetId).toBe('skirmish')
    // Training Grounds is stored as an absent tag, so Season 0 rows are untouched.
    expect(mine.find(brain => brain.brainId === 'grounds')?.rulesetId).toBeUndefined()
    // Re-publishing across rulesets would carry the rating over — refused.
    await expect(publishGrounds(as, 'skirm')).rejects.toThrow('ruleset-mismatch')
    await expect(publishSkirmish(as, 'grounds')).rejects.toThrow('ruleset-mismatch')
  })

  it('keeps pools separate and refuses cross-ruleset challenges', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publishSkirmish(a.as, 'alpha')
    await publishGrounds(b.as, 'beta')

    const groundsPool = await b.as.query(api.league.pool, {})
    const skirmishPool = await b.as.query(api.league.pool, { rulesetId: 'skirmish' })
    expect(groundsPool).toHaveLength(0) // Bob's own Training Grounds brain is excluded; Alice's Skirmish brain is not in this pool
    expect(skirmishPool.map(row => row.brainId)).toEqual(['alpha'])

    await expect(b.as.action(api.leagueRun.challenge, { brainId: 'beta', defenderBrain: skirmishPool[0]._id })).rejects.toThrow('ruleset-mismatch')
  })
})

describe('per-ruleset ladder', () => {
  const entry = (userId: string, score: number, rulesetId?: string) => ({
    userId: userId as never,
    checkpointId: `ckpt-${score}`,
    weightsHash: 'h',
    score,
    perOpponent: [{ opponent: 'safe', matches: 12, wins: 6, losses: 6, margin: 0 }],
    seeds: [1],
    rulesVersion: 'season-0.reference.3',
    physicsVersion: 'p',
    colliderSha256: 'abc',
    rulesetId,
  })

  it('holds one entry per account per ruleset and never mixes the boards', async () => {
    const t = convexTest(schema, modules)
    const { userId, as } = await makeUser(t, 'Octo')
    expect(await t.mutation(internal.ladder.recordResult, entry(userId, 10))).toEqual({ improved: true, best: 10, submissions: 1 })
    // A higher Skirmish score is a different entry, not an improvement of the first.
    expect(await t.mutation(internal.ladder.recordResult, entry(userId, 50, 'skirmish'))).toEqual({ improved: true, best: 50, submissions: 1 })
    expect(await t.mutation(internal.ladder.recordResult, entry(userId, 5, 'skirmish'))).toEqual({ improved: false, best: 50, submissions: 2 })

    expect((await as.query(api.ladder.mine, {}))?.score).toBe(10)
    expect((await as.query(api.ladder.mine, { rulesetId: 'skirmish' }))?.score).toBe(50)
    expect((await t.query(api.ladder.top, {})).map(row => row.score)).toEqual([10])
    expect((await t.query(api.ladder.top, { rulesetId: 'skirmish' })).map(row => row.score)).toEqual([50])
    expect(await t.run(ctx => ctx.db.query('ladder').collect())).toHaveLength(2)
  })

  it('keeps the ruleset tag when a better score replaces the entry', async () => {
    const t = convexTest(schema, modules)
    const { userId } = await makeUser(t, 'Octo')
    await t.mutation(internal.ladder.recordResult, entry(userId, 20, 'skirmish'))
    await t.mutation(internal.ladder.recordResult, entry(userId, 30, 'skirmish'))
    const rows = await t.run(ctx => ctx.db.query('ladder').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ score: 30, rulesetId: 'skirmish', submissions: 2 })
    // And a Training Grounds entry never gains a tag.
    const other = await makeUser(t, 'Cara')
    await t.mutation(internal.ladder.recordResult, entry(other.userId, 5))
    await t.mutation(internal.ladder.recordResult, entry(other.userId, 9))
    const cara = (await t.run(ctx => ctx.db.query('ladder').collect())).find(row => row.userId === other.userId)!
    expect('rulesetId' in cara).toBe(false)
  })

  it('filters the per-chassis board by ruleset', async () => {
    const t = convexTest(schema, modules)
    const { userId } = await makeUser(t, 'Octo')
    await t.mutation(internal.ladder.recordResult, { ...entry(userId, 10), chassis: 'scout' })
    await t.mutation(internal.ladder.recordResult, { ...entry(userId, 40, 'skirmish'), chassis: 'raider' })
    expect((await t.query(api.league.topByChassis, {})).map(row => row.chassis)).toEqual(['scout'])
    expect((await t.query(api.league.topByChassis, { rulesetId: 'skirmish' })).map(row => row.chassis)).toEqual(['raider'])
  })
})

describe('skirmish matches and replays', () => {
  it('plays a Skirmish challenge, tags the replay and re-simulates it from its own traits', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publishSkirmish(a.as, 'alpha', hauler)
    await publishSkirmish(b.as, 'beta', raider)
    const defender = (await b.as.query(api.league.pool, { rulesetId: 'skirmish' }))[0]

    const result = await b.as.action(api.leagueRun.challenge, { brainId: 'beta', defenderBrain: defender._id })

    const replay = await t.query(api.league.viewReplay, { shareId: result.shareId })
    expect(replay?.rulesetId).toBe('skirmish')
    expect((await b.as.query(api.league.challenges, {}))[0].rulesetId).toBe('skirmish')

    const row = (await t.run(ctx => ctx.db.query('replays').collect()))[0]
    expect(row.rulesetId).toBe('skirmish')
    for (const [side, storageId] of row.storageIds.entries()) {
      const recording = await readRecording(t, storageId)
      expect(recording.scenario.rulesetId).toBe('skirmish')
      // Beta (raider) is champion on side 0, alpha (hauler) on side 1; the perks
      // ride inside the stored scenario, so the replay needs nothing else.
      const [champion, rival] = recording.scenario.entrants
      const [raiderTraits, haulerTraits] = side === 0 ? [champion.traits, rival.traits] : [rival.traits, champion.traits]
      expect(raiderTraits?.stealAll).toBe(true)
      expect(haulerTraits?.capacity).toBe(5)
      expect(replayArenaEpisode(recording).divergedAt).toBeNull()
    }
  }, 120_000)

  it('keeps Season 0 replays untagged', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publishGrounds(a.as, 'alpha')
    await publishGrounds(b.as, 'beta')
    const defender = (await b.as.query(api.league.pool, {}))[0]
    const result = await b.as.action(api.leagueRun.challenge, { brainId: 'beta', defenderBrain: defender._id })
    expect((await t.query(api.league.viewReplay, { shareId: result.shareId }))?.rulesetId).toBeUndefined()
    const row = (await t.run(ctx => ctx.db.query('replays').collect()))[0]
    expect('rulesetId' in row).toBe(false)
    const recording = await readRecording(t, row.storageIds[0])
    expect('rulesetId' in recording.scenario).toBe(false)
  }, 120_000)
})

describe('per-ruleset rounds', () => {
  it('numbers rounds per ruleset and pairs only within one', async () => {
    const t = convexTest(schema, modules)
    const users = await Promise.all(['A', 'B', 'C', 'D'].map(name => makeUser(t, name)))
    await publishGrounds(users[0].as, 'g1')
    await publishGrounds(users[1].as, 'g2')
    await publishSkirmish(users[2].as, 's1')
    await publishSkirmish(users[3].as, 's2', raider)

    expect(await t.action(internal.leagueRun.runRound, { mode: 'rush', seed: 3 })).toEqual({ round: 1, pairings: 1 })
    expect(await t.action(internal.leagueRun.runRound, { mode: 'rush', seed: 3, rulesetId: 'skirmish' })).toEqual({ round: 1, pairings: 1 })
    expect(await t.action(internal.leagueRun.runRound, { mode: 'rush', seed: 4, rulesetId: 'skirmish' })).toEqual({ round: 2, pairings: 1 })

    const replays = await t.run(ctx => ctx.db.query('replays').collect())
    expect(replays.map(row => row.refId).sort()).toEqual(['round-1', 'skirmish-round-1', 'skirmish-round-2'])
    expect(replays.filter(row => row.rulesetId === 'skirmish')).toHaveLength(2)
    // Ratings only moved inside each pairing's own ruleset.
    const brains = await t.run(ctx => ctx.db.query('brains').collect())
    expect(brains.every(brain => brain.matchesPlayed >= 1)).toBe(true)
  }, 120_000)
})

describe('replay participants and the replay library', () => {
  it('writes one join row per account and serves the library newest first', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    const c = await makeUser(t, 'Cara')
    for (const [index, shareId] of ['old-share', 'new-share'].entries()) {
      await publishGrounds(a.as, 'alpha').catch(() => undefined)
      await publishGrounds(b.as, 'beta').catch(() => undefined)
      await t.mutation(internal.league.recordChallenge, {
        challengerUserId: b.userId,
        challengerBrainId: 'beta',
        defenderUserId: a.userId,
        defenderBrainId: 'alpha',
        mode: 'rush',
        seed: index,
        winnerSide: 'challenger',
        banked: [3, 1],
        shareId,
        storageIds: [],
        championIndex: [],
        markers: [],
        rulesVersion: 'season-0.reference.3',
      })
      await new Promise(done => setTimeout(done, 5))
    }
    expect(await t.run(ctx => ctx.db.query('replayParticipants').collect())).toHaveLength(4)

    const library = await a.as.query(api.league.myReplays, {})
    expect(library.map(item => item.shareId)).toEqual(['new-share', 'old-share'])
    expect(library[0]).toMatchObject({ mySide: 1, kind: 'challenge' })
    expect(await c.as.query(api.league.myReplays, {})).toHaveLength(0)
    expect(JSON.stringify(library)).not.toContain(String(b.userId))
  })

  it('finds a replay that predates the join table, and the backfill is idempotent', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    const replayId = await t.run(ctx => ctx.db.insert('replays', {
      shareId: 'legacy-round',
      kind: 'tournament',
      refId: 'round-1',
      storageIds: [],
      participants: [
        { name: 'A', brainId: 'alpha', userId: a.userId },
        { name: 'B', brainId: 'beta', userId: b.userId },
      ],
      championIndex: [],
      banked: [1, 2],
      winnerIndex: 1,
      markers: [],
      mode: 'rush',
      seed: 1,
      rulesVersion: 'v',
      createdAt: 1,
    }))
    // Legacy tournament replays have no challenge row and no join row: invisible.
    expect(await a.as.query(api.league.myReplays, {})).toHaveLength(0)

    expect(await t.mutation(internal.league.backfillReplayParticipants, {})).toMatchObject({ isDone: true, inserted: 2 })
    expect(await t.mutation(internal.league.backfillReplayParticipants, {})).toMatchObject({ inserted: 0 })
    expect((await a.as.query(api.league.myReplays, {})).map(item => item.shareId)).toEqual(['legacy-round'])
    expect(await t.run(ctx => ctx.db.query('replayParticipants').withIndex('by_replay', q => q.eq('replayId', replayId)).collect())).toHaveLength(2)
  })

  it('filters the library by ruleset', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Alice')
    const b = await makeUser(t, 'Bob')
    await publishGrounds(a.as, 'g1')
    await publishGrounds(b.as, 'g2')
    await publishSkirmish(a.as, 's1')
    await publishSkirmish(b.as, 's2')
    const args = (shareId: string, mine: string, theirs: string) => ({
      challengerUserId: b.userId, challengerBrainId: mine, defenderUserId: a.userId, defenderBrainId: theirs,
      mode: 'rush', seed: 1, winnerSide: null, banked: [1, 1], shareId, storageIds: [], championIndex: [], markers: [], rulesVersion: 'v',
    })
    await t.mutation(internal.league.recordChallenge, args('grounds-share', 'g2', 'g1'))
    await t.mutation(internal.league.recordChallenge, args('skirmish-share', 's2', 's1'))
    expect((await a.as.query(api.league.myReplays, {})).map(item => item.shareId).sort()).toEqual(['grounds-share', 'skirmish-share'])
    expect((await a.as.query(api.league.myReplays, { rulesetId: 'skirmish' })).map(item => item.shareId)).toEqual(['skirmish-share'])
  })
})
