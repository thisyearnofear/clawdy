'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { ArrowRight, Download, Eye, Pause, Play, RotateCcw } from 'lucide-react'
import { ARENA_RULES, type ArenaAgentState } from '../../services/arenaEpisode'
import { loadArenaCourse, type ArenaCourse } from '../../services/arenaCourse'
import { ArenaSession } from '../../services/arenaSession'
import type { CollectorStrategy } from '../../services/arenaPolicy'
import type { ArenaCamera } from './ArenaWorldView'
import { ErrorBoundary } from '../utils/ErrorBoundary'
import styles from './ArenaScene.module.css'

const WorldView = dynamic(() => import('./ArenaWorldView'), { ssr: false })
const POLICY_LABELS: Record<CollectorStrategy, string> = { safe: 'Safe collector', greedy: 'Shortest route', weather: 'Weather tactician' }
const PHASE_LABELS = { ready: 'Ready to run', running: 'Autonomous run', paused: 'Run paused', finished: 'Round complete', review: 'Recorded run', error: 'Run stopped' }

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

function BrandHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true">C</span> CLAWDY <span className={styles.edition}>FIELD LAB / 01</span></div>
      <span className={styles.buildBadge}>PHYSICAL BASELINE BUILD</span>
    </header>
  )
}

function AgentCard({ agent, policy, unlocked, onPolicy }: { agent: ArenaAgentState; policy: CollectorStrategy; unlocked: boolean; onPolicy: (policy: CollectorStrategy) => void }) {
  const champion = agent.id === 'champion'
  return (
    <section className={styles.agentCard} data-entrant={agent.id} aria-label={champion ? 'Your champion' : 'House rival'}>
      <div className={styles.agentHeading}>
        <span className={styles.agentMark} aria-hidden="true">{champion ? 'C' : 'R'}</span>
        <div><h3>{champion ? 'Your champion' : 'House rival'}</h3><span>REFERENCE POLICY / V2</span></div>
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

  return (
    <>
      <div className={styles.intro}>
        <div><p className={styles.eyebrow}>TRAIN YOUR CHAMPION</p><h1>The world is the test.</h1><p className={styles.lede}>Watch a competitor act, adapt, and find its way home.</p></div>
        <div className={styles.progress}><strong>01 / Observe</strong><span>02 / Coach</span><span>03 / Train</span></div>
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
          {view.phase === 'finished' && <div className={styles.result} role="status"><span>ROUND COMPLETE</span><h2>{view.episode.winner === 'champion' ? 'Your champion takes it.' : view.episode.winner === 'rival' ? 'The house rival wins.' : 'An even contest.'}</h2><p>Review the decisions. Reset to try another reference policy.</p></div>}
          <div className={styles.worldBottomline}>
            <div className={styles.cameraButtons} role="group" aria-label="Camera view">
              {(['overview', 'champion', 'rival'] as const).map(camera => <button key={camera} aria-pressed={follow === camera} onClick={() => setFollow(camera)}>{camera === 'overview' ? 'Arena' : camera === 'champion' ? 'Champion' : 'Rival'}</button>)}
            </div>
            <span className={styles.weather} data-flooded={view.episode.weather.flooded}>{view.episode.weather.flooded ? 'FLOOD / LOW ROUTES SLOWED' : 'CLEAR / ROUTES OPEN'}</span>
          </div>
        </section>
        <aside className={styles.sidebar} aria-label="Competitor policies and status">
          <div className={styles.sidebarHeader}><span>THE COMPETITORS</span><span className={styles.timer}>{clock}</span></div>
          {view.episode.agents.map(agent => <AgentCard key={agent.id} agent={agent} policy={view.policies[agent.id]} unlocked={view.phase === 'ready'} onPolicy={policy => session.selectPolicy(agent.id, policy)} />)}
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
      {view.phase === 'review' && <section className={styles.replay} aria-label="Recorded run review"><div><strong>Recorded decisions</strong><span>{(view.episode.tick * ARENA_RULES.stepMs / 1000).toFixed(2)}s · frame {view.replayIndex + 1} / {view.replayLength}</span></div><input aria-label="Replay frame" type="range" min={0} max={Math.max(0, view.replayLength - 1)} value={view.replayIndex} onChange={event => session.seek(Number(event.target.value))} /><p>Scrubbing reads recorded state. It does not move or retrain the live competitor.</p></section>}
      <footer className={styles.footer}><p><strong>Reference policies, not trained models.</strong> Coaching and checkpoint training are the next build stage.</p><span>Observe <ArrowRight size={13} /> Coach <ArrowRight size={13} /> Train <ArrowRight size={13} /> Compete</span></footer>
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
      <BrandHeader />
      {loaded ? <Workbench key={attempt} {...loaded} onRetry={retry} /> : <section className={styles.boot} aria-live="polite"><p className={styles.eyebrow}>TRAIN YOUR CHAMPION</p><h1>{error ? 'The course could not load.' : 'Preparing the proving ground.'}</h1><p>{error ?? 'Verifying the world asset, grounding the routes, and preparing two autonomous rovers.'}</p>{error ? <button className={styles.primaryButton} onClick={retry}>Retry loading <RotateCcw size={16} /></button> : <div className={styles.bootLine} />}<small>Local practice · No wallet required · Model training not yet implemented</small></section>}
    </div>
  )
}
