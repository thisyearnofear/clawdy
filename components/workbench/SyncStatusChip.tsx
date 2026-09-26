'use client'

import { useArenaStore } from '../../services/arenaStore'

/** Coach-panel chip: the old surface swallowed sync failures into console.warn. */
export function SyncStatusChip() {
  const sync = useArenaStore(state => state.sync)
  if (sync.phase === 'off' || sync.phase === 'booting') return null
  if (sync.phase === 'error') {
    return (
      <p className="convexLineage" data-state="error" role="status">
        sync · {sync.message ?? 'error'}
      </p>
    )
  }
  if (sync.phase === 'offline-queued') {
    return (
      <p className="convexLineage" data-state="queued" role="status">
        offline · {sync.queued} queued
      </p>
    )
  }
  return null
}
