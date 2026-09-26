'use client'

import { HelpCircle, Layers } from 'lucide-react'
import type { PolicyCheckpoint } from '../../services/policyModel'
import styles from '../environment/ArenaScene.module.css'

export function BrandHeader({
  activeCheckpoint,
  championName,
  onOpenHelp,
}: {
  activeCheckpoint: PolicyCheckpoint
  championName: string
  onOpenHelp: () => void
}) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true">C</span> CLAWDY</div>
      <div className={styles.headerActions}>
        <div className={styles.checkpointBadge}>
          <Layers size={13} />
          <span>{championName} · {activeCheckpoint.name}</span>
        </div>
        <button type="button" className={styles.helpButton} onClick={onOpenHelp} aria-label="Open help">
          <HelpCircle size={15} /> Help
        </button>
      </div>
    </header>
  )
}
