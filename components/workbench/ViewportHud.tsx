'use client'

import { ARENA_RULES } from '../../services/arenaEpisode'
import type { ArenaPhase } from '../../services/arenaProtocol'
import styles from '../environment/ArenaScene.module.css'

export const PHASE_LABELS: Record<ArenaPhase, string> = {
  ready: 'Ready',
  running: 'Live',
  paused: 'Paused',
  finished: 'Finished',
  review: 'Replay',
  error: 'Stopped',
}

export type HudFeedEvent = { id: number; text: string; tone: 'bank' | 'flood' | 'info' }

interface ViewportHudProps {
  phase: ArenaPhase
  isMatch: boolean
  sideHint: string
  score: { you: number; foe: number; cargo: number } | null
  clock: string
  flooded: boolean
  drained: boolean
  floodEndsIn: number | null
  nextFloodIn: number | null
  runTip: string | null
  feed: HudFeedEvent[]
  error: string | null
  onRetry: () => void
}

export function ViewportHud({ phase, isMatch, sideHint, score, clock, flooded, drained, floodEndsIn, nextFloodIn, runTip, feed, error, onRetry }: ViewportHudProps) {
  return (
    <>
      <div className={styles.worldTopline}>
        <div>
          <span className={styles.liveDot} data-active={phase === 'running'} />
          {PHASE_LABELS[phase]}{isMatch ? ' · Match' : ' · Practice'}
          {score && (
            <span className={styles.scorebug} aria-label={`Score: you ${score.you}, rival ${score.foe}`}>
              {' · '}<strong className={styles.you}>{score.you}</strong>
              <span className={styles.sep}>YOU–RIVAL</span>
              <strong className={styles.foe}>{score.foe}</strong>
              {' · '}{clock}
              {score.cargo > 0 && <span>●{score.cargo}/{ARENA_RULES.capacity}</span>}
              {flooded && floodEndsIn !== null && <span className={styles.floodWarn}>FLOOD {floodEndsIn}s</span>}
              {!flooded && drained && <span className={styles.drained}>DRAINED</span>}
              {!flooded && !drained && nextFloodIn !== null && nextFloodIn <= 30 && <span className={styles.floodWarn}>FLOOD IN {nextFloodIn}s</span>}
            </span>
          )}
        </div>
        <span>{sideHint}</span>
      </div>
      {runTip && phase === 'running' && (
        <div className={`${styles.runTip} ${styles.hintEnter}`} role="status">
          {runTip}
        </div>
      )}
      {feed.length > 0 && (
        <div className={styles.eventFeed} aria-live="polite">
          {feed.map(event => <span key={event.id} data-tone={event.tone}>{event.text}</span>)}
        </div>
      )}
      {error && <div className={styles.worldNotice} role="alert"><strong>Run stopped</strong><p>{error}</p><button onClick={onRetry}>Retry world loading</button></div>}
    </>
  )
}
