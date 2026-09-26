import { describe, expect, it } from 'vitest'
import { SEASON_0_BASE_CHECKPOINT, type PolicyCheckpoint } from '../policyModel'
import type { ArenaTrainingExample } from '../policyTrainer'
import { checkpointKey, exampleKey, hashRecord, planMerge, type PulledState, type SyncMeta } from '../syncEngine'

function checkpoint(id: string, name = id): PolicyCheckpoint {
  return { ...structuredClone(SEASON_0_BASE_CHECKPOINT), id, name }
}

function example(id: string): ArenaTrainingExample {
  return {
    id,
    sourceEpisodeId: 'sandstone-practice-01',
    tick: 20,
    observation: { self: {}, rival: {}, weather: {} } as never,
    originalAction: { type: 'wait' },
    preferredAction: { type: 'bank' },
    rationale: 'test',
    approved: true,
    source: 'approved',
  }
}

const EMPTY_PULL: PulledState = { checkpoints: [], examples: [] }

function metaWith(key: string, m: number, record: unknown): SyncMeta {
  return { records: { [key]: { h: hashRecord(record), m } }, matches: {} }
}

describe('syncEngine.planMerge', () => {
  it('restores a checkpoint that only exists on the server (other device)', () => {
    const serverCkpt = checkpoint('ckpt-remote')
    const plan = planMerge(
      { checkpoints: [checkpoint('local')], examples: [] },
      { ...EMPTY_PULL, checkpoints: [{ ...toRow(serverCkpt), updatedAtMs: 1000 }] },
      { records: {}, matches: {} },
    )
    expect(plan.checkpoints.map(c => c.id)).toContain('ckpt-remote')
    expect(plan.pushCheckpoints.map(c => c.id)).toEqual(['local']) // local-only needs a push
    expect(plan.meta.records[checkpointKey('ckpt-remote')]).toEqual({ h: hashRecord(serverCkpt), m: 1000 })
  })

  it('drops a local record the server tombstoned with a newer clock', () => {
    const local = checkpoint('ckpt-both')
    const plan = planMerge(
      { checkpoints: [local], examples: [] },
      {
        ...EMPTY_PULL,
        checkpoints: [{ checkpointId: 'ckpt-both', updatedAtMs: 2000, tombstone: true } as never],
      },
      metaWith(checkpointKey('ckpt-both'), 1000, local),
    )
    expect(plan.checkpoints).toHaveLength(0)
    expect(plan.meta.records[checkpointKey('ckpt-both')]).toEqual({ h: -1, m: 2000 })
  })

  it('keeps a locally-deleted record deleted when the server never saw the tombstone', () => {
    const plan = planMerge(
      { checkpoints: [checkpoint('keep-me')], examples: [] },
      { ...EMPTY_PULL, checkpoints: [toRow(checkpoint('ghost'), { updatedAtMs: 1500 })] },
      { records: { [checkpointKey('ghost')]: { h: -1, m: 2000 } }, matches: {} },
    )
    expect(plan.checkpoints.map(c => c.id)).toEqual(['keep-me'])
  })

  it('adopts the newer server copy and pushes the newer local edit', () => {
    const older = checkpoint('ckpt-x', 'server-wins')
    const localNewer = checkpoint('ckpt-y', 'local-wins')
    const plan = planMerge(
      { checkpoints: [checkpoint('ckpt-x', 'stale local'), localNewer], examples: [] },
      { ...EMPTY_PULL, checkpoints: [toRow(older, { updatedAtMs: 5000 })] },
      {
        records: {
          [checkpointKey('ckpt-x')]: { h: hashRecord(checkpoint('ckpt-x', 'stale local')), m: 1000 },
          [checkpointKey('ckpt-y')]: { h: 12345, m: 4000 }, // server never saw the newest local bytes
        },
        matches: {},
      },
    )
    const serverWon = plan.checkpoints.find(c => c.id === 'ckpt-x')
    expect(serverWon?.name).toBe('server-wins')
    expect(plan.pushCheckpoints.map(c => c.id)).toEqual(['ckpt-y'])
  })

  it('tombstoned-but-newer-local re-pushes instead of dropping', () => {
    const local = checkpoint('ckpt-res')
    const plan = planMerge(
      { checkpoints: [local], examples: [] },
      { ...EMPTY_PULL, checkpoints: [{ checkpointId: 'ckpt-res', updatedAtMs: 500, tombstone: true } as never] },
      metaWith(checkpointKey('ckpt-res'), 900, local),
    )
    expect(plan.checkpoints.map(c => c.id)).toEqual(['ckpt-res'])
    expect(plan.pushCheckpoints.map(c => c.id)).toEqual(['ckpt-res'])
  })

  it('refuses to adopt a corrupt payload and keeps the local record untouched', () => {
    const local = checkpoint('ckpt-c')
    const plan = planMerge(
      { checkpoints: [local], examples: [] },
      {
        ...EMPTY_PULL,
        checkpoints: [{
          checkpointId: 'ckpt-c',
          updatedAtMs: 9000,
          payloadRejected: true,
          legacyPayload: { garbage: true },
        } as never],
      },
      { records: {}, matches: {} },
    )
    expect(plan.checkpoints).toEqual([local])
  })

  it('leaves records untouched when the server row carries no adoptable payload', () => {
    const ex = example('ex-1')
    const plan = planMerge(
      { checkpoints: [], examples: [ex] },
      { ...EMPTY_PULL, examples: [{ exampleId: 'ex-1', updatedAtMs: 100 } as never] },
      metaWith(exampleKey('ex-1'), 200, ex), // same bytes, newer local claim
    )
    expect(plan.examples).toEqual([ex])
    expect(plan.pushExamples).toHaveLength(0)
  })

  it('preserves local ordering while appending restored records', () => {
    const a = checkpoint('a')
    const b = checkpoint('b')
    const plan = planMerge(
      { checkpoints: [b, a], examples: [] },
      { ...EMPTY_PULL, checkpoints: [toRow(checkpoint('remote'), { updatedAtMs: 10 })] },
      { records: {}, matches: {} },
    )
    expect(plan.checkpoints[0].id).toBe('b')
    expect(plan.checkpoints[1].id).toBe('a')
  })
})

function toRow(record: PolicyCheckpoint, extra: Partial<PulledState['checkpoints'][number]> = {}) {
  return {
    checkpointId: record.id,
    name: record.name,
    schemaVersion: record.schemaVersion,
    parentCheckpointId: record.parentCheckpointId,
    weightsHash: record.weightsHash,
    createdAt: record.createdAt,
    approvedExampleIds: [],
    doc: record,
    ...extra,
  }
}
