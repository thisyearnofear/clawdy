'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Download, Eye, Layers, Pause, Play, RotateCcw, Sparkles, Upload, XCircle } from 'lucide-react'
import { ARENA_RULES, type ArenaAction, type ArenaAgentState, type ArenaObservation } from '../../services/arenaEpisode'
import { loadArenaCourse, type ArenaCourse } from '../../services/arenaCourse'
import { isEvaluationScenario, rejectEvaluationExamples } from '../../services/arenaScenarios'
import { ArenaSession } from '../../services/arenaSession'
import { collectorPolicy, type CollectorStrategy } from '../../services/arenaPolicy'
import {
  type PolicyCheckpoint,
  SEASON_0_BASE_CHECKPOINT,
} from '../../services/policyModel'
import {
  type ArenaTrainingExample,
  type EvaluationResult,
  evaluatePolicyCheckpoint,
  trainPolicyCheckpoint,
} from '../../services/policyTrainer'
import {
  COACHING_RULES,
  proposeCorrection,
} from '../../services/coachingEngine'
import {
  downloadCheckpointFile,
  importCheckpointJson,
  loadStoredCheckpoints,
  loadStoredExamples,
  saveStoredCheckpoints,
  saveStoredExamples,
} from '../../services/checkpointStorage'
import type { ArenaCamera } from './ArenaWorldView'
import { ErrorBoundary } from '../utils/ErrorBoundary'
import styles from './ArenaScene.module.css'

const WorldView = dynamic(() => import('./ArenaWorldView'), { ssr: false })
const POLICY_LABELS: Record<CollectorStrategy, string> = {
  learned: 'Trained champion (Neural MLP)',
  safe: 'Safe heuristic',
  greedy: 'Shortest route heuristic',
  weather: 'Weather tactician heuristic',
}
const PHASE_LABELS = {
  ready: 'Ready to run',
  running: 'Autonomous run',
  paused: 'Run paused',
  finished: 'Round complete',
  review: 'Recorded run',
  error: 'Run stopped',
}

type LoadedSession = { session: ArenaSession; course: ArenaCourse }

function actionsEqual(a: ArenaAction, b: ArenaAction): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'move' && b.type === 'move') return a.edgeId === b.edgeId
  if (a.type === 'collect' && b.type === 'collect') return a.resourceId === b.resourceId
  return true
}

function actionLabel(action: ArenaAction): string {
  if (action.type === 'move') return `move ${action.edgeId}`
  if (action.type === 'collect') return `collect ${action.resourceId}`
  return action.type
}

export function describeArenaDecision(agent: ArenaAgentState): string {
  if (agent.recoveries > 0 && agent.lastOutcome?.reason === 'movement-blocked') return 'Blocked route. Recovered to the last safe station.'
  const outcome = agent.lastOutcome
  if (!outcome) return 'Waiting for the first observation.'
  if (!outcome.accepted) return `Action rejected: ${outcome.reason?.replaceAll('-', ' ')}.`
  if (agent.transit) return `Following ${agent.transit.edgeId.replaceAll('-', ' ')}.`
  if (outcome.action?.type === 'bank') return 'Delivered cargo to base.'
  if (outcome.action?.type === 'collect') return 'Collected an energy core.'
  if (outcome.action?.type === 'drain') return 'Spent energy to clear the low routes.'
  return 'Observing the next opportunity.'
}

function BrandHeader({ activeCheckpoint }: { activeCheckpoint: PolicyCheckpoint }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true">C</span> CLAWDY <span className={styles.edition}>FIELD LAB / 01</span></div>
      <div className={styles.checkpointBadge}>
        <Layers size={13} />
        <span>{activeCheckpoint.name}</span>
        <small>({activeCheckpoint.weightsHash.slice(0, 14)}…)</small>
      </div>
    </header>
  )
}

