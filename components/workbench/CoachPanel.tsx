'use client'

import type React from 'react'
import { AlertTriangle, BarChart3, CheckCircle2, Download, Sparkles, Upload, XCircle } from 'lucide-react'
import { COACHING_RULES, SPECIALIZATION_CHIPS } from '../../services/coachingEngine'
import { isEvaluationScenario } from '../../services/arenaScenarios'
import type { ArenaTrainingExample, EvaluationResult } from '../../services/policyTrainer'
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
  trainResult,
  courseName,
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
  trainResult: { baseline: EvaluationResult; trained: EvaluationResult } | null
  courseName: string
}) {
  return (
    <section className={styles.coachingSection} aria-label="Coach your champion">
      <div className={styles.coachingHeader}>
        <div>
          <h2>Coach</h2>
          <p>Pick a focus, approve fixes, then train. Style must stay on “Your trained brain” to use the new weights.</p>
          <ConvexLineageBadge />
          <SyncStatusChip />
          {trainFocusLine && <p className={styles.focusLine}>{trainFocusLine}</p>}
        </div>
        <div className={styles.checkpointMeta}>
          <label>
            Active brain:
            <select
              className={styles.checkpointSelect}
              value={activeCheckpoint.id}
              disabled={phase === 'running'}
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
              disabled={phase === 'running'}
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
      </div>

      {coachingLocked && (
        <div className={styles.evaluationNotice} role="alert">
          <AlertTriangle size={14} />
          <strong>Scored match</strong>
          <span>Coaching and training stay off. Switch to Practice to teach it.</span>
        </div>
      )}

      <div className={styles.coachingGrid}>
        <div className={styles.coachingCol}>
          <h3>Specialize</h3>
          <p className={styles.specializeHint}>Limited time — pick what this brain should get good at.</p>
          <div className={styles.specializeRow}>
            {SPECIALIZATION_CHIPS.map(chip => (
              <button
                key={chip.id}
                type="button"
                className={styles.specializeChip}
                onClick={() => onPropose(chip.prompt)}
                disabled={phase === 'running' || coachingLocked}
                title={chip.blurb}
              >
                <strong>{chip.label}</strong>
                <span>{chip.blurb}</span>
              </button>
            ))}
          </div>
          <h3>Suggest a fix</h3>
          <div className={styles.rulesGrid}>
            {COACHING_RULES.map(rule => (
              <button
                key={rule.id}
                className={styles.ruleButton}
                onClick={() => onPropose(rule.description)}
                disabled={phase === 'running' || coachingLocked}
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
              placeholder={coachingLocked ? 'Coaching is off in a scored match' : 'Or type a note, e.g. take the ridge when it floods'}
              value={promptText}
              disabled={phase === 'running' || coachingLocked}
              onChange={e => onPromptTextChange(e.target.value)}
            />
            <button className={styles.secondaryButton} type="submit" disabled={!promptText.trim() || phase === 'running' || coachingLocked}>
              Propose
            </button>
          </form>
        </div>

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
                No coaching examples yet. Select a rule or enter feedback on the left.
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
                        disabled={isEval}
                        title={isEval ? 'Held-out scenario: cannot approve for training' : ex.approved ? 'Approved for training' : 'Click to approve'}
                      >
                        {ex.approved ? <CheckCircle2 size={13} /> : 'Approve'}
                      </button>
                      <button
                        className={styles.rejectButton}
                        onClick={() => onRemoveExample(ex.id)}
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
      </div>

      {trainMessage && (
        <div className={styles.trainingStatusCard} role="status">
          <span>{trainMessage}</span>
        </div>
      )}

      {trainResult && (
        <div className={styles.trainingResultCard} role="status" aria-label="Training evaluation comparison">
          <div className={styles.trainingResultHeader}>
            <BarChart3 size={14} />
            <strong>Checkpoint evaluation on {courseName}</strong>
          </div>
          <div className={styles.trainingResultGrid}>
            <div>
              <span>Base checkpoint</span>
              <strong>{trainResult.baseline.totalBanked}</strong>
              <small>banked · {trainResult.baseline.wins}W {trainResult.baseline.losses}L {trainResult.baseline.draws}D</small>
            </div>
            <div>
              <span>Trained checkpoint</span>
              <strong>{trainResult.trained.totalBanked}</strong>
              <small>banked · {trainResult.trained.wins}W {trainResult.trained.losses}L {trainResult.trained.draws}D</small>
            </div>
            <div>
              <span>Improvement</span>
              <strong className={trainResult.trained.totalBanked > trainResult.baseline.totalBanked ? styles.improvementPositive : ''}>
                {trainResult.trained.totalBanked - trainResult.baseline.totalBanked >= 0 ? '+' : ''}{trainResult.trained.totalBanked - trainResult.baseline.totalBanked}
              </strong>
              <small>resources banked</small>
            </div>
          </div>
          <p className={styles.trainingResultNote}>Practice-course score against the house rival. Not a ranked result.</p>
        </div>
      )}
    </section>
  )
}
