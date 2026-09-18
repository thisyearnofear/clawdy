'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Download, Eye, Layers, Pause, Play, RotateCcw, Sparkles, Upload, XCircle } from 'lucide-react'
import { ARENA_RULES, type ArenaAction, type ArenaAgentState, type ArenaObservation } from '../../services/arenaEpisode'
import { loadArenaCourse, applyCourseMode, type ArenaCourse, type CoursePlayMode } from '../../services/arenaCourse'
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
  learned: 'Trained champion',
  safe: 'Careful collector',
  greedy: 'Fast collector',
  weather: 'Flood-aware rival',
}
const PHASE_LABELS = {
  ready: 'Ready',
  running: 'Live',
  paused: 'Paused',
  finished: 'Finished',
  review: 'Replay',
  error: 'Stopped',
}
const CAMERA_LABELS: Record<ArenaCamera, string> = {
  overview: 'Arena',
  champion: 'Follow you',
  rival: 'Follow rival',
}

type LoadedSession = { session: ArenaSession; course: ArenaCourse }

function actionsEqual(a: ArenaAction, b: ArenaAction): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'move' && b.type === 'move') return a.edgeId === b.edgeId
  if (a.type === 'collect' && b.type === 'collect') return a.resourceId === b.resourceId
  return true
}

function formatStat(value: number): string {
  const rounded = Math.round(value)
  return Math.abs(value - rounded) < 1e-6 ? String(rounded) : value.toFixed(1)
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
  if (agent.transit) {
    const route = agent.transit.edgeId.includes('ridge') ? 'the high route'
      : agent.transit.edgeId.includes('valley') ? 'the valley'
      : agent.transit.edgeId.includes('shortcut') || agent.transit.edgeId.includes('diag') ? 'a shortcut'
      : agent.transit.edgeId.includes('cross') ? 'a cross trail'
      : 'the next station'
    return `Following ${route}.`
  }
  if (outcome.action?.type === 'bank') return 'Delivered cargo to base.'
  if (outcome.action?.type === 'collect') return 'Collected an energy core.'
  if (outcome.action?.type === 'drain') return 'Spent energy to clear the low routes.'
  return 'Observing the next opportunity.'
}

function BrandHeader({ activeCheckpoint }: { activeCheckpoint: PolicyCheckpoint }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true">C</span> CLAWDY</div>
      <div className={styles.checkpointBadge}>
        <Layers size={13} />
        <span>{activeCheckpoint.name}</span>
      </div>
    </header>
  )
}

