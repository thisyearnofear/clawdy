'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { ArrowRight, CheckCircle2, Download, Eye, Layers, Pause, Play, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import { ARENA_RULES, type ArenaAgentState } from '../../services/arenaEpisode'
import { loadArenaCourse, type ArenaCourse } from '../../services/arenaCourse'
import { ArenaSession } from '../../services/arenaSession'
import type { CollectorStrategy } from '../../services/arenaPolicy'
import {
  type PolicyCheckpoint,
  SEASON_0_BASE_CHECKPOINT,
} from '../../services/policyModel'
import {
  type ArenaTrainingExample,
  trainPolicyCheckpoint,
} from '../../services/policyTrainer'
import {
  COACHING_RULES,
  proposeCorrection,
} from '../../services/coachingEngine'
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

  const onReady = useCallback(() => setVisualReady(true), [])
  const onError = useCallback((error: Error) => session.fail(error.message), [session])
  const remaining = Math.max(0, Math.ceil((course.scenario.durationTicks - view.episode.tick) * ARENA_RULES.stepMs / 1000))
  const clock = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) session.pause() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [session])

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

  const handlePropose = (text: string) => {
    if (!text.trim()) return
    const champObs = session.observe('champion')
    const currentAction = champObs.availableActions[0] ?? { type: 'wait' }
    const example = proposeCorrection(text, champObs, currentAction, course.scenario.id)
    if (example) {
      // Auto-approve quick rules
      example.approved = true
      setExamples(prev => [example, ...prev])
      setPromptText('')
      setTrainMessage(`Proposed correction for tick ${example.tick}: ${example.rationale}`)
    } else {
      setTrainMessage('Could not find a valid legal action matching that coaching guidance in the current state.')
    }
  }

  const toggleApprove = (id: string) => {
    setExamples(prev => prev.map(ex => ex.id === id ? { ...ex, approved: !ex.approved } : ex))
  }

  const removeExample = (id: string) => {
    setExamples(prev => prev.filter(ex => ex.id !== id))
  }

  const handleTrain = () => {
    const approved = examples.filter(e => e.approved)
    if (approved.length === 0) return

    setIsTraining(true)
    setTrainMessage('Optimizing neural policy weights from approved coaching examples…')

    setTimeout(() => {
      try {
        const trained = trainPolicyCheckpoint(activeCheckpoint, approved, {
          epochs: 45,
          learningRate: 0.04,
          name: `Champion v${checkpoints.length} (+${approved.length} examples)`,
        })

        setCheckpoints(prev => [trained, ...prev])
        setActiveCheckpoint(trained)
        session.setCheckpoint(trained)
        session.selectPolicy('champion', 'learned', trained)
        setIsTraining(false)
        setTrainMessage(`Training complete! Loss: ${trained.trainingSummary.loss.toFixed(4)} · Weights updated with ${trained.weightsHash.slice(0, 16)}`)
      } catch (err) {
        setIsTraining(false)
        setTrainMessage(`Training failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }, 400)
  }

  const handleSelectCheckpoint = (ckptId: string) => {
    const selected = checkpoints.find(c => c.id === ckptId)
    if (selected) {
      setActiveCheckpoint(selected)
      session.setCheckpoint(selected)
      session.selectPolicy('champion', 'learned', selected)
    }
  }

  const approvedCount = examples.filter(e => e.approved).length

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
          <div><strong>Recorded decisions</strong><span>{(view.episode.tick * ARENA_RULES.stepMs / 1000).toFixed(2)}s · frame {view.replayIndex + 1} / {view.replayLength}</span></div>
          <input aria-label="Replay frame" type="range" min={0} max={Math.max(0, view.replayLength - 1)} value={view.replayIndex} onChange={event => session.seek(Number(event.target.value))} />
          <p>Scrubbing reads recorded state. Propose a coaching correction for this state below to train the next checkpoint.</p>
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
          </div>
        </div>

        <div className={styles.coachingGrid}>
          <div className={styles.coachingCol}>
            <h3>1. Propose Coaching Corrections</h3>
            <div className={styles.rulesGrid}>
              {COACHING_RULES.map(rule => (
                <button
                  key={rule.id}
                  className={styles.ruleButton}
                  onClick={() => handlePropose(rule.description)}
                  disabled={view.phase === 'running'}
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
                placeholder="Or type custom coach guidance (e.g. 'take ridge route during flood')..."
                value={promptText}
                disabled={view.phase === 'running'}
                onChange={e => setPromptText(e.target.value)}
              />
              <button className={styles.secondaryButton} type="submit" disabled={!promptText.trim() || view.phase === 'running'}>
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
                disabled={approvedCount === 0 || isTraining || view.phase === 'running'}
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
                examples.map(ex => (
                  <div key={ex.id} className={styles.exampleCard} data-approved={ex.approved}>
                    <div className={styles.exampleDetails}>
                      <strong>Tick {ex.tick}: {ex.preferredAction.type} {('edgeId' in ex.preferredAction) ? `(${(ex.preferredAction as { edgeId: string }).edgeId})` : ''}</strong>
                      <p>{ex.rationale}</p>
                    </div>
                    <div className={styles.exampleActions}>
                      <button
                        className={ex.approved ? styles.approveButton : styles.rejectButton}
                        onClick={() => toggleApprove(ex.id)}
                        title={ex.approved ? 'Approved for training' : 'Click to approve'}
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
                ))
              )}
            </div>
          </div>
        </div>

        {trainMessage && (
          <div className={styles.trainingStatusCard} role="status">
            <span>{trainMessage}</span>
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

