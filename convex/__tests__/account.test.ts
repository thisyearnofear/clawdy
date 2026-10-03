import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from '../_generated/api'
import schema from '../schema'
import { modules } from '../test.setup'

const GUEST = 'guest-aaaaaaaa1111'
const OTHER_GUEST = 'guest-bbbbbbbb2222'

function jobArgs(guestKey: string, jobId: string) {
  return {
    guestKey,
    jobId,
    status: 'succeeded' as const,
    parentCheckpointId: 'base',
    resultCheckpointId: null,
    exampleCount: 3,
    message: null,
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

async function signedIn(t: ReturnType<typeof convexTest>, name = 'Octo') {
  const userId = await t.run(ctx => ctx.db.insert('users', { name }))
  return { userId, as: t.withIdentity({ subject: `${userId}|session-1` }) }
}

describe('guest and account ownership', () => {
  it('keeps guests isolated from each other', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.trainingJobs.upsert, jobArgs(GUEST, 'job-1'))
    expect(await t.query(api.trainingJobs.listForGuest, { guestKey: GUEST })).toHaveLength(1)
    expect(await t.query(api.trainingJobs.listForGuest, { guestKey: OTHER_GUEST })).toHaveLength(0)
  })

  it('rejects a guest presenting a server-derived user key', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.trainingJobs.listForGuest, { guestKey: 'user-abcdefgh1234' })).rejects.toThrow('invalid guest key')
    await expect(t.mutation(api.trainingJobs.upsert, jobArgs('user-abcdefgh1234', 'job-x'))).rejects.toThrow('invalid guest key')
  })

  it('ignores the client guest key for a signed-in caller', async () => {
    const t = convexTest(schema, modules)
    const { userId, as } = await signedIn(t)
    await as.mutation(api.trainingJobs.upsert, jobArgs(OTHER_GUEST, 'job-1'))
    const stored = await t.run(ctx => ctx.db.query('trainingJobs').collect())
    expect(stored).toHaveLength(1)
    expect(stored[0].guestKey).toBe(`user-${userId}`)
    expect(stored[0].owner).toBe(`user:${userId}`)
    expect(await t.query(api.trainingJobs.listForGuest, { guestKey: OTHER_GUEST })).toHaveLength(0)
    expect(await as.query(api.trainingJobs.listForGuest, { guestKey: GUEST })).toHaveLength(1)
  })

  it('keeps two accounts apart', async () => {
    const t = convexTest(schema, modules)
    const first = await signedIn(t, 'First')
    const second = await signedIn(t, 'Second')
    await first.as.mutation(api.trainingJobs.upsert, jobArgs(GUEST, 'job-1'))
    expect(await second.as.query(api.trainingJobs.listForGuest, { guestKey: GUEST })).toHaveLength(0)
  })

  it('reports the signed-in profile and null when signed out', async () => {
    const t = convexTest(schema, modules)
    expect(await t.query(api.account.me, {})).toBeNull()
    const { userId, as } = await signedIn(t, 'Octo')
    expect(await as.query(api.account.me, {})).toEqual({ userId, name: 'Octo', image: null })
  })
})

describe('claiming guest history', () => {
  it('needs a session and a plain guest key', async () => {
    const t = convexTest(schema, modules)
    await expect(t.mutation(api.account.claimGuest, { guestKey: GUEST })).rejects.toThrow('sign in')
    const { as } = await signedIn(t)
    await expect(as.mutation(api.account.claimGuest, { guestKey: 'user-abcdefgh1234' })).rejects.toThrow('invalid guest key')
    await expect(as.mutation(api.account.claimGuest, { guestKey: 'x' })).rejects.toThrow('invalid guest key')
  })

  it('moves guest rows onto the account, and the account wins duplicates', async () => {
    const t = convexTest(schema, modules)
    const { userId, as } = await signedIn(t)
    await t.mutation(api.trainingJobs.upsert, jobArgs(GUEST, 'job-1'))
    await t.mutation(api.trainingJobs.upsert, jobArgs(GUEST, 'job-2'))
    await as.mutation(api.trainingJobs.upsert, { ...jobArgs(GUEST, 'job-2'), exampleCount: 99 })

    expect(await as.mutation(api.account.claimGuest, { guestKey: GUEST })).toEqual({ moved: 1, skipped: 1, remaining: 0 })

    const jobs = await as.query(api.trainingJobs.listForGuest, { guestKey: GUEST })
    expect(jobs.map(job => job.jobId).sort()).toEqual(['job-1', 'job-2'])
    expect(jobs.find(job => job.jobId === 'job-2')?.exampleCount).toBe(99)
    expect(await t.query(api.trainingJobs.listForGuest, { guestKey: GUEST })).toHaveLength(0)

    const rows = await t.run(ctx => ctx.db.query('trainingJobs').collect())
    expect(rows.every(row => row.guestKey === `user-${userId}` && row.owner === `user:${userId}`)).toBe(true)

    expect(await as.mutation(api.account.claimGuest, { guestKey: GUEST })).toEqual({ moved: 0, skipped: 0, remaining: 0 })
  })
})
