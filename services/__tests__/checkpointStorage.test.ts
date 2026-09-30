import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHECKPOINT_STORAGE_KEY,
  exportCheckpointJson,
  importCheckpointJson,
  loadStoredCheckpoints,
  loadStoredExamples,
  readCheckpointFile,
  saveStoredCheckpoints,
  saveStoredExamples,
} from '../checkpointStorage'
import { SEASON_0_BASE_CHECKPOINT } from '../policyModel'
import { SEASON_0_STARTER_CHECKPOINT } from '../starterCheckpoint'
import type { ArenaTrainingExample } from '../policyTrainer'

describe('checkpointStorage', () => {
  const store = new Map<string, string>()

  const mockLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  }

  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    })
  })

  it('loads the bundled starter checkpoint when storage is empty or invalid', () => {
    expect(loadStoredCheckpoints()).toEqual([SEASON_0_STARTER_CHECKPOINT])

    localStorage.setItem(CHECKPOINT_STORAGE_KEY, 'not-json')
    expect(loadStoredCheckpoints()).toEqual([SEASON_0_STARTER_CHECKPOINT])

    localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify([{ invalid: true }]))
    expect(loadStoredCheckpoints()).toEqual([SEASON_0_STARTER_CHECKPOINT])
  })

  it('saves and loads valid checkpoints and keeps house brains present', () => {
    const customCheckpoint = {
      ...SEASON_0_BASE_CHECKPOINT,
      id: 'custom-ckpt-1',
      name: 'Custom Trained Champion',
    }

    saveStoredCheckpoints([customCheckpoint])
    const loaded = loadStoredCheckpoints()
    // User brain first, then the current bundled starter, then base.
    expect(loaded.length).toBe(3)
    expect(loaded[0].id).toBe('custom-ckpt-1')
    expect(loaded[1].id).toBe(SEASON_0_STARTER_CHECKPOINT.id)
    expect(loaded[2].id).toBe(SEASON_0_BASE_CHECKPOINT.id)
  })

  it('replaces a stored superseded starter with the current bundle', () => {
    // A persisted copy of an older bundled starter is a stale house
    // artifact, not a user-owned brain — loading swaps in the current one.
    const staleStarter = {
      ...SEASON_0_STARTER_CHECKPOINT,
      id: 'checkpoint-muithmeq-f13d82',
      name: 'Starter brain (house-trained)',
    }
    saveStoredCheckpoints([staleStarter, SEASON_0_BASE_CHECKPOINT])
    const loaded = loadStoredCheckpoints()
    expect(loaded.map(c => c.id)).toEqual([SEASON_0_BASE_CHECKPOINT.id, SEASON_0_STARTER_CHECKPOINT.id])
    expect(loaded.some(c => c.id === 'checkpoint-muithmeq-f13d82')).toBe(false)
  })

  it('loads and saves coaching examples safely', () => {
    expect(loadStoredExamples()).toEqual([])

    const examples: ArenaTrainingExample[] = [
      {
        id: 'ex-1',
        sourceEpisodeId: 'ep-test',
        tick: 12,
        observation: {
          schemaVersion: 'arena-observation-v1',
          rulesVersion: 'rules-v2',
          tick: 12,
          remainingTicks: 588,
          decisionDue: true,
          self: {
            id: 'champion', baseNode: 'a', policyVersion: 'test', nodeId: 'a', position: [0, 0, 0],
            transit: null, energy: 3, cargo: 0, banked: 0, cooldownUntilTick: 0, staggeredUntilTick: 0, lastOutcome: null,
            visitedNodes: ['a'], knownResources: [], grounded: true, rotation: [0, 0, 0, 1], blockedTicks: 0, blockedEdges: [], recoveries: 0,
          },
          rivals: [],
          nodes: [],
          edges: [],
          resources: [],
          weather: { flooded: false, drainedUntilTick: 0 },
          availableActions: [{ type: 'wait' }],
          fog: { visible: ['a'], remembered: [], hidden: [] },
        },
        originalAction: { type: 'wait' },
        preferredAction: { type: 'wait' },
        rationale: 'Avoid water',
        approved: true,
        source: 'approved',
      },
    ]

    saveStoredExamples(examples)
    const loaded = loadStoredExamples()
    expect(loaded).toEqual(examples)
  })

  it('exports and imports checkpoint JSON with strict validation', () => {
    const jsonStr = exportCheckpointJson(SEASON_0_BASE_CHECKPOINT)
    expect(typeof jsonStr).toBe('string')

    const imported = importCheckpointJson(jsonStr)
    expect(imported.id).toBe(SEASON_0_BASE_CHECKPOINT.id)
    expect(imported.weightsHash).toBe(SEASON_0_BASE_CHECKPOINT.weightsHash)

    // Throws on corrupt JSON or missing fields
    expect(() => importCheckpointJson('{"bad": 123}')).toThrow('valid Clawdy Season 0 PolicyCheckpoint')
    expect(() => importCheckpointJson('invalid-json')).toThrow('Invalid JSON')
  })
})

class MockFileReader {
  static instances: MockFileReader[] = []
  static throwOnRead = false
  result: string | null = null
  error: unknown = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  readAsText = vi.fn(() => { if (MockFileReader.throwOnRead) throw new Error('read denied') })
  abort = vi.fn(() => { this.onabort?.() })
  constructor() { MockFileReader.instances.push(this) }
}

const abortError = expect.objectContaining({ name: 'AbortError' })
const blob = new Blob(['x'], { type: 'application/json' })
const validJson = () => exportCheckpointJson({ ...SEASON_0_BASE_CHECKPOINT, id: 'imported-ckpt-1', name: 'Imported Brain' })