function AgentCard({ agent, policy, checkpoint, unlocked, onPolicy }: {
  agent: ArenaAgentState
  policy: CollectorStrategy
  checkpoint: PolicyCheckpoint | null
  unlocked: boolean
  onPolicy: (policy: CollectorStrategy) => void
}) {
  const champion = agent.id === 'champion'
  return (
    <section className={styles.agentCard} data-entrant={agent.id} aria-label={champion ? 'Your champion' : 'House rival'}>
      <div className={styles.agentHeading}>
        <span className={styles.agentMark} aria-hidden="true">{champion ? 'C' : 'R'}</span>
        <div>
          <h3>{champion ? 'Your champion' : 'House rival'}</h3>
          <span>{champion && policy === 'learned' && checkpoint ? checkpoint.id : 'REFERENCE POLICY / V2'}</span>
        </div>
        <span className={styles.score}>{agent.banked}<small>banked</small></span>
      </div>
      <label className={styles.policyLabel}>
        <span>Policy</span>
        <select value={policy} disabled={!unlocked} onChange={event => onPolicy(event.target.value as CollectorStrategy)}>
          {Object.entries(POLICY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <dl className={styles.agentStats}>
        <div><dt>Cargo</dt><dd>{agent.cargo}<small> / {ARENA_RULES.capacity}</small></dd></div>
        <div><dt>Energy</dt><dd>{agent.energy}<small> / {ARENA_RULES.initialEnergy}</small></dd></div>
        <div><dt>Recovery</dt><dd>{agent.recoveries}</dd></div>
      </dl>
      <p className={styles.decision}>{describeArenaDecision(agent)}</p>
    </section>
  )
}

function Workbench({ session, course, onRetry }: LoadedSession & { onRetry: () => void }) {
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const [visualReady, setVisualReady] = useState(false)
  const [follow, setFollow] = useState<ArenaCamera>('overview')
  const [checkpoints, setCheckpoints] = useState<PolicyCheckpoint[]>([SEASON_0_BASE_CHECKPOINT])
  const [activeCheckpoint, setActiveCheckpoint] = useState<PolicyCheckpoint>(SEASON_0_BASE_CHECKPOINT)
  const [examples, setExamples] = useState<ArenaTrainingExample[]>([])
  const [promptText, setPromptText] = useState('')
  const [isTraining, setIsTraining] = useState(false)
  const [trainMessage, setTrainMessage] = useState<string | null>(null)
  const [trainResult, setTrainResult] = useState<{ baseline: EvaluationResult; trained: EvaluationResult } | null>(null)
  const [hasHydrated, setHasHydrated] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const exampleCounter = useRef(0)

  const onReady = useCallback(() => setVisualReady(true), [])
  const onError = useCallback((error: Error) => session.fail(error.message), [session])
  const remaining = Math.max(0, Math.ceil((course.scenario.durationTicks - view.episode.tick) * ARENA_RULES.stepMs / 1000))
  const clock = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`
  const courseIsEvaluation = isEvaluationScenario(course.scenario.id)

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) session.pause() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [session])

  useEffect(() => {
    const storedCheckpoints = loadStoredCheckpoints()
    const storedExamples = loadStoredExamples()
    if (storedCheckpoints.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheckpoints(storedCheckpoints)
      setActiveCheckpoint(storedCheckpoints[0])
      session.setCheckpoint(storedCheckpoints[0])
      session.selectPolicy('champion', 'learned', storedCheckpoints[0])
    }
    if (storedExamples.length > 0) {
      setExamples(storedExamples)
    }
    setHasHydrated(true)
  }, [session])

  useEffect(() => {
    if (!hasHydrated) return
    saveStoredCheckpoints(checkpoints)
  }, [checkpoints, hasHydrated])

  useEffect(() => {
    if (!hasHydrated) return
    saveStoredExamples(examples)
  }, [examples, hasHydrated])

  const primaryAction = () => {
    if (view.phase === 'error') { onRetry(); return }
    if (view.phase === 'review') { session.returnToRun(); return }
    if (view.phase === 'running') { session.pause(); return }
    if (view.phase === 'finished') session.reset()
    session.start()
  }
  const primaryLabel = view.phase === 'running' ? 'Pause run' : view.phase === 'paused' ? 'Resume run' : view.phase === 'finished' ? 'Run again' : view.phase === 'review' ? 'Return to run' : view.phase === 'error' ? 'Reload world' : 'Start autonomous run'
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(session.recording())], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `clawdy-${course.scenario.id}-${view.episode.tick}.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const handlePropose = (text: string, customObs?: ArenaObservation) => {
    if (courseIsEvaluation) {
      setTrainMessage('This is a held-out evaluation scenario. Coaching and training are disabled.')
      return
    }
    if (!text.trim()) return
    const champObs = customObs ?? session.observe('champion')
    const currentAction = champObs.availableActions[0] ?? { type: 'wait' }
    const example = proposeCorrection(text, champObs, currentAction, course.scenario.id)
    if (example) {
      setExamples(prev => [example, ...prev])
      setPromptText('')
      setTrainMessage(`Proposed correction for tick ${example.tick}: ${example.rationale} — approve it to include in training.`)
    } else {
      setTrainMessage(`Could not find a valid legal action matching that guidance for tick ${champObs.tick}.`)
    }
  }

  const handleExportCheckpoint = () => {
    downloadCheckpointFile(activeCheckpoint)
    setTrainMessage(`Exported checkpoint file: ${activeCheckpoint.name}`)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = importCheckpointJson(reader.result as string)
        setCheckpoints(prev => {
          const filtered = prev.filter(c => c.id !== imported.id)
          return [imported, ...filtered]
        })
        setActiveCheckpoint(imported)
        session.setCheckpoint(imported)
        session.selectPolicy('champion', 'learned', imported)
        setTrainMessage(`Successfully imported checkpoint: ${imported.name} (${imported.weightsHash.slice(0, 14)})`)
      } catch (err) {
        setTrainMessage(`Import failed: ${err instanceof Error ? err.message : 'Invalid checkpoint file'}`)
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsText(file)
  }

  const toggleApprove = (id: string) => {
    setExamples(prev => prev.map(ex => {
      if (ex.id !== id) return ex
      if (isEvaluationScenario(ex.sourceEpisodeId)) {
        setTrainMessage(`Cannot approve an example from held-out scenario "${ex.sourceEpisodeId}". It is reserved for evaluation.`)
        return ex
      }
      return { ...ex, approved: !ex.approved }
    }))
  }

  const removeExample = (id: string) => {
    setExamples(prev => prev.filter(ex => ex.id !== id))
  }

  const handleTrain = () => {
    if (courseIsEvaluation) {
      setTrainMessage('This is a held-out evaluation scenario. Coaching and training are disabled.')
      return
    }
    const approved = examples.filter(e => e.approved)
    if (approved.length === 0) return
    rejectEvaluationExamples(approved)

    setIsTraining(true)
    setTrainMessage('Optimizing neural policy weights from approved coaching examples…')
    setTrainResult(null)

    setTimeout(() => {
      try {
        const trained = trainPolicyCheckpoint(activeCheckpoint, approved, {
          epochs: 100,
          learningRate: 0.02,
          name: `Champion v${checkpoints.length} (+${approved.length} examples)`,
        })

        const baselineEval = evaluatePolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, [course.scenario])
        const trainedEval = evaluatePolicyCheckpoint(trained, [course.scenario])

        setCheckpoints(prev => [trained, ...prev])
        setActiveCheckpoint(trained)
        session.setCheckpoint(trained)
        session.selectPolicy('champion', 'learned', trained)
        setIsTraining(false)
        setTrainMessage(`Training complete! Loss: ${trained.trainingSummary.loss.toFixed(4)} · Accuracy: ${(trained.trainingSummary.accuracy * 100).toFixed(0)}% · Weights updated.`)
        setTrainResult({ baseline: baselineEval, trained: trainedEval })
      } catch (err) {
        setIsTraining(false)
        setTrainMessage(`Training failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }, 400)
  }

  const currentMistake = (() => {
    if (view.phase !== 'review') return null
    const champObs = session.observe('champion')
    if (!champObs.decisionDue) return null
    const champ = view.episode.agents.find(a => a.id === 'champion')
    const recorded = champ?.lastOutcome?.action
    if (!recorded) return null
    const suggested = collectorPolicy(champObs, 'safe')
    if (actionsEqual(recorded, suggested)) return null
    return { champObs, recorded, suggested }
  })()

  const handleAddMistake = () => {
    if (courseIsEvaluation) {
      setTrainMessage('This is a held-out evaluation scenario. Coaching and training are disabled.')
      return
    }
    if (!currentMistake) return
    const { champObs, recorded, suggested } = currentMistake
    exampleCounter.current += 1
    const example: ArenaTrainingExample = {
      id: `mistake-${champObs.tick}-${exampleCounter.current.toString(36)}`,
      sourceEpisodeId: course.scenario.id,
      tick: champObs.tick,
      observation: champObs,
      originalAction: recorded,
      preferredAction: suggested,
      rationale: `Safe baseline would ${actionLabel(suggested)} here instead of ${actionLabel(recorded)}.`,
      approved: false,
    }
    setExamples(prev => [example, ...prev])
    setTrainMessage(`Added tick ${example.tick} to the coaching queue. Approve it to train the correction.`)
  }

  const handleSelectCheckpoint = (ckptId: string) => {
    const selected = checkpoints.find(c => c.id === ckptId)
    if (selected) {
      setActiveCheckpoint(selected)
      session.setCheckpoint(selected)
      session.selectPolicy('champion', 'learned', selected)
    }
  }

  const approvedCount = examples.filter(e => e.approved && !isEvaluationScenario(e.sourceEpisodeId)).length

  return (
    <>
      <div className={styles.intro}>
        <div><p className={styles.eyebrow}>TRAIN YOUR CHAMPION</p><h1>The world is the test.</h1><p className={styles.lede}>Watch a competitor act, coach it with instructions, train a real checkpoint, and compete.</p></div>
        <div className={styles.progress}><strong>01 / Observe</strong><span>02 / Coach & Review</span><span>03 / Train Checkpoint</span></div>
      </div>
      <div className={styles.workbench}>
        <section className={styles.viewport} aria-label="Generated world and autonomous rovers">
          <div className={styles.canvas}>
            <ErrorBoundary onError={onError} fallback={<div className={styles.canvasError}><h2>The world view could not start.</h2><button onClick={onRetry}>Reload world</button></div>}>
              <WorldView course={course} session={session} follow={follow} onReady={onReady} onError={onError} />
            </ErrorBoundary>
          </div>
          <div className={styles.worldTopline}>
            <div><span className={styles.liveDot} data-active={view.phase === 'running'} />{PHASE_LABELS[view.phase]}</div>
            <span>{course.config.name}</span>
          </div>
          {!visualReady && view.phase !== 'error' && <div className={styles.worldNotice} role="status">Loading the generated environment. The run will wait.</div>}
          {view.error && <div className={styles.worldNotice} role="alert"><strong>Run stopped</strong><p>{view.error}</p><button onClick={onRetry}>Retry world loading</button></div>}
          {view.phase === 'finished' && <div className={styles.result} role="status"><span>ROUND COMPLETE</span><h2>{view.episode.winner === 'champion' ? 'Your champion takes it.' : view.episode.winner === 'rival' ? 'The house rival wins.' : 'An even contest.'}</h2><p>Review the decisions. Coach mistakes below to fine-tune a new checkpoint.</p></div>}
          <div className={styles.worldBottomline}>
            <div className={styles.cameraButtons} role="group" aria-label="Camera view">
              {(['overview', 'champion', 'rival'] as const).map(camera => <button key={camera} aria-pressed={follow === camera} onClick={() => setFollow(camera)}>{camera === 'overview' ? 'Arena' : camera === 'champion' ? 'Champion' : 'Rival'}</button>)}
            </div>
            <span className={styles.weather} data-flooded={view.episode.weather.flooded}>{view.episode.weather.flooded ? 'FLOOD / LOW ROUTES SLOWED' : 'CLEAR / ROUTES OPEN'}</span>
          </div>
        </section>
        <aside className={styles.sidebar} aria-label="Competitor policies and status">
          <div className={styles.sidebarHeader}><span>THE COMPETITORS</span><span className={styles.timer}>{clock}</span></div>
          {view.episode.agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              policy={view.policies[agent.id]}
              checkpoint={agent.id === 'champion' ? activeCheckpoint : null}
              unlocked={view.phase === 'ready'}
              onPolicy={policy => session.selectPolicy(agent.id, policy, activeCheckpoint)}
            />
          ))}
          <div className={styles.ruleCard}><strong>A simple test. Real consequences.</strong><p>Collect cores and bank them at your base. Flooding slows the short route; a drain costs {ARENA_RULES.drainCost} energy and helps both rovers.</p><div className={styles.legend}><span><i />High route</span><span><i />Floodable route</span></div></div>
        </aside>
      </div>

      <div className={styles.controlBar}>
        <div className={styles.mainControls}>
          <button className={styles.primaryButton} onClick={primaryAction} disabled={!visualReady && view.phase !== 'error'}>{view.phase === 'running' ? <Pause size={16} /> : <Play size={16} />}{primaryLabel}</button>
          <button className={styles.secondaryButton} onClick={() => session.reset()} disabled={!visualReady || view.phase === 'error'}><RotateCcw size={15} />Reset</button>
          <button className={styles.secondaryButton} onClick={() => session.review()} disabled={view.phase !== 'paused' && view.phase !== 'finished'}><Eye size={16} />Review</button>
        </div>
        <div className={styles.runMeta}><span>Tick {view.episode.tick} / {course.scenario.durationTicks}</span><button onClick={download} disabled={view.episode.tick === 0} aria-label="Download recorded run"><Download size={16} />Export run</button></div>
      </div>

      {view.phase === 'review' && (
        <section className={styles.replay} aria-label="Recorded run review">
          <div>
            <strong>Recorded frame review (Tick {view.episode.tick})</strong>
            <span>{(view.episode.tick * ARENA_RULES.stepMs / 1000).toFixed(2)}s · frame {view.replayIndex + 1} / {view.replayLength}</span>
          </div>
          <input aria-label="Replay frame" type="range" min={0} max={Math.max(0, view.replayLength - 1)} value={view.replayIndex} onChange={event => session.seek(Number(event.target.value))} />
          <div className={styles.replayCoachBar}>
            <span>
              Frame status: Station <strong>{view.episode.agents.find(a => a.id === 'champion')?.nodeId ?? 'base'}</strong> · Cargo: <strong>{view.episode.agents.find(a => a.id === 'champion')?.cargo ?? 0}</strong> · Weather: <strong>{view.episode.weather.flooded ? 'Submerged (Flooded)' : 'Clear'}</strong>
            </span>
            <div className={styles.replayButtons}>
              <button
                className={styles.frameCoachButton}
                onClick={() => handlePropose(view.episode.weather.flooded ? 'take ridge route during flood' : 'prioritize energy core')}
                disabled={courseIsEvaluation}
                title={courseIsEvaluation ? 'Coaching disabled for held-out evaluation scenario' : 'Propose coaching correction for this exact frame'}
              >
                <Sparkles size={13} />
                Coach this frame (Tick {view.episode.tick})
              </button>
            </div>
          </div>
          {currentMistake && (
            <div className={styles.mistakeBanner} role="status">
              <div>
                <AlertTriangle size={14} />
                <strong>Possible mistake at Tick {view.episode.tick}</strong>
                <span>Champion chose <em>{actionLabel(currentMistake.recorded)}</em>; safe baseline would <em>{actionLabel(currentMistake.suggested)}</em>.</span>
              </div>
              <button
                className={styles.mistakeCoachButton}
                onClick={handleAddMistake}
                disabled={courseIsEvaluation}
                title={courseIsEvaluation ? 'Coaching disabled for held-out evaluation scenario' : 'Add this correction to the coaching queue'}
              >
                Coach this mistake
              </button>
            </div>
          )}
          {view.phase === 'review' && !currentMistake && (
            <div className={styles.frameOk} role="status">
              <CheckCircle2 size={14} />
              <span>This decision matches the safe baseline.</span>
            </div>
          )}
        </section>
      )}

      {/* ── Coach & Train Studio (Milestone 3 & 4) ── */}
      <section className={styles.coachingSection} aria-label="Coach and train your champion">
        <div className={styles.coachingHeader}>
          <div>
            <h2>Coach & Train Studio</h2>
            <p>Teach your champion new strategies. Approved coaching updates neural weights into versioned checkpoints.</p>
          </div>
          <div className={styles.checkpointMeta}>
            <label>
              Active Checkpoint:
              <select
                style={{ marginLeft: 8, padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd3c5' }}
                value={activeCheckpoint.id}
                disabled={view.phase === 'running'}
                onChange={e => handleSelectCheckpoint(e.target.value)}
              >
                {checkpoints.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className={styles.checkpointActions}>
              <button
                type="button"
                className={styles.actionButtonSmall}
                onClick={handleExportCheckpoint}
                title="Download active checkpoint JSON file"
              >
                <Download size={13} /> Export JSON
              </button>
              <button
                type="button"
                className={styles.actionButtonSmall}
                onClick={handleImportClick}
                disabled={view.phase === 'running'}
                title="Import trained checkpoint JSON file"
              >
                <Upload size={13} /> Import JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>

        {courseIsEvaluation && (
          <div className={styles.evaluationNotice} role="alert">
            <AlertTriangle size={14} />
            <strong>Held-out evaluation scenario</strong>
            <span>Coaching and training are disabled for this scenario. It is reserved for scoring.</span>
          </div>
        )}

        <div className={styles.coachingGrid}>
          <div className={styles.coachingCol}>
            <h3>1. Propose Coaching Corrections</h3>
            <div className={styles.rulesGrid}>
              {COACHING_RULES.map(rule => (
                <button
                  key={rule.id}
                  className={styles.ruleButton}
                  onClick={() => handlePropose(rule.description)}
                  disabled={view.phase === 'running' || courseIsEvaluation}
                >
                  <strong>{rule.label}</strong>
                  <span>{rule.description}</span>
                </button>
              ))}
            </div>
            <form className={styles.promptForm} onSubmit={e => { e.preventDefault(); handlePropose(promptText) }}>
              <input
                className={styles.promptInput}
                type="text"
                placeholder={courseIsEvaluation ? 'Coaching disabled on held-out scenario...' : "Or type custom coach guidance (e.g. 'take ridge route during flood')..."}
                value={promptText}
                disabled={view.phase === 'running' || courseIsEvaluation}
                onChange={e => setPromptText(e.target.value)}
              />
              <button className={styles.secondaryButton} type="submit" disabled={!promptText.trim() || view.phase === 'running' || courseIsEvaluation}>
                Propose
              </button>
            </form>
          </div>

          <div className={styles.coachingCol}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3>2. Review & Approve Queue ({approvedCount} approved)</h3>
              <button
                className={styles.primaryButton}
                style={{ minHeight: 32, fontSize: 10, padding: '0 12px' }}
                disabled={approvedCount === 0 || isTraining || view.phase === 'running' || courseIsEvaluation}
                onClick={handleTrain}
              >
                <Sparkles size={13} />
                {isTraining ? 'Training…' : `Train Checkpoint (${approvedCount})`}
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
                        <strong>Tick {ex.tick}: {ex.preferredAction.type} {('edgeId' in ex.preferredAction) ? `(${(ex.preferredAction as { edgeId: string }).edgeId})` : ''}{isEval && <span className={styles.evaluationTag}>Held-out</span>}</strong>
                        <p>{ex.rationale}</p>
                      </div>
                      <div className={styles.exampleActions}>
                        <button
                          className={ex.approved ? styles.approveButton : styles.rejectButton}
                          onClick={() => toggleApprove(ex.id)}
                          disabled={isEval}
                          title={isEval ? 'Held-out scenario: cannot approve for training' : ex.approved ? 'Approved for training' : 'Click to approve'}
                        >
                          {ex.approved ? <CheckCircle2 size={13} /> : 'Approve'}
                        </button>
                        <button
                          className={styles.rejectButton}
                          onClick={() => removeExample(ex.id)}
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
              <strong>Checkpoint evaluation on {course.config.name}</strong>
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
            <p className={styles.trainingResultNote}>Evaluation runs the checkpoint against the default house rival on the current course. This is a local benchmark, not a held-out ranked result.</p>
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        <p><strong>Watch → Coach → Approve → Train → Compete → Replay.</strong> Policy checkpoints update via real backpropagation on approved coaching data.</p>
        <span>Observe <ArrowRight size={13} /> Coach <ArrowRight size={13} /> Train <ArrowRight size={13} /> Compete</span>
      </footer>
    </>
  )
}

export default function ArenaScene() {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<LoadedSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    let owned: ArenaSession | undefined
    void loadArenaCourse(abort.signal).then(bundle => {
      if (abort.signal.aborted) { bundle.dispose(); return }
      try {
        owned = new ArenaSession(bundle.course, bundle.physics)
        setLoaded({ session: owned, course: bundle.course })
      } catch (cause) {
        bundle.dispose()
        throw cause
      }
    }).catch(cause => {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'World loading failed')
    })
    return () => { abort.abort(); owned?.dispose() }
  }, [attempt])

  const retry = () => {
    setLoaded(null)
    setError(null)
    setAttempt(value => value + 1)
  }

  return (
    <div className={styles.shell}>
      <BrandHeader activeCheckpoint={loaded?.session.getSnapshot().checkpoint ?? SEASON_0_BASE_CHECKPOINT} />
      {loaded ? <Workbench key={attempt} {...loaded} onRetry={retry} /> : <section className={styles.boot} aria-live="polite"><p className={styles.eyebrow}>TRAIN YOUR CHAMPION</p><h1>{error ? 'The course could not load.' : 'Preparing the proving ground.'}</h1><p>{error ?? 'Verifying the world asset, grounding the routes, and preparing two autonomous rovers.'}</p>{error ? <button className={styles.primaryButton} onClick={retry}>Retry loading <RotateCcw size={16} /></button> : <div className={styles.bootLine} />}<small>Local practice · No wallet required · Neural checkpoint training active</small></section>}
    </div>
  )
}

