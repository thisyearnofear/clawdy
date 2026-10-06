'use client'

import { Compass, X } from 'lucide-react'
import type { LiveCallContext } from '../../services/liveCall'
import styles from '../environment/ArenaScene.module.css'
import { friendlyActionLabel } from './readouts'

/**
 * The mid-race coaching verb. Appears once per Practice run at a decision tick
 * and offers the legal alternative routes; picking one records a human-approved
 * training note. It deliberately does not steer the rover — the champion keeps
 * driving its own policy, and the lesson only lands after the next Train.
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
        It&rsquo;s driving <em>{friendlyActionLabel(context.plannedAction!)}</em>. Pick a different route to teach it — this note trains after the run, and it won&rsquo;t steer this race.
      </p>
      <div className={styles.liveCallOptions}>
        {context.routeOptions.map(option => (
          <button
            key={option.edgeId}
            type="button"
            className={styles.liveCallOption}
            onClick={() => onCall(option.edgeId)}
          >
            <span>{option.label}</span>
            <small>{option.travelTicks}t</small>
          </button>
        ))}
      </div>
    </div>
  )
}