describe('readCheckpointFile', () => {
  beforeEach(() => {
    MockFileReader.instances = []
    MockFileReader.throwOnRead = false
    vi.stubGlobal('FileReader', MockFileReader)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves with the validated checkpoint while the predicate stays true', async () => {
    const promise = readCheckpointFile(blob, () => true, new AbortController().signal)
    const reader = MockFileReader.instances[0]
    expect(reader.readAsText).toHaveBeenCalledWith(blob)
    reader.result = validJson()
    reader.onload!()
    await expect(promise).resolves.toMatchObject({ id: 'imported-ckpt-1' })
  })

  it('rejects when the live predicate flips before the read completes (training started)', async () => {
    let ok = true
    const promise = readCheckpointFile(blob, () => ok, new AbortController().signal)
    const reader = MockFileReader.instances[0]
    ok = false
    reader.result = validJson()
    reader.onload!()
    await expect(promise).rejects.toEqual(abortError)
  })

  it('rejects invalid JSON without masking it as an abort', async () => {
    const promise = readCheckpointFile(blob, () => true, new AbortController().signal)
    const reader = MockFileReader.instances[0]
    reader.result = 'not-json'
    reader.onload!()
    await expect(promise).rejects.toThrow('Invalid JSON')
  })

  it('aborts the in-flight reader when the signal fires and detaches handlers', async () => {
    const controller = new AbortController()
    const promise = readCheckpointFile(blob, () => true, controller.signal)
    const reader = MockFileReader.instances[0]
    controller.abort()
    expect(reader.abort).toHaveBeenCalled()
    await expect(promise).rejects.toEqual(abortError)
    expect(reader.onload).toBeNull()
    expect(reader.onerror).toBeNull()
    expect(reader.onabort).toBeNull()
  })

  it('a stale captured onload cannot resolve after cancellation', async () => {
    const controller = new AbortController()
    const promise = readCheckpointFile(blob, () => true, controller.signal)
    const reader = MockFileReader.instances[0]
    const staleOnload = reader.onload!
    controller.abort()
    reader.result = validJson()
    staleOnload()
    await expect(promise).rejects.toEqual(abortError)
  })

  it('rejects and cleans up when the live predicate throws at completion', async () => {
    let ok = true
    const promise = readCheckpointFile(blob, () => {
      if (!ok) throw new Error('predicate blew up')
      return true
    }, new AbortController().signal)
    const reader = MockFileReader.instances[0]
    ok = false
    reader.result = validJson()
    reader.onload!()
    await expect(promise).rejects.toThrow('predicate blew up')
    expect(reader.onload).toBeNull()
    expect(reader.onerror).toBeNull()
    expect(reader.onabort).toBeNull()
  })

  it('a canceled read cannot supersede a newer read', async () => {
    const first = new AbortController()
    const stale = readCheckpointFile(blob, () => true, first.signal)
    const staleReader = MockFileReader.instances[0]
    const fresh = readCheckpointFile(blob, () => true, new AbortController().signal)
    const freshReader = MockFileReader.instances[1]
    first.abort()
    staleReader.result = validJson()
    staleReader.onload?.()
    await expect(stale).rejects.toEqual(abortError)
    freshReader.result = validJson()
    freshReader.onload!()
    await expect(fresh).resolves.toMatchObject({ id: 'imported-ckpt-1' })
  })

  it('a valid import still succeeds after a training-canceled read', async () => {
    let ok = true
    const duringTraining = readCheckpointFile(blob, () => ok, new AbortController().signal)
    const firstReader = MockFileReader.instances[0]
    ok = false
    firstReader.result = validJson()
    firstReader.onload!()
    await expect(duringTraining).rejects.toEqual(abortError)
    ok = true
    const afterTraining = readCheckpointFile(blob, () => ok, new AbortController().signal)
    const secondReader = MockFileReader.instances[1]
    secondReader.result = validJson()
    secondReader.onload!()
    await expect(afterTraining).resolves.toMatchObject({ id: 'imported-ckpt-1' })
  })

  it('creates no reader when already aborted or the predicate is false', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(readCheckpointFile(blob, () => true, controller.signal)).rejects.toEqual(abortError)
    await expect(readCheckpointFile(blob, () => false, new AbortController().signal)).rejects.toEqual(abortError)
    expect(MockFileReader.instances).toHaveLength(0)
  })

  it('rejects on reader error and on a synchronous readAsText throw', async () => {
    const errorPromise = readCheckpointFile(blob, () => true, new AbortController().signal)
    const first = MockFileReader.instances[0]
    first.error = new Error('disk gone')
    first.onerror!()
    await expect(errorPromise).rejects.toThrow('disk gone')

    MockFileReader.throwOnRead = true
    try {
      await expect(readCheckpointFile(blob, () => true, new AbortController().signal)).rejects.toThrow('read denied')
    } finally {
      MockFileReader.throwOnRead = false
    }
  })

  it('ArenaScene wires the import through a live predicate and aborts it on train/unmount', () => {
    const source = readFileSync(new URL('../../components/environment/ArenaScene.tsx', import.meta.url), 'utf8')
    expect(source).toContain('readCheckpointFile(')
    expect(source).toContain('trainingBusyRef')
    expect(source).toContain('importAbortRef.current?.abort()')
    expect(source).toContain('importAbortRef.current !== controller || controller.signal.aborted')
    expect(source).toContain('session.getSnapshot()')
  })
})
