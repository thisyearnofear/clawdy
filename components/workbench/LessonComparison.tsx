'use client'

import { GitCompareArrows, Play } from 'lucide-react'
import { describeBehaviourChange, summarizeBehaviourChange } from '../../services/behaviourDelta'
import type { PracticeComparison } from '../../services/practiceComparison'
import styles from '../environment/ArenaScene.module.css'
import { friendlyActionLabel, routeLabel } from './readouts'

export function LessonComparison({
  comparison,
  reviewing,
  onWatch,
  onJumpToDivergence,
}: {
  comparison: PracticeComparison
  reviewing: 'baseline' | 'trained' | null
  onWatch: (which: 'baseline' | 'trained') => void
  onJumpToDivergence: () => void
}) {
  const delta = comparison.bankedDelta
  const divergence = comparison.firstDivergence
  // The learning itself, not just the score: how many decisions actually moved,
  // and which route swaps account for it.
  const behaviour = summarizeBehaviourChange(comparison.baseline.decisions, comparison.trained.decisions)
  const routeSwaps: { tick: number; from: string; to: string }[] = []
  for (const decision of comparison.baseline.decisions) {
    if (!decision.accepted || decision.action.type !== 'move') continue
    const other = comparison.trained.decisions.find(candidate => candidate.tick === decision.tick)
    if (!other?.accepted || other.action.type !== 'move' || other.action.edgeId === decision.action.edgeId) continue
    routeSwaps.push({
      tick: decision.tick,
      from: routeLabel(decision.action.edgeId),
      to: routeLabel(other.action.edgeId),
    })
    if (routeSwaps.length >= 6) break
  }
  return (
    <section className={styles.lessonCard} aria-label="Practice comparison" role="status">
      <div className={styles.trainingResultHeader}>
        <GitCompareArrows size={14} />
        <strong>Lesson comparison · {comparison.scenarioId}</strong>
      </div>
      <p className={styles.behaviourLine}>
        <strong>What your brain changed</strong>
        {describeBehaviourChange(behaviour)}
      </p>
      <div className={styles.trainingResultGrid}>
        <div>
          <span>Parent</span>
          <strong>{comparison.baseline.banked}</strong>
          <small>{comparison.baseline.checkpointName} · banked</small>
        </div>
        <div>
          <span>Trained</span>
          <strong>{comparison.trained.banked}</strong>
          <small>{comparison.trained.checkpointName} · banked</small>
        </div>
        <div>
          <span>Score change</span>
          <strong className={delta > 0 ? styles.improvementPositive : ''}>
            {delta >= 0 ? '+' : ''}{delta}
          </strong>
          <small>banked on this practice run</small>
        </div>
      </div>
      <p className={styles.correctionNote}>
        Matched physical practice, not held-out or ranked. Rival banked {comparison.baseline.rivalBanked} vs {comparison.trained.rivalBanked}; winner: {comparison.trained.winner ?? 'draw'}.
      </p>
      {delta < 0 && (
        <p className={styles.correctionNote}>
          <strong>A dip here is normal</strong> — one correction can regress before it clicks. Approve a few more examples, or try a different fix, before judging this brain.
        </p>
      )}
      {divergence ? (
        <p className={styles.correctionNote}>
          First different accepted decision at tick {divergence.tick}: parent chose <em>{friendlyActionLabel(divergence.parentAction)}</em>, trained chose <em>{friendlyActionLabel(divergence.childAction)}</em>.
          <button type="button" className={styles.actionButtonSmall} onClick={onJumpToDivergence}>
            Jump to first different decision
          </button>
        </p>
      ) : (
        <p className={styles.correctionNote}>No different accepted decisions on this practice run.</p>
      )}
      {routeSwaps.length > 0 && (
        <details className={styles.referenceDetails}>
          <summary>Route changes ({routeSwaps.length}{comparison.baseline.decisions.length > routeSwaps.length ? '+' : ''})</summary>
          <ul className={styles.routeSwapList}>
            {routeSwaps.map(swap => (
              <li key={swap.tick}>
                <span className={styles.routeSwapTick}>t{swap.tick}</span>
                <span className={styles.routeSwapFrom}>{swap.from}</span>
                <span aria-hidden="true">→</span>
                <span className={styles.routeSwapTo}>{swap.to}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className={styles.replayButtons}>
        <button type="button" className={styles.frameCoachButton} onClick={() => onWatch('trained')} aria-pressed={reviewing === 'trained'}>
          <Play size={13} /> Watch the lesson
        </button>
        <button type="button" className={styles.frameCoachButton} onClick={() => onWatch('baseline')} aria-pressed={reviewing === 'baseline'}>
          <Play size={13} /> Parent replay
        </button>
      </div>
      <details className={styles.referenceDetails}>
        <summary>Run metadata</summary>
        <p className={styles.correctionNote}>
          World {comparison.worldVersion} · Controller {comparison.controllerVersion} · Rival {typeof comparison.rival === 'string' ? comparison.rival : 'learned'}
        </p>
        <p className={styles.correctionNote}>
          Parent weights <code>{comparison.baseline.weightsHash.slice(0, 18)}</code> · Trained weights <code>{comparison.trained.weightsHash.slice(0, 18)}</code>
        </p>
        <p className={styles.correctionNote}>
          Recoveries {comparison.baseline.recoveries} → {comparison.trained.recoveries}
        </p>
      </details>
    </section>
  )
}
