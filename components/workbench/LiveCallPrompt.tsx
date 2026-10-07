'use client'

import { Compass, X } from 'lucide-react'
import type { LiveCallContext } from '../../services/liveCall'
import styles from '../environment/ArenaScene.module.css'
import { friendlyActionLabel, routeLabel } from './readouts'

/**
 * The mid-race coaching verb. Appears once per unranked run at a decision tick
 * and offers the legal alternative routes. Picking one diverts the rover toward
 * that destination for the rest of this race and records a human-approved
 * training note for Train.
 */
export function LiveCallPrompt({
  context,
  onCall,
  onDismiss,
}: {
  context: LiveCallContext
  onCall: (edgeId: string) => void
  onDismiss: () => void
}) {
  return (
    <div className={`${styles.liveCall} ${styles.hintEnter}`} role="group" aria-label="Call the next route">
      <div className={styles.liveCallHead}>
        <Compass size={13} />
        <strong>Call the next route</strong>
        <button type="button" className={styles.liveCallDismiss} onClick={onDismiss} aria-label="Dismiss route call">
          <X size={12} />
        </button>
      </div>
      <p className={styles.liveCallHint}>
        It&rsquo;s driving <em>{friendlyActionLabel(context.plannedAction!)}</em>. Pick a different route — it heads that way for the rest of this race, and the note trains after.
      </p>
      <div className={styles.liveCallOptions}>
        {context.routeOptions.map(option => (
          <button
            key={option.edgeId}
            type="button"
            className={styles.liveCallOption}
            onClick={() => onCall(option.edgeId)}
          >
            <span>{routeLabel(option.edgeId)}</span>
            <small>{option.travelTicks}t</small>
          </button>
        ))}
      </div>
    </div>
  )
}
