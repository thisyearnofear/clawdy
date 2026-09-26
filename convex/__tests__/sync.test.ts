import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from '../_generated/api'
import schema from '../schema'
import { modules } from '../test.setup'

const GUEST_A = 'guest-aaaaaaaa1111'
const GUEST_B = 'guest-bbbbbbbb2222'

function checkpointDoc(id: string) {
  return {
    schemaVersion: 'season-0.checkpoint.v2',
    id,
    name: `ckpt ${id}`,
    parentCheckpointId: null,
    createdAt: '2026-09-26T00:00:00.000Z',
    weightsHash: `hash-${id}`,
    trainingSummary: { epochs: 1, loss: 0.5, sampleCount: 2, datasetHash: 'ds:test:2', accuracy: 0.5 },
    weights: {
      hidden1: { weights: [[0.1]], biases: [0.1] },
      hidden2: { weights: [[0.1]], biases: [0.1] },
      actionHead: { weights: [[0.1]], biases: [0.1] },
    },
  }
}

function checkpointArgs(guestKey: string, checkpointId: string, updatedAtMs: number) {
  return {
    guestKey,
    checkpointId,
    name: `ckpt ${checkpointId}`,
    schemaVersion: 'season-0.checkpoint.v2',
    parentCheckpointId: null,
    weightsHash: `hash-${checkpointId}`,
    createdAt: '2026-09-26T00:00:00.000Z',
    approvedExampleIds: [],
    doc: checkpointDoc(checkpointId),
    updatedAtMs,
  }
}

function exampleDoc(id: string) {
  return {
    id,
    sourceEpisodeId: 'ep-1',
    tick: 20,
    observation: { schemaVersion: 'arena-observation-v2', tick: 20 },
    originalAction: { type: 'wait' as const },
    preferredAction: { type: 'collect' as const },
    rationale: 'collect on node beats walking off it',
    approved: true,
    source: 'approved' as const,
  }
}

function exampleArgs(guestKey: string, exampleId: string, updatedAtMs: number) {
  return {
    guestKey,
    exampleId,
    sourceEpisodeId: 'ep-1',
    tick: 20,
    approved: true,
    rationale: 'collect on node beats walking off it',
    preferredActionType: 'collect',
    doc: exampleDoc(exampleId),
    updatedAtMs,
  }
}

const t0 = () => convexTest(schema, modules)

