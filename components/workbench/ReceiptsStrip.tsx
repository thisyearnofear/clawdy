'use client'

import type { WorldReceipt } from './WorldForgePanel'
import styles from './WorldForgePanel.module.css'

/**
 * Track I — rigor as receipts, not caveats.
 *
 * One persistent line over the world's bottom edge. Every segment is a fact
 * this session produced or the generator certified — never a promise:
 *
 *   world generated "Flooded Salt Flat" · 19/19 stations grounded ·
 *   18/18 routes cleared · 2 brains trained · +4 banked vs parent · Prove: 9
 *
 * The strip only grows: a segment appears when the evidence exists and is
 * never replaced by marketing copy.
 */
export interface ReceiptsStripProps {
  world: WorldReceipt
  /** Owned, non-bundled trained checkpoints. */
  brainsTrained: number
  /** Approved examples waiting in the queue (shown until trained). */
  approvedLessons: number
  /** Practice comparison delta (trained − parent banked), when it ran. */
  practiceDelta: number | null
  /** Champion banked on the last finished Prove board, when finished. */
  proveBanked: number | null
}

export function ReceiptsStrip({ world, brainsTrained, approvedLessons, practiceDelta, proveBanked }: ReceiptsStripProps) {
  const segments: { key: string; good?: boolean; text: string }[] = []

  if (world.kind === 'generated') {
    segments.push({ key: 'world', text: `world generated “${world.name}”` })
    const cert = world.certificate
    if (cert) {
      const grounded = cert.stationsGrounded
      const routes = cert.routesCleared
      segments.push({
        key: 'grounded',
        good: grounded.ok === grounded.total,
        text: `${grounded.ok}/${grounded.total} stations grounded`,
      })
      segments.push({
        key: 'routes',
        good: routes.ok === routes.total,
        text: `${routes.ok}/${routes.total} routes cleared`,
      })
      if (cert.repairsApplied > 0) {
        // `repairsApplied` counts refused points handed to the ladder, not
        // flattened discs — two close points grade as one patch of ground.
        segments.push({ key: 'repairs', text: `${cert.repairsApplied} ground point${cert.repairsApplied === 1 ? '' : 's'} repaired` })
      }
    }
  } else {
    segments.push({ key: 'world', text: `authored world · ${world.name}` })
  }

  if (brainsTrained > 0) {
    segments.push({ key: 'brains', text: `${brainsTrained} brain${brainsTrained === 1 ? '' : 's'} trained` })
  } else if (approvedLessons > 0) {
    segments.push({ key: 'lessons', text: `${approvedLessons} lesson${approvedLessons === 1 ? '' : 's'} approved` })
  }

  if (practiceDelta !== null) {
    segments.push({
      key: 'delta',
      good: practiceDelta >= 0,
      text: `${practiceDelta >= 0 ? '+' : ''}${practiceDelta} banked vs parent`,
    })
  }

  if (proveBanked !== null) {
    segments.push({ key: 'prove', text: `Prove: ${proveBanked} banked` })
  }

  return (
    <p className={styles.receipts} role="status" aria-label="Session receipts">
      {segments.map(segment => (
        <span key={segment.key} data-good={segment.good === undefined ? undefined : segment.good}>
          {segment.text}
        </span>
      ))}
    </p>
  )
}
