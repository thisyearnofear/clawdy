'use client'

import { CloudOff, WifiOff } from 'lucide-react'
import { useArenaStore } from '../../services/arenaStore'

/** Coach-panel chip: the old surface swallowed sync failures into console.warn. */
export function SyncStatusChip() {
  const sync = useArenaStore(state => state.sync)
  if (sync.phase === 'off' || sync.phase === 'booting') return null
  if (sync.phase === 'error') {
    return (
      <p className="convexLineage" data-state="error" role="status">
        <CloudOff size={11} aria-hidden /> {sync.message ?? "Cloud sync hit a snag — your progress is still safe on this device."}
      </p>
    )
  }
  if (sync.phase === 'offline-queued') {
    return (
      <p className="convexLineage" data-state="queued" role="status">
        <WifiOff size={11} aria-hidden /> Offline — {sync.queued} change{sync.queued === 1 ? '' : 's'} saved here, will sync once you're back online.
      </p>
    )
  }
  return null
}
