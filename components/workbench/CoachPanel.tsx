'use client'

import type React from 'react'
import { AlertTriangle, CheckCircle2, Download, Sparkles, Upload, XCircle } from 'lucide-react'
import { COACHING_RULES, SPECIALIZATION_CHIPS } from '../../services/coachingEngine'
import { isEvaluationScenario } from '../../services/arenaScenarios'
import type { ArenaTrainingExample } from '../../services/policyTrainer'
import type { PolicyCheckpoint } from '../../services/policyModel'
import { ConvexLineageBadge } from '../ConvexClientProvider'
import styles from '../environment/ArenaScene.module.css'
import { SyncStatusChip } from './SyncStatusChip'
import { isExecutableCheckpoint } from './readouts'

export function CoachPanel({
  activeCheckpoint,
  checkpoints,
  phase,
  coachingLocked,
  trainFocusLine,
  onSelectCheckpoint,
  onExportCheckpoint,
  onImportClick,
  onFileChange,
  fileInputRef,
  onPropose,
  promptText,
  onPromptTextChange,
  approvedCount,
  isTraining,
  onTrain,
  examples,
  onToggleApprove,
  onRemoveExample,
  trainMessage,
}: {
  activeCheckpoint: PolicyCheckpoint
  checkpoints: PolicyCheckpoint[]
  phase: string
  coachingLocked: boolean
  trainFocusLine: string | null
  onSelectCheckpoint: (id: string) => void
  onExportCheckpoint: () => void
  onImportClick: () => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onPropose: (text: string) => void
  promptText: string
  onPromptTextChange: (text: string) => void
  approvedCount: number
  isTraining: boolean
  onTrain: () => void
  examples: ArenaTrainingExample[]
  onToggleApprove: (id: string) => void
  onRemoveExample: (id: string) => void
  trainMessage: string | null
}) {
  const busy = isTraining || phase === 'running'
  const teachableChips = SPECIALIZATION_CHIPS.filter(chip => chip.id !== 'bank-cargo' && chip.id !== 'grab-cores')
  const teachableRules = COACHING_RULES.filter(rule => rule.id !== 'bank-at-capacity' && rule.id !== 'quick-collect')
  return (
    <section className={styles.coachPanel} aria-label="Coach your champion">
      <div className={styles.coachingHeader}>
        <div>
          <h2>Coach</h2>
          <p>Choose an alternative road or wait/drain action in Replay. Approve the draft here, then train.</p>
          {trainFocusLine && <p className={styles.focusLine}>{trainFocusLine}</p>}
        </div>
      </div>

      {coachingLocked && (
        <div className={styles.evaluationNotice} role="alert">
          <AlertTriangle size={14} />
          <strong>Scored match</strong>
          <span>Coaching and training stay off. Switch to Practice to teach it.</span>
        </div>
      )}

      <div className={styles.coachingCol}>
        <div className={styles.queueHeader}>
          <h3>Approve ({approvedCount})</h3>
          <button
            className={styles.primaryButton}
            disabled={approvedCount === 0 || isTraining || phase === 'running' || coachingLocked}
            onClick={onTrain}
          >
            <Sparkles size={13} />
            {isTraining ? 'Training…' : `Train (${approvedCount})`}
          </button>
        </div>

        <div className={styles.examplesList}>
          {examples.length === 0 ? (
            <div className={styles.exampleEmpty}>
              No coaching examples yet. Draft a correction in Replay, or use the guidance below.
            </div>
          ) : (
            examples.map(ex => {
              const isEval = isEvaluationScenario(ex.sourceEpisodeId)
              return (
                <div key={ex.id} className={styles.exampleCard} data-approved={ex.approved} data-evaluation={isEval}>
                  <div className={styles.exampleDetails}>
                    <strong>{ex.preferredAction.type}{('edgeId' in ex.preferredAction) ? ` · ${(ex.preferredAction as { edgeId: string }).edgeId}` : ''}{isEval && <span className={styles.evaluationTag}>Match</span>}</strong>
                    <p>{ex.rationale}</p>
                  </div>
                  <div className={styles.exampleActions}>
                    <button
                      className={ex.approved ? styles.approveButton : styles.rejectButton}
                      onClick={() => onToggleApprove(ex.id)}
                      disabled={isEval || busy || coachingLocked}
                      aria-label={isEval ? 'Held-out scenario: cannot approve for training' : ex.approved ? `Unapprove correction at tick ${ex.tick}` : `Approve correction at tick ${ex.tick}`}
                      title={isEval ? 'Held-out scenario: cannot approve for training' : ex.approved ? 'Approved for training' : 'Click to approve'}
                    >
                      {ex.approved ? <CheckCircle2 size={13} /> : 'Approve'}
                    </button>
                    <button
                      className={styles.rejectButton}
                      onClick={() => onRemoveExample(ex.id)}
                      disabled={busy || coachingLocked}
                      aria-label={`Remove example at tick ${ex.tick}`}
                      title="Remove example"
                    >
                      <XCircle size={13} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {trainMessage && (
        <div className={styles.trainingStatusCard} role="status">
          <span>{trainMessage}</span>
        </div>
      )}

      <details className={styles.guidanceDetails}>
        <summary>Keyword guidance (limited parser)</summary>
        <div className={styles.coachingCol}>
          <p className={styles.specializeHint}>Pickup and full-cargo return are shared controller rules — they are not taught here. Coaching changes route preferences, target choices and supported interventions.</p>
          <h3>Specialize</h3>
          <div className={styles.specializeRow}>
            {teachableChips.map(chip => (
              <button
                key={chip.id}
                type="button"
                className={styles.specializeChip}
                onClick={() => onPropose(chip.prompt)}
                disabled={busy || coachingLocked}
                title={chip.blurb}
              >
                <strong>{chip.label}</strong>
                <span>{chip.blurb}</span>
              </button>
            ))}
          </div>
          <h3>Suggest a fix</h3>
          <div className={styles.rulesGrid}>
            {teachableRules.map(rule => (
              <button
                key={rule.id}
                type="button"
                className={styles.ruleButton}
                onClick={() => onPropose(rule.description)}
                disabled={busy || coachingLocked}
              >
                <strong>{rule.label}</strong>
                <span>{rule.description}</span>
              </button>
            ))}
          </div>
          <form className={styles.promptForm} onSubmit={e => { e.preventDefault(); onPropose(promptText) }}>
            <input
              className={styles.promptInput}
              type="text"
              aria-label="Coaching note"
              placeholder={coachingLocked ? 'Coaching is off in a scored match' : 'Or type a note, e.g. take the ridge when it floods'}
              value={promptText}
              disabled={busy || coachingLocked}
              onChange={e => onPromptTextChange(e.target.value)}
            />
            <button className={styles.secondaryButton} type="submit" disabled={!promptText.trim() || busy || coachingLocked}>
              Propose
            </button>
          </form>
        </div>
      </details>

      <details className={styles.referenceDetails}>
        <summary>Brains, storage &amp; sync</summary>
        <div className={styles.checkpointMeta}>
          <label>
            Active brain:
            <select
              className={styles.checkpointSelect}
              value={activeCheckpoint.id}
              disabled={busy}
              onChange={e => onSelectCheckpoint(e.target.value)}
            >
              {checkpoints.map(c => <option key={c.id} value={c.id}>{isExecutableCheckpoint(c) ? c.name : `${c.name} (view-only)`}</option>)}
            </select>
          </label>
          <div className={styles.checkpointActions}>
            <button
              type="button"
              className={styles.actionButtonSmall}
              onClick={onExportCheckpoint}
              title="Download active checkpoint JSON file"
            >
              <Download size={13} /> Export JSON
            </button>
            <button
              type="button"
              className={styles.actionButtonSmall}
              onClick={onImportClick}
              disabled={busy}
              title="Import trained checkpoint JSON file"
            >
              <Upload size={13} /> Import JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />
          </div>
        </div>
        <div className={styles.checkpointActions}>
          <ConvexLineageBadge />
          <SyncStatusChip />
        </div>
      </details>
    </section>
  )
}
