import { beforeEach, describe, expect, it } from 'vitest'
import {
  CHECKPOINT_STORAGE_KEY,
  exportCheckpointJson,
  importCheckpointJson,
  loadStoredCheckpoints,
  loadStoredExamples,
  saveStoredCheckpoints,
  saveStoredExamples,
} from '../checkpointStorage'
import { SEASON_0_BASE_CHECKPOINT } from '../policyModel'
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

  it('loads base checkpoint when storage is empty or invalid', () => {
    expect(loadStoredCheckpoints()).toEqual([SEASON_0_BASE_CHECKPOINT])

    localStorage.setItem(CHECKPOINT_STORAGE_KEY, 'not-json')
    expect(loadStoredCheckpoints()).toEqual([SEASON_0_BASE_CHECKPOINT])

    localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify([{ invalid: true }]))
    expect(loadStoredCheckpoints()).toEqual([SEASON_0_BASE_CHECKPOINT])
  })

  it('saves and loads valid checkpoints and preserves base checkpoint', () => {
    const customCheckpoint = {
      ...SEASON_0_BASE_CHECKPOINT,
      id: 'custom-ckpt-1',
      name: 'Custom Trained Champion',
    }

    saveStoredCheckpoints([customCheckpoint])
    const loaded = loadStoredCheckpoints()
    expect(loaded.length).toBe(2)
    expect(loaded[0].id).toBe('custom-ckpt-1')
    expect(loaded[1].id).toBe(SEASON_0_BASE_CHECKPOINT.id)
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
            transit: null, energy: 3, cargo: 0, banked: 0, cooldownUntilTick: 0, lastOutcome: null,
            grounded: true, blockedTicks: 0, blockedEdges: [], recoveries: 0,
          },
          rivals: [],
          nodes: [],
          edges: [],
          resources: [],
          weather: { flooded: false, drainedUntilTick: 0 },
          availableActions: [{ type: 'wait' }],
        },
        originalAction: { type: 'wait' },
        preferredAction: { type: 'wait' },
        rationale: 'Avoid water',
        approved: true,
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
