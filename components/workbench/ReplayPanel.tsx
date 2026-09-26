'use client'

import { AlertTriangle, CheckCircle2, Play, Sparkles } from 'lucide-react'
import { ARENA_RULES, type ArenaAction, type ArenaObservation } from '../../services/arenaEpisode'
import type { CoachingCandidate } from '../../services/coachingCandidates'
import styles from '../environment/ArenaScene.module.css'
import { actionLabel } from './readouts'

export interface ReplayFrameAdvice {
  taken: ArenaAction
  atTick: number
  observation: ArenaObservation
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
  currentMistake,
  frameAdvice,
  onSeek,
  onToggleCinematic,
  onCoachThisMoment,
  onQueueMistake,
  onQueueCandidate,
}: {
  tick: number
  replayIndex: number
  replayLength: number
  championNodeId: string
  championCargo: number
  flooded: boolean
  cinematic: boolean
  coachingLocked: boolean
  currentMistake: { recorded: ArenaAction; suggested: ArenaAction } | null
  frameAdvice: ReplayFrameAdvice | null
  onSeek: (frame: number) => void
  onToggleCinematic: () => void
  onCoachThisMoment: () => void
  onQueueMistake: () => void
  onQueueCandidate: (candidate: CoachingCandidate) => void
}) {
  const seconds = (tick * ARENA_RULES.stepMs / 1000).toFixed(1)
  return (
    <section className={styles.replay} aria-label="Recorded run review">
      <div>
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
      <div className={styles.replayCoachBar}>
        <span>
          Frame status: Station <strong>{championNodeId}</strong> · Cargo: <strong>{championCargo}</strong> · Weather: <strong>{flooded ? 'Submerged (Flooded)' : 'Clear'}</strong>
        </span>
        <div className={styles.replayButtons}>
          <button
            className={styles.frameCoachButton}
            onClick={onCoachThisMoment}
            disabled={coachingLocked}
            title={coachingLocked ? 'Coaching is off during a scored match' : 'Propose a fix for this moment'}
          >
            <Sparkles size={13} />
            Coach this moment
          </button>
        </div>
      </div>
      {currentMistake && (
        <div className={styles.mistakeBanner} role="status">
          <div>
            <AlertTriangle size={14} />
            <strong>Looks off at {seconds}s</strong>
            <span>It chose <em>{actionLabel(currentMistake.recorded)}</em>; the careful collector would <em>{actionLabel(currentMistake.suggested)}</em>.</span>
          </div>
          <button
            className={styles.mistakeCoachButton}
            onClick={onQueueMistake}
            disabled={coachingLocked}
            title={coachingLocked ? 'Coaching is off during a scored match' : 'Add this fix to the coaching queue'}
          >
            Queue this fix
          </button>
        </div>
      )}
      {!currentMistake && (
        <div className={styles.frameOk} role="status">
          <CheckCircle2 size={14} />
          <span>This choice matches the careful collector.</span>
        </div>
      )}
      {frameAdvice && (
        <div className={styles.candidateBanner} role="status">
          <div>
            <Sparkles size={14} />
            <strong>Measured alternatives</strong>
            <span>Rolling this frame forward found actions that out-score {actionLabel(frameAdvice.taken)} on the route model.</span>
          </div>
          <ul className={styles.candidateList}>
            {frameAdvice.candidates.map(candidate => (
              <li key={JSON.stringify(candidate.action)}>
                <span>{actionLabel(candidate.action)} — {candidate.rationale}</span>
                <button
                  className={styles.mistakeCoachButton}
                  onClick={() => onQueueCandidate(candidate)}
                  title='Queue this measured fix — it trains only after you approve it'
                >
                  Queue this fix
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