describe('sync protocol', () => {
  it('isolates guests: pulls never cross-owner rows', async () => {
    const t = t0()
    await t.mutation(api.sync.upsertCheckpoint, checkpointArgs(GUEST_A, 'ck-1', 1000))
    const a = await t.query(api.sync.pull, { guestKey: GUEST_A })
    const b = await t.query(api.sync.pull, { guestKey: GUEST_B })
    expect(a.checkpoints.map(c => c.checkpointId)).toEqual(['ck-1'])
    expect(b.checkpoints).toHaveLength(0)
  })

  it('refuses malformed guest keys', async () => {
    const t = t0()
    await expect(t.mutation(api.sync.upsertCheckpoint, checkpointArgs('short', 'ck-1', 1000))).rejects.toThrow()
    await expect(t.query(api.sync.pull, { guestKey: 'has spaces' })).rejects.toThrow()
  })

  it('LWW: rejects older proposals, accepts newer ones', async () => {
    const t = t0()
    const fresh = checkpointArgs(GUEST_A, 'ck-1', 5000)
    expect(await t.mutation(api.sync.upsertCheckpoint, fresh)).toMatchObject({ status: 'ok' })

    const stale = await t.mutation(api.sync.upsertCheckpoint, {
      ...checkpointArgs(GUEST_A, 'ck-1', 4000),
      name: 'stale write must not land',
    })
    expect(stale.status).toBe('rejected-stale')

    const pulled = await t.query(api.sync.pull, { guestKey: GUEST_A })
    expect(pulled.checkpoints[0].name).toBe('ckpt ck-1')
    expect(pulled.checkpoints[0].updatedAtMs).toBe(5000)

    const newer = await t.mutation(api.sync.upsertCheckpoint, { ...checkpointArgs(GUEST_A, 'ck-1', 6000), name: 'newer wins' })
    expect(newer.status).toBe('ok')
    const after = await t.query(api.sync.pull, { guestKey: GUEST_A })
    expect(after.checkpoints[0].name).toBe('newer wins')
  })

  it('equal clocks are idempotent: second write at same updatedAtMs is stale', async () => {
    const t = t0()
    await t.mutation(api.sync.upsertCheckpoint, checkpointArgs(GUEST_A, 'ck-1', 5000))
    const again = await t.mutation(api.sync.upsertCheckpoint, checkpointArgs(GUEST_A, 'ck-1', 5000))
    expect(again.status).toBe('rejected-stale')
  })

  it('checkpoint cap: insert #41 rejected, patches still allowed', async () => {
    const t = t0()
    for (let i = 0; i < 40; i++) {
      await t.mutation(api.sync.upsertCheckpoint, checkpointArgs(GUEST_A, `ck-${i}`, 1000 + i))
    }
    await expect(t.mutation(api.sync.upsertCheckpoint, checkpointArgs(GUEST_A, 'ck-40', 2000)))
      .rejects.toThrow(/cap-exceeded/)
    // Patches of existing rows bypass the cap.
    const patched = await t.mutation(api.sync.upsertCheckpoint, {
      ...checkpointArgs(GUEST_A, 'ck-0', 9999),
      name: 'patch at cap is fine',
    })
    expect(patched.status).toBe('ok')
    // The cap is per guest.
    const other = await t.mutation(api.sync.upsertCheckpoint, checkpointArgs(GUEST_B, 'ck-0', 1000))
    expect(other.status).toBe('ok')
  })

  // 200 sequential in-memory mutations outrun the default 5s budget when the
  // suite shares CPU with the physics tests.
  it('example cap: insert #201 rejected', async () => {
    const t = t0()
    for (let i = 0; i < 200; i++) {
      await t.mutation(api.sync.upsertExample, exampleArgs(GUEST_A, `ex-${i}`, 1000 + i))
    }
    await expect(t.mutation(api.sync.upsertExample, exampleArgs(GUEST_A, 'ex-200', 2000)))
      .rejects.toThrow(/cap-exceeded/)
  }, 30_000)

  it('sync upserts never duplicate a record (transactional read-then-insert)', async () => {
    const t = t0()
    await t.mutation(api.sync.upsertExample, exampleArgs(GUEST_A, 'ex-1', 1000))
    await t.mutation(api.sync.upsertExample, { ...exampleArgs(GUEST_A, 'ex-1', 2000), rationale: 'updated' })
    const rows = await t.query(api.sync.pull, { guestKey: GUEST_A })
    expect(rows.examples.filter(e => e.exampleId === 'ex-1')).toHaveLength(1)
    expect(rows.examples[0].rationale).toBe('updated')
  })

  it('deletes propagate as tombstones and block resurrection', async () => {
    const t = t0()
    await t.mutation(api.sync.upsertCheckpoint, checkpointArgs(GUEST_A, 'ck-1', 1000))
    const del = await t.mutation(api.sync.deleteCheckpoint, { guestKey: GUEST_A, recordId: 'ck-1', updatedAtMs: 2000 })
    expect(del.status).toBe('ok')

    const pulled = await t.query(api.sync.pull, { guestKey: GUEST_A })
    expect(pulled.checkpoints[0].tombstone).toBe(true)

    const resurrect = await t.mutation(api.sync.upsertCheckpoint, checkpointArgs(GUEST_A, 'ck-1', 3000))
    expect(resurrect.status).toBe('rejected-tombstone')

    const staleDelete = await t.mutation(api.sync.deleteCheckpoint, { guestKey: GUEST_A, recordId: 'ck-1', updatedAtMs: 1500 })
    expect(staleDelete.status).toBe('rejected-tombstone')

    const missing = await t.mutation(api.sync.deleteCheckpoint, { guestKey: GUEST_A, recordId: 'nope', updatedAtMs: 5000 })
    expect(missing.status).toBe('rejected-stale')
  })

  it('typed doc column rejects malformed payloads at write time', async () => {
    const t = t0()
    const bad = {
      ...checkpointArgs(GUEST_A, 'ck-1', 1000),
      doc: {
        ...checkpointDoc('ck-1'),
        weights: { hidden1: { weights: 'not-matrix', biases: [] }, hidden2: {}, actionHead: {} },
      },
    }
    await expect(t.mutation(api.sync.upsertCheckpoint, bad as never)).rejects.toThrow()
  })

  it('backfillLegacy migrates valid blobs, flags rejects, stamps history rows', async () => {
    const t = t0()
    await t.run(async ctx => {
      await ctx.db.insert('checkpoints', {
        guestKey: GUEST_A,
        checkpointId: 'legacy-1',
        name: 'Legacy one',
        schemaVersion: 'season-0.checkpoint.v2',
        parentCheckpointId: null,
        weightsHash: 'hash-legacy',
        createdAt: '2026-09-01T00:00:00.000Z',
        approvedExampleIds: [],
        payload: checkpointDoc('legacy-1'),
      })
      await ctx.db.insert('checkpoints', {
        guestKey: GUEST_A,
        checkpointId: 'legacy-bad',
        name: 'Corrupt',
        schemaVersion: 'season-0.checkpoint.v2',
        parentCheckpointId: null,
        weightsHash: 'hash-corrupt',
        createdAt: '2026-09-01T00:00:00.000Z',
        approvedExampleIds: [],
        payload: { totally: 'not a checkpoint' },
      })
      await ctx.db.insert('matches', {
        guestKey: GUEST_A,
        matchId: 'm-1',
        scenarioId: 's-1',
        rulesVersion: 'season-0.reference.2',
        scored: true,
        checkpointId: null,
        championBanked: 3,
        rivalBanked: 2,
        winner: 'champion',
        finishedAt: '2026-09-02T00:00:00.000Z',
        linkedExampleIds: [],
      })
    })

    const result = await t.mutation(internal.sync.backfillLegacy, {})
    expect(result.checkpoints.migrated).toBe(1)
    expect(result.checkpoints.rejected).toBe(1)
    expect(result.history.migrated).toBe(1)

    const pulled = await t.query(api.sync.pull, { guestKey: GUEST_A })
    const good = pulled.checkpoints.find(c => c.checkpointId === 'legacy-1')!
    expect(good.doc).toBeDefined()
    expect(good.payloadRejected).toBeUndefined()
    expect(good.owner).toBe(`guest:${GUEST_A}`)
    expect(good.updatedAtMs).toBe(Date.parse('2026-09-01T00:00:00.000Z'))

    const bad = pulled.checkpoints.find(c => c.checkpointId === 'legacy-bad')!
    expect(bad.doc).toBeUndefined()
    expect(bad.payloadRejected).toBe(true)
    expect(bad.legacyPayload).toMatchObject({ totally: 'not a checkpoint' })

    // Idempotent: second run skips everything.
    const again = await t.mutation(internal.sync.backfillLegacy, {})
    expect(again.checkpoints.migrated).toBe(0)
    expect(again.checkpoints.rejected).toBe(0)
    expect(again.checkpoints.skipped).toBe(2)
    expect(again.history.skipped).toBe(1)
  })

  it('serverSeenAt orders lineage independent of client clocks', async () => {
    const t = t0()
    // convex-test uses the real clock; a couple of ms between writes gives
    // serverSeenAt distinct values the way two human trainings would.
    const pause = () => new Promise(resolve => setTimeout(resolve, 3))
    // Client clock from the future for the first job, older for the second —
    // ordering must follow server arrival, not client claims.
    await t.mutation(api.trainingJobs.upsert, {
      guestKey: GUEST_A,
      jobId: 'job-old',
      status: 'succeeded',
      parentCheckpointId: 'ck-base',
      resultCheckpointId: 'ck-1',
      exampleCount: 5,
      message: null,
      updatedAt: '2030-01-01T00:00:00.000Z',
    })
    await pause()
    const chain1 = await t.query(api.lineage.latestChain, { guestKey: GUEST_A })
    expect(chain1?.jobId).toBe('job-old')

    await t.mutation(api.trainingJobs.upsert, {
      guestKey: GUEST_A,
      jobId: 'job-new',
      status: 'succeeded',
      parentCheckpointId: 'ck-1',
      resultCheckpointId: 'ck-2',
      exampleCount: 9,
      message: null,
      updatedAt: '2020-01-01T00:00:00.000Z',
    })
    await pause()
    const chain2 = await t.query(api.lineage.latestChain, { guestKey: GUEST_A })
    expect(chain2?.jobId).toBe('job-new')
  })
})
