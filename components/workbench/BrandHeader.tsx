'use client'

import { HelpCircle, Layers } from 'lucide-react'
import { useArenaStore } from '../../services/arenaStore'
import styles from '../environment/ArenaScene.module.css'
import { AccountChip } from './AccountChip'

export function BrandHeader({
  championName,
  onOpenHelp,
}: {
  championName: string
  onOpenHelp: () => void
}) {
  const activeCheckpoint = useArenaStore(state => state.activeCheckpoint)
  return (
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true">C</span> CLAWDY</div>
      <div className={styles.headerActions}>
        <div className={styles.checkpointBadge} title={`${championName} · ${activeCheckpoint.name}`}>
          <Layers size={13} />
          <span className={styles.checkpointBadgeText}>{championName} · {activeCheckpoint.name}</span>
        </div>
        <AccountChip />
        <button type="button" className={styles.helpButton} onClick={onOpenHelp} aria-label="Open help">
          <HelpCircle size={15} /> Help
        </button>
      </div>
    </header>
  )
}
