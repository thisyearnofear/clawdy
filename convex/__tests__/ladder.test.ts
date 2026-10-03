import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from '../_generated/api'
import schema from '../schema'
import { modules } from '../test.setup'

const perOpponent = [{ opponent: 'safe', matches: 12, wins: 6, losses: 6, margin: 0 }]

function result(userId: string, score: number, checkpointId = 'ckpt-1') {
  return {
    userId: userId as never,
    checkpointId,
    weightsHash: `hash-${checkpointId}`,
    score,
    perOpponent,
    seeds: [1, 2, 3],
    rulesVersion: 'season-0.reference.3',
    physicsVersion: 'rapier-kinematic-terrain-0.19.2.v3',
    colliderSha256: 'abc',
  }
}

async function makeUser(t: ReturnType<typeof convexTest>, name: string) {
  const userId = await t.run(ctx => ctx.db.insert('users', { name }))
  return { userId, as: t.withIdentity({ subject: `${userId}|s` }) }
}

describe('ladder', () => {
  it('keeps the best verified score per account and counts every submission', async () => {
    const t = convexTest(schema, modules)
    const { userId, as } = await makeUser(t, 'Octo')
    expect(await t.mutation(internal.ladder.recordResult, result(userId, 10))).toEqual({ improved: true, best: 10, submissions: 1 })
    expect(await t.mutation(internal.ladder.recordResult, result(userId, 4, 'ckpt-2'))).toEqual({ improved: false, best: 10, submissions: 2 })
    expect(await t.mutation(internal.ladder.recordResult, result(userId, 25, 'ckpt-3'))).toEqual({ improved: true, best: 25, submissions: 3 })
    const mine = await as.query(api.ladder.mine, {})
    expect(mine).toMatchObject({ displayName: 'Octo', checkpointId: 'ckpt-3', score: 25, submissions: 3 })
  })

  it('ranks by score and never exposes user ids', async () => {
    const t = convexTest(schema, modules)
    const low = await makeUser(t, 'Low')
    const high = await makeUser(t, 'High')
    await t.mutation(internal.ladder.recordResult, result(low.userId, -20))
    await t.mutation(internal.ladder.recordResult, result(high.userId, 40))
    const board = await t.query(api.ladder.top, {})
    expect(board.map(entry => entry.displayName)).toEqual(['High', 'Low'])
    expect(JSON.stringify(board)).not.toContain(high.userId)
    expect(await t.query(api.ladder.top, { limit: 1 })).toHaveLength(1)
  })

  it('has no entry for signed-out callers', async () => {
    const t = convexTest(schema, modules)
    expect(await t.query(api.ladder.mine, {})).toBeNull()
  })

  it('rate-limits verification runs per account', async () => {
    const t = convexTest(schema, modules)
    const { userId } = await makeUser(t, 'Octo')
    const other = await makeUser(t, 'Other')
    await t.mutation(internal.ladder.beginAttempt, { userId })
    await expect(t.mutation(internal.ladder.beginAttempt, { userId })).rejects.toThrow('rate-limited')
    await t.mutation(internal.ladder.beginAttempt, { userId: other.userId })
  })

  it('refuses submissions without a session', async () => {
    const t = convexTest(schema, modules)
    await expect(t.action(api.ladderRun.submit, { checkpointJson: '{}' })).rejects.toThrow('sign-in-required')
  })

  it('rejects a malformed checkpoint before spending an attempt', async () => {
    const t = convexTest(schema, modules)
    const { as } = await makeUser(t, 'Octo')
    await expect(as.action(api.ladderRun.submit, { checkpointJson: '{"id":"x"}' })).rejects.toThrow('not a valid')
    expect(await t.run(ctx => ctx.db.query('ladderAttempts').collect())).toHaveLength(0)
  })
})
