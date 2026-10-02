'use client'

import { CloudOff, WifiOff } from 'lucide-react'
import { useArenaStore } from '../../services/arenaStore'

/**
 * Sync state, in the Coach panel header.
 *
 * The old surface swallowed sync failures into console.warn, so this is
 * deliberately visible — but a cloud problem is never the player's mistake
 * and must not compete with the Approve and Train buttons beside it. `quiet`
 * collapses it to a single low-key line once there is actual work in the
 * queue; the state stays readable, it just stops shouting.
 */
export function SyncStatusChip({ quiet = false }: { quiet?: boolean }) {
  const sync = useArenaStore(state => state.sync)
  if (sync.phase === 'off' || sync.phase === 'booting') return null
  const message = sync.phase === 'error'
    ? sync.message ?? 'Cloud sync hit a snag — your progress is still safe on this device.'
    : sync.message ?? `Offline — ${sync.queued} change${sync.queued === 1 ? '' : 's'} saved here, will sync once you're back online.`
  const Icon = sync.phase === 'error' ? CloudOff : WifiOff
  return (
    <p className="convexLineage" data-state={sync.phase === 'error' ? 'error' : 'queued'} data-quiet={quiet || undefined} role="status">
      <Icon size={11} aria-hidden /> {quiet ? message.split('—')[0].split('.')[0].trim() : message}
    </p>
  )
}