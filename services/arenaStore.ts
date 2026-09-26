import { create } from 'zustand'
import { SEASON_0_BASE_CHECKPOINT, type PolicyCheckpoint } from './policyModel'
import type { ArenaTrainingExample } from './policyTrainer'
import { saveStoredCheckpoints, saveStoredExamples } from './checkpointStorage'

/**
 * Client-side system-of-record mirror. Convex is the long-term store
 * (services/syncEngine.ts); localStorage is a write-behind cache hanging off
 * this store's subscriber — components never call saveStored* directly.
 */

export type SyncPhase = 'off' | 'booting' | 'synced' | 'offline-queued' | 'error'

export interface SyncSnapshot {
  phase: SyncPhase
  queued: number
  message: string | null
}

type Updater<T> = T | ((prev: T) => T)

interface ArenaState {
  checkpoints: PolicyCheckpoint[]
  examples: ArenaTrainingExample[]
  activeCheckpoint: PolicyCheckpoint
  hydrated: boolean
  sync: SyncSnapshot
  setCheckpoints: (next: Updater<PolicyCheckpoint[]>) => void
  setExamples: (next: Updater<ArenaTrainingExample[]>) => void
  setActiveCheckpoint: (checkpoint: PolicyCheckpoint) => void
  markHydrated: () => void
  setSync: (next: Partial<SyncSnapshot>) => void
}

export const useArenaStore = create<ArenaState>(set => ({
  checkpoints: [SEASON_0_BASE_CHECKPOINT],
  examples: [],
  activeCheckpoint: SEASON_0_BASE_CHECKPOINT,
  hydrated: false,
  sync: { phase: 'off', queued: 0, message: null },
  setCheckpoints: next =>
    set(state => ({ checkpoints: typeof next === 'function' ? (next as (p: PolicyCheckpoint[]) => PolicyCheckpoint[])(state.checkpoints) : next })),
  setExamples: next =>
    set(state => ({ examples: typeof next === 'function' ? (next as (p: ArenaTrainingExample[]) => ArenaTrainingExample[])(state.examples) : next })),
  setActiveCheckpoint: checkpoint => set({ activeCheckpoint: checkpoint }),
  markHydrated: () => set({ hydrated: true }),
  setSync: next => set(state => ({ sync: { ...state.sync, ...next } })),
}))

let cacheTimer: ReturnType<typeof setTimeout> | null = null

/** Write-behind localStorage cache: debounce record changes into storage. */
export function attachLocalCache(): () => void {
  const unsubscribe = useArenaStore.subscribe((state, prev) => {
    if (!state.hydrated) return
    if (state.checkpoints === prev.checkpoints && state.examples === prev.examples) return
    if (cacheTimer) clearTimeout(cacheTimer)
    cacheTimer = setTimeout(() => {
      const current = useArenaStore.getState()
      saveStoredCheckpoints(current.checkpoints)
      saveStoredExamples(current.examples)
    }, 200)
  })
  return () => {
    if (cacheTimer) clearTimeout(cacheTimer)
    cacheTimer = null
    unsubscribe()
  }
}
