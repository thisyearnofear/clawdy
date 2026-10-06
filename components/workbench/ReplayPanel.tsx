'use client'

import { Play } from 'lucide-react'
import { ARENA_RULES, type ArenaAction } from '../../services/arenaEpisode'
import type { CoachingCandidate } from '../../services/coachingCandidates'
import type { RecordedCoachContext } from '../../services/coachingReview'
import type { StoryMoment } from '../../services/replayStory'
import styles from '../environment/ArenaScene.module.css'
import { actionLabel, friendlyActionLabel, routeLabel } from './readouts'

export interface ReplayFrameAdvice {
  taken: ArenaAction
  atTick: number
  observation: unknown
  candidates: CoachingCandidate[]
}

export function ReplayPanel({
  tick,
  replayIndex,
  replayLength,
  championNodeId,
  championCargo,
  flooded,
  cinematic,
  coachingLocked,
  coachContext,
  selectedAction,
  frameAdvice,
  moments,
  captionNow,
  onSeek,
  onToggleCinematic,
  onSelectAction,
  onQueueCorrection,
}: {
  tick: number
  replayIndex: number
  replayLength: number
  championNodeId: string
  championCargo: number
  flooded: boolean
  cinematic: boolean
  coachingLocked: boolean
  coachContext: RecordedCoachContext | null
  selectedAction: ArenaAction | null
  frameAdvice: ReplayFrameAdvice | null
  /** What decided the run, in plain language; each one jumps the scrubber. */
  moments?: StoryMoment[]
  /** The moment that just happened at the current frame, if any. */
  captionNow?: StoryMoment | null
  onSeek: (frame: number) => void
  onToggleCinematic: () => void
  onSelectAction: (action: ArenaAction) => void
  onQueueCorrection: () => void
}) {
  const seconds = (tick * ARENA_RULES.stepMs / 1000).toFixed(1)
  const drainSelected = selectedAction?.type === 'drain'
  return (
    <section className={styles.replayPanel} aria-label="Recorded run review">
      <div className={styles.replayHead}>
        <strong>Replay · {seconds}s</strong>
        <span>Frame {replayIndex + 1} / {replayLength}</span>
        <button
          type="button"
          className={styles.frameCoachButton}
          aria-pressed={cinematic}
          onClick={onToggleCinematic}
          title="Play the recording back as an event-driven camera reel"
        >
          <Play size={13} />
          {cinematic ? 'Stop cinematic' : 'Play cinematic'}
        </button>
      </div>
      <input
        aria-label="Replay frame"
        type="range"
        min={0}
        max={Math.max(0, replayLength - 1)}
        value={replayIndex}
        onChange={event => { onSeek(Number(event.target.value)) }}
      />
      <p className={styles.replayStatus}>
        Station <strong>{championNodeId}</strong> · Cargo: <strong>{championCargo}</strong> · Weather: <strong>{flooded ? 'Flooded' : 'Clear'}</strong>
      </p>
      {captionNow && (
        <p className={`${styles.replayCaption} ${styles[`caption_${captionNow.tone}`]}`} role="status" aria-live="polite">
          {captionNow.text}
        </p>
      )}
      {moments && moments.length > 0 && (
        <details className={styles.momentsBox} open>
          <summary>What happened ({moments.length})</summary>
          <ol className={styles.momentList}>
            {moments.map(moment => (
              <li key={`${moment.tick}-${moment.kind}-${moment.text}`}>
                <button
                  type="button"
                  className={`${styles.momentButton} ${styles[`caption_${moment.tone}`]}`}
                  aria-current={moment.frame === replayIndex ? 'true' : undefined}
                  onClick={() => onSeek(moment.frame)}
                >
                  <span className={styles.momentTime}>{(moment.tick * ARENA_RULES.stepMs / 1000).toFixed(1)}s</span>
                  {moment.text}
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
      {coachContext ? (
        <div className={styles.correctionBox}>
          <p className={styles.correctionSituation}>
            Decision at tick {coachContext.tick} — it chose <em>{friendlyActionLabel(coachContext.originalAction)}</em>
          </p>
          {coachContext.alternatives.length === 0 ? (
            <p className={styles.correctionNote}>No teachable alternative here — the shared controller would make the same call.</p>
          ) : (
            <>
              <div className={styles.alternativeRow} role="group" aria-label="Supported alternative actions">
                {(() => {
                  // Two edges in the same terrain family (e.g. two valley routes) share
                  // routeLabel's generic name — count collisions so we can disambiguate
                  // the visible button text, not just its hover title.
                  const labelCounts = new Map<string, number>()
                  for (const alt of coachContext.alternatives) {
                    const label = alt.type === 'move' ? routeLabel(alt.edgeId) : friendlyActionLabel(alt)
                    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1)
                  }
                  return coachContext.alternatives.map(action => {
                    const label = action.type === 'move' ? routeLabel(action.edgeId) : friendlyActionLabel(action)
                    const ambiguous = action.type === 'move' && (labelCounts.get(label) ?? 0) > 1
                    const suffix = ambiguous ? ` (${action.edgeId.split('-').pop()})` : ''
                    return (
                      <button
                        key={JSON.stringify(action)}
                        type="button"
                        className={styles.alternativeButton}
                        aria-pressed={selectedAction ? JSON.stringify(selectedAction) === JSON.stringify(action) : false}
                        disabled={coachingLocked}
                        title={`${actionLabel(action)}${action.type === 'drain' ? ` — costs ${ARENA_RULES.drainCost} energy` : ''}`}
                        onClick={() => onSelectAction(action)}
                      >
                        Prefer {label}{suffix}
                      </button>
                    )
                  })
                })()}
              </div>
              {drainSelected && (
                <p className={styles.correctionNote}>
                  Drain costs {ARENA_RULES.drainCost} energy and clears the valley for both rovers. Waiting or taking another road may be better.
                </p>
              )}
              {selectedAction && (
                <div className={styles.correctionPreview} role="status">
                  <span>Tick {coachContext.tick} · It chose <em>{friendlyActionLabel(coachContext.originalAction)}</em> · You prefer <em>{friendlyActionLabel(selectedAction)}</em></span>
                  <button
                    type="button"
                    className={styles.mistakeCoachButton}
                    disabled={coachingLocked}
                    onClick={onQueueCorrection}
                  >
                    Draft correction
                  </button>
                </div>
              )}
              <p className={styles.correctionNote}>Drafts train only after you approve them in Coach.</p>
            </>
          )}
        </div>
      ) : (
        <p className={styles.correctionNote}>
          {coachingLocked
            ? 'Coaching is off during a scored match.'
            : 'Choose a different supported action to teach this moment — scrub to a decision frame first.'}
        </p>
      )}
      {frameAdvice && (
        <details className={styles.referenceDetails}>
          <summary>Reference &amp; route-model estimates</summary>
          <ul className={styles.candidateList}>
            {frameAdvice.candidates.map(candidate => (
              <li key={JSON.stringify(candidate.action)}>
                <span>{friendlyActionLabel(candidate.action)} — {candidate.rationale}</span>
              </li>
            ))}
          </ul>
          <p className={styles.correctionNote}>Route-model estimates on this physical course; not a promise of outcome.</p>
        </details>
      )}
    </section>
  )
}