function AgentCard({ agent, policy, unlocked, onPolicy }: {
  agent: ArenaAgentState
  policy: CollectorStrategy
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
          <span>{POLICY_LABELS[policy]}</span>
        </div>
        <span className={styles.score}>{agent.banked}<small>banked</small></span>
      </div>
      <label className={styles.policyLabel}>
        <span>Style</span>
        <select value={policy} disabled={!unlocked} onChange={event => onPolicy(event.target.value as CollectorStrategy)}>
          {Object.entries(POLICY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <dl className={styles.agentStats}>
        <div><dt>Cargo</dt><dd>{formatStat(agent.cargo)}<small> / {ARENA_RULES.capacity}</small></dd></div>
        <div><dt>Energy</dt><dd>{formatStat(agent.energy)}<small> / {ARENA_RULES.initialEnergy}</small></dd></div>
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
  const [playMode, setPlayMode] = useState<CoursePlayMode>('practice')
  const [activeCourse, setActiveCourse] = useState(course)
  const [studioOpen, setStudioOpen] = useState(false)
  const [hintOpen, setHintOpen] = useState(true)
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
  const remaining = Math.max(0, Math.ceil((activeCourse.scenario.durationTicks - view.episode.tick) * ARENA_RULES.stepMs / 1000))
  const clock = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`
  const courseIsEvaluation = activeCourse.scenario.split === 'evaluation' || isEvaluationScenario(activeCourse.scenario.id)
  const coachingLocked = courseIsEvaluation || view.scored

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
    setHintOpen(false)
    if (follow === 'overview') setFollow('champion')
    session.start()
  }
  const primaryLabel = view.phase === 'running' ? 'Pause' : view.phase === 'paused' ? 'Resume' : view.phase === 'finished' ? 'Play again' : view.phase === 'review' ? 'Back to match' : view.phase === 'error' ? 'Reload world' : 'Play'
  const switchPlayMode = (mode: CoursePlayMode) => {
    if (view.phase !== 'ready' || mode === playMode) return
    const next = applyCourseMode(course, mode)
    setPlayMode(mode)
    setActiveCourse(next)
    session.setCourse(next)
    session.setScored(mode === 'compete')
    if (mode === 'compete') setStudioOpen(false)
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(session.recording())], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `clawdy-${activeCourse.scenario.id}-${view.episode.tick}.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const handlePropose = (text: string, customObs?: ArenaObservation) => {
    if (coachingLocked) {
      setTrainMessage('This is a scored match. Switch to Practice to coach and train.')
      return
    }
    if (!text.trim()) return
    const champObs = customObs ?? session.observe('champion')
    const recorded = view.episode.agents.find(agent => agent.id === 'champion')?.lastOutcome?.action
    const currentAction = recorded ?? champObs.availableActions[0] ?? { type: 'wait' }
      const example = proposeCorrection(text, champObs, currentAction, activeCourse.scenario.id)
    if (example) {
      setExamples(prev => [example, ...prev])
      setPromptText('')
      setStudioOpen(true)
      setTrainMessage(`Proposed a fix at ${example.tick}: ${example.rationale} Approve it, then train.`)
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
      const approved = !ex.approved
      return { ...ex, approved, source: approved ? 'approved' as const : 'draft' as const }
    }))
  }

  const removeExample = (id: string) => {
    setExamples(prev => prev.filter(ex => ex.id !== id))
  }

  const handleTrain = () => {
    if (coachingLocked) {
      setTrainMessage('This is a scored match. Switch to Practice to coach and train.')
      return
    }
    const approved = examples.filter(e => e.approved)
    if (approved.length === 0) return
    rejectEvaluationExamples(approved)

    setIsTraining(true)
    setTrainMessage('Teaching from the approved notes…')
    setTrainResult(null)

    setTimeout(() => {
      try {
        const trained = trainPolicyCheckpoint(activeCheckpoint, approved, {
          epochs: 100,
          learningRate: 0.02,
          name: `Champion v${checkpoints.length} (+${approved.length} examples)`,
        })

        const baselineEval = evaluatePolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, [applyCourseMode(course, 'practice').scenario])
        const trainedEval = evaluatePolicyCheckpoint(trained, [applyCourseMode(course, 'practice').scenario])

        setCheckpoints(prev => [trained, ...prev])
        setActiveCheckpoint(trained)
        session.setCheckpoint(trained)
        session.selectPolicy('champion', 'learned', trained)
        setIsTraining(false)
        setTrainMessage(`Training complete. Loss ${trained.trainingSummary.loss.toFixed(4)} · ${(trained.trainingSummary.accuracy * 100).toFixed(0)}% of the notes landed.`)
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

  const coachSuggestion = currentMistake && 'edgeId' in currentMistake.suggested
    ? { edgeId: currentMistake.suggested.edgeId }
    : null

  const handleAddMistake = () => {
    if (coachingLocked) {
      setTrainMessage('This is a scored match. Switch to Practice to coach and train.')
      return
    }
    if (!currentMistake) return
    const { champObs, recorded, suggested } = currentMistake
    exampleCounter.current += 1
    const example: ArenaTrainingExample = {
      id: `mistake-${champObs.tick}-${exampleCounter.current.toString(36)}`,
      sourceEpisodeId: activeCourse.scenario.id,
      tick: champObs.tick,
      observation: champObs,
      originalAction: recorded,
      preferredAction: suggested,
      rationale: `Safe baseline would ${actionLabel(suggested)} here instead of ${actionLabel(recorded)}.`,
      approved: false,
      source: 'draft',
    }
    setExamples(prev => [example, ...prev])
    setStudioOpen(true)
    setTrainMessage(`Queued a fix at ${example.tick}. Approve it, then train.`)
  }

  const handleSelectCheckpoint = (ckptId: string) => {
    const selected = checkpoints.find(c => c.id === ckptId)
    if (selected) {
      setActiveCheckpoint(selected)
      session.setCheckpoint(selected)
      session.selectPolicy('champion', 'learned', selected)
    }
  }

  const handleShareCard = () => {
    if (typeof document === 'undefined') return
    const canvas = document.querySelector('canvas')
    if (!canvas) {
      setTrainMessage('Could not find the world canvas to capture. Replay a few frames and try again.')
      return
    }
    let dataUrl: string
    try {
      dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png')
    } catch {
      setTrainMessage('Browser blocked canvas read-back. Try again from a desktop session.')
      return
    }
    const safeId = activeCourse.scenario.id.replace(/[^a-z0-9-]/gi, '-')
    const filename = `clawdy-${safeId}-${view.episode.tick}.png`
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    setTrainMessage(`Saved share card: ${filename}`)
  }

  const approvedCount = examples.filter(e => e.approved && !isEvaluationScenario(e.sourceEpisodeId)).length

  return (
    <>
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>TRAIN YOUR CHAMPION</p>
          <h1>Watch it play. Then teach it.</h1>
          <p className={styles.lede}>Two rovers race for cores. After the round, replay a mistake, approve a fix, and train a new brain.</p>
        </div>
        <ol className={styles.progress}>
          <li data-active={view.phase === 'ready' || view.phase === 'running'}>Play</li>
          <li data-active={view.phase === 'paused' || view.phase === 'finished' || view.phase === 'review'}>Replay</li>
          <li data-active={studioOpen && !coachingLocked}>Coach</li>
        </ol>
      </div>
      <div className={styles.workbench}>
        <section className={styles.viewport} aria-label="Generated world and autonomous rovers">
          <div className={styles.canvas}>
            <ErrorBoundary onError={onError} fallback={<div className={styles.canvasError}><h2>The world view could not start.</h2><button onClick={onRetry}>Reload world</button></div>}>
              <WorldView course={activeCourse} session={session} follow={follow} coachSuggestion={coachSuggestion} onReady={onReady} onError={onError} />
            </ErrorBoundary>
          </div>
          <div className={styles.worldTopline}>
            <div><span className={styles.liveDot} data-active={view.phase === 'running'} />{PHASE_LABELS[view.phase]}{playMode === 'compete' ? ' · Match' : ' · Practice'}</div>
            <span>{follow === 'overview' ? 'Drag to look around' : activeCourse.config.name}</span>
          </div>
          {!visualReady && view.phase !== 'error' && <div className={styles.worldNotice} role="status">Loading the world. Play unlocks when it settles.</div>}
          {view.error && <div className={styles.worldNotice} role="alert"><strong>Run stopped</strong><p>{view.error}</p><button onClick={onRetry}>Retry world loading</button></div>}
          {visualReady && hintOpen && view.phase === 'ready' && (
            <div className={styles.playHint} role="status">
              <p>Press Play. Follow your green champion — amber marked routes are flood-sensitive.</p>
              <button type="button" onClick={() => setHintOpen(false)} aria-label="Dismiss hint">Got it</button>
            </div>
          )}
          {view.phase === 'finished' && (
            <div className={styles.result} role="status">
              <span>{playMode === 'compete' ? 'MATCH COMPLETE' : 'ROUND COMPLETE'}</span>
              <h2>{view.episode.winner === 'champion' ? 'Your champion takes it.' : view.episode.winner === 'rival' ? 'The house rival wins.' : 'An even contest.'}</h2>
              <p>{coachingLocked ? 'This was a scored match. Coaching stays off — try Practice if you want to teach it.' : 'Watch the replay, then coach the moment it went wrong.'}</p>
              {!coachingLocked && (
                <div className={styles.replayButtons}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => { session.review(); setStudioOpen(true) }}
                  >
                    <Eye size={16} /> Watch replay
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleShareCard}
                  >
                    <Download size={16} /> Share your world
                  </button>
                </div>
              )}
            </div>
          )}
          <div className={styles.worldBottomline}>
            <div className={styles.cameraButtons} role="group" aria-label="Camera view">
              {(['overview', 'champion', 'rival'] as const).map(camera => (
                <button key={camera} aria-pressed={follow === camera} onClick={() => setFollow(camera)}>{CAMERA_LABELS[camera]}</button>
              ))}
            </div>
            <span className={styles.weather} data-flooded={view.episode.weather.flooded}>{view.episode.weather.flooded ? 'Flood · valley slowed' : 'Clear · all routes open'}</span>
          </div>
        </section>
        <aside className={styles.sidebar} aria-label="Competitor status">
          <div className={styles.sidebarHeader}><span>THE FIELD</span><span className={styles.timer}>{clock}</span></div>
          <div className={styles.modeToggle} role="group" aria-label="Match type">
            <button type="button" aria-pressed={playMode === 'practice'} disabled={view.phase !== 'ready'} onClick={() => switchPlayMode('practice')}>Practice</button>
            <button type="button" aria-pressed={playMode === 'compete'} disabled={view.phase !== 'ready'} onClick={() => switchPlayMode('compete')}>Match</button>
          </div>
          {view.episode.agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              policy={view.policies[agent.id]}
              unlocked={view.phase === 'ready' && playMode === 'practice'}
              onPolicy={policy => session.selectPolicy(agent.id, policy, activeCheckpoint)}
            />
          ))}
          <div className={styles.ruleCard}>
            <strong>{playMode === 'compete' ? 'Scored match. No coaching.' : 'Collect. Bank. Survive the flood.'}</strong>
            <p>{playMode === 'compete' ? 'Same world, different flood and core layout. Weights stay frozen until you reset to Practice.' : `Grab cores and bank them at base. Floods slow the valley; a drain costs ${ARENA_RULES.drainCost} energy and helps both rovers.`}</p>
            <div className={styles.legend}><span><i />High route</span><span><i />Floodable route</span></div>
          </div>
        </aside>
      </div>

      <div className={styles.controlBar}>
        <div className={styles.mainControls}>
          <button className={styles.primaryButton} onClick={primaryAction} disabled={!visualReady && view.phase !== 'error'}>{view.phase === 'running' ? <Pause size={16} /> : <Play size={16} />}{primaryLabel}</button>
          <button className={styles.secondaryButton} onClick={() => session.reset()} disabled={!visualReady || view.phase === 'error'}><RotateCcw size={15} />Reset</button>
          <button className={styles.secondaryButton} onClick={() => session.review()} disabled={view.phase !== 'paused' && view.phase !== 'finished'}><Eye size={16} />Replay</button>
          <button
            className={styles.secondaryButton}
            aria-pressed={studioOpen}
            onClick={() => setStudioOpen(open => !open)}
            disabled={coachingLocked && examples.length === 0}
          >
            <Sparkles size={15} />{studioOpen ? 'Hide coach' : 'Coach'}
          </button>
        </div>
        <div className={styles.runMeta}><span>{view.episode.tick} / {activeCourse.scenario.durationTicks}</span><button onClick={download} disabled={view.episode.tick === 0} aria-label="Download recorded run"><Download size={16} />Save run</button></div>
      </div>

      {view.phase === 'review' && (
        <section className={styles.replay} aria-label="Recorded run review">
          <div>
            <strong>Replay · { (view.episode.tick * ARENA_RULES.stepMs / 1000).toFixed(1) }s</strong>
            <span>Frame {view.replayIndex + 1} / {view.replayLength}</span>
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
                <strong>Looks off at { (view.episode.tick * ARENA_RULES.stepMs / 1000).toFixed(1) }s</strong>
                <span>It chose <em>{actionLabel(currentMistake.recorded)}</em>; the careful collector would <em>{actionLabel(currentMistake.suggested)}</em>.</span>
              </div>
              <button
                className={styles.mistakeCoachButton}
                onClick={handleAddMistake}
                disabled={coachingLocked}
                title={coachingLocked ? 'Coaching is off during a scored match' : 'Add this fix to the coaching queue'}
              >
                Queue this fix
              </button>
            </div>
          )}
          {view.phase === 'review' && !currentMistake && (
            <div className={styles.frameOk} role="status">
              <CheckCircle2 size={14} />
              <span>This choice matches the careful collector.</span>
            </div>
          )}
        </section>
      )}

      {studioOpen && (
      <section className={styles.coachingSection} aria-label="Coach your champion">
        <div className={styles.coachingHeader}>
          <div>
            <h2>Coach</h2>
            <p>Pick a rule or type a note. Approve the ones you want, then train.</p>
          </div>
          <div className={styles.checkpointMeta}>
            <label>
              Active brain:
              <select
                className={styles.checkpointSelect}
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

        {coachingLocked && (
          <div className={styles.evaluationNotice} role="alert">
            <AlertTriangle size={14} />
            <strong>Scored match</strong>
            <span>Coaching and training stay off. Switch to Practice to teach it.</span>
          </div>
        )}

        <div className={styles.coachingGrid}>
          <div className={styles.coachingCol}>
            <h3>Suggest a fix</h3>
            <div className={styles.rulesGrid}>
              {COACHING_RULES.map(rule => (
                <button
                  key={rule.id}
                  className={styles.ruleButton}
                  onClick={() => handlePropose(rule.description)}
                  disabled={view.phase === 'running' || coachingLocked}
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
                placeholder={coachingLocked ? 'Coaching is off in a scored match' : 'Or type a note, e.g. take the ridge when it floods'}
                value={promptText}
                disabled={view.phase === 'running' || coachingLocked}
                onChange={e => setPromptText(e.target.value)}
              />
              <button className={styles.secondaryButton} type="submit" disabled={!promptText.trim() || view.phase === 'running' || coachingLocked}>
                Propose
              </button>
            </form>
          </div>

          <div className={styles.coachingCol}>
            <div className={styles.queueHeader}>
              <h3>Approve ({approvedCount})</h3>
              <button
                className={styles.primaryButton}
                disabled={approvedCount === 0 || isTraining || view.phase === 'running' || coachingLocked}
                onClick={handleTrain}
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
            <p className={styles.trainingResultNote}>Practice-course score against the house rival. Not a ranked result.</p>
          </div>
        )}
      </section>
      )}

      <footer className={styles.footer}>
        <p><strong>Play → Replay → Coach → Train → Match.</strong> The new brain is a real weight update, not a saved prompt.</p>
        <span>Play <ArrowRight size={13} /> Coach <ArrowRight size={13} /> Match</span>
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
      {loaded ? <Workbench key={attempt} {...loaded} onRetry={retry} /> : <section className={styles.boot} aria-live="polite"><p className={styles.eyebrow}>TRAIN YOUR CHAMPION</p><h1>{error ? 'The course could not load.' : 'Preparing the proving ground.'}</h1><p>{error ?? 'Grounding the routes and rolling two rovers onto the field.'}</p>{error ? <button className={styles.primaryButton} onClick={retry}>Retry loading <RotateCcw size={16} /></button> : <div className={styles.bootLine} />}<small>Practice match · No wallet · Coach after the round</small></section>}
    </div>
  )
}

