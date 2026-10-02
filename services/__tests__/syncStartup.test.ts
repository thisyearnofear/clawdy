import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConvexReactClient } from 'convex/react'
import { startArenaSync, queueMatchSync, __resetSyncEngineForTests, type PulledState } from '../syncEngine'
import { useArenaStore } from '../arenaStore'

const EMPTY_PULL: PulledState = { checkpoints: [], examples: [] }

function mockBrowser() {
  const values = new Map<string, string>()
  const listeners = new Map<string, Set<() => void>>()
  const windowMock = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    },
    addEventListener: (name: string, listener: () => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name)!.add(listener)
    },
    removeEventListener: (name: string, listener: () => void) => { listeners.get(name)?.delete(listener) },
  }
  vi.stubGlobal('window', windowMock)
  vi.stubGlobal('navigator', { onLine: true })
  return { online: () => { for (const listener of listeners.get('online') ?? []) listener() } }
}

describe('Convex startup sync remains optional for Practice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud')
    __resetSyncEngineForTests()
    useArenaStore.getState().setSync({ phase: 'off', queued: 0, message: null })
  })

  afterEach(() => {
    __resetSyncEngineForTests()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('keeps the local checkpoint and retries a failed startup pull even with an empty outbox', async () => {
    mockBrowser()
    const initialCheckpoint = useArenaStore.getState().activeCheckpoint
    const query = vi.fn().mockRejectedValueOnce(new Error('temporary outage')).mockResolvedValue(EMPTY_PULL)
    const stop = startArenaSync({ query } as unknown as ConvexReactClient)
    try {
      await vi.waitFor(() => expect(useArenaStore.getState().sync.phase).toBe('offline-queued'))
      expect(useArenaStore.getState().sync.message).toContain('Your progress is saved on this device; retrying in the background')
      expect(useArenaStore.getState().activeCheckpoint).toBe(initialCheckpoint)
      expect(query).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(15_000)
      expect(query).toHaveBeenCalledTimes(2)
      expect(useArenaStore.getState().sync).toMatchObject({ phase: 'synced', message: null })
    } finally {
      stop()
    }
  })

  it('keeps pending writes queued until a failed startup pull recovers', async () => {
    mockBrowser()
    const query = vi.fn().mockRejectedValueOnce(new Error('temporary outage')).mockResolvedValue(EMPTY_PULL)
    const mutation = vi.fn().mockResolvedValue(null)
    const stop = startArenaSync({ query, mutation } as unknown as ConvexReactClient)
    try {
      await vi.waitFor(() => expect(useArenaStore.getState().sync.phase).toBe('offline-queued'))
      queueMatchSync({
        matchId: 'sync-startup-test', scenarioId: 'practice', rulesVersion: 'test',
        scored: false, checkpointId: null, championBanked: 1, rivalBanked: 0,
        winner: 'champion', linkedExampleIds: [],
      })
      await vi.advanceTimersByTimeAsync(500)
      expect(mutation).not.toHaveBeenCalled()
      expect(useArenaStore.getState().sync.phase).toBe('offline-queued')
      await vi.advanceTimersByTimeAsync(14_500)
      expect(query).toHaveBeenCalledTimes(2)
      expect(mutation).toHaveBeenCalledTimes(1)
      expect(useArenaStore.getState().sync.phase).toBe('synced')
    } finally {
      stop()
    }
  })

  it('cancels retries and ignores a pending pull after unmount', async () => {
    mockBrowser()
    const query = vi.fn().mockRejectedValue(new Error('offline'))
    const stop = startArenaSync({ query } as unknown as ConvexReactClient)
    await vi.waitFor(() => expect(useArenaStore.getState().sync.phase).toBe('offline-queued'))
    stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('retries immediately on a browser online event and avoids duplicate requests', async () => {
    const browser = mockBrowser()
    const query = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(EMPTY_PULL)
    const stop = startArenaSync({ query } as unknown as ConvexReactClient)
    try {
      await vi.waitFor(() => expect(useArenaStore.getState().sync.phase).toBe('offline-queued'))
      browser.online()
      await vi.waitFor(() => expect(useArenaStore.getState().sync.phase).toBe('synced'))
      await vi.advanceTimersByTimeAsync(60_000)
      expect(query).toHaveBeenCalledTimes(2)
    } finally {
      stop()
    }
  })
})
