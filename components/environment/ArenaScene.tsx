'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowRight, Clapperboard, Download, Eye, HelpCircle, Pause, Play, Printer, RotateCcw, Sparkles } from 'lucide-react'
import { ARENA_RULES, observeSnapshot, type ArenaAction, type ArenaObservation } from '../../services/arenaEpisode'
import { loadArenaCourse, applyCourseMode, type ArenaCourse, type CoursePlayMode } from '../../services/arenaCourse'
import { isEvaluationScenario, rejectEvaluationExamples } from '../../services/arenaScenarios'
import { ArenaSession } from '../../services/arenaSession'
import type { ArenaMotion } from '../../services/arenaPhysics'
import { collectorPolicy } from '../../services/arenaPolicy'
import { createTournament, runTournament, type ArenaTournament, type TournamentEntrant, type TournamentMatch } from '../../services/arenaTournament'
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
import { proposeCorrection, summarizeCoachFocus } from '../../services/coachingEngine'
import { rankCoachingCandidates, type CoachingCandidate } from '../../services/coachingCandidates'
import {
  ENCOUNTER_STAGGER_TICKS,
  focusVectorForChampion,
  focusVectorForRival,
  resolveEncounter,
  shouldOfferEncounter,
  type EncounterResolution,
} from '../../services/arenaEncounter'
import {
  getChampionLook,
  loadChampionIdentity,
  saveChampionIdentity,
  type ChampionIdentity,
} from '../../services/championIdentity'
import {
  downloadCheckpointFile,
  importCheckpointJson,
  loadStoredCheckpoints,
  loadStoredExamples,
} from '../../services/checkpointStorage'
import { useConvexClient } from '../ConvexClientProvider'
import {
  deleteExampleRecord,
  queueCheckpointSync,
  queueMatchSync,
  queueTrainingJobSync,
  startArenaSync,
} from '../../services/syncEngine'
import { useArenaStore } from '../../services/arenaStore'
import { computeNextStep } from '../../services/workbenchFlow'
import type { ArenaCamera } from './ArenaWorldView'
import { ErrorBoundary } from '../utils/ErrorBoundary'
import { AgentCard } from '../workbench/AgentCard'
import { BootScreen } from '../workbench/BootScreen'
import { BrandHeader } from '../workbench/BrandHeader'
import { CoachPanel } from '../workbench/CoachPanel'
import { HelpDrawer } from '../workbench/HelpDrawer'
import { ReplayPanel } from '../workbench/ReplayPanel'
import { TournamentBracket } from '../workbench/TournamentBracket'
import { ViewportHud, type HudFeedEvent } from '../workbench/ViewportHud'
import { actionLabel, actionsEqual, COACH_NUDGE_KEY, isExecutableCheckpoint, PLAY_HINT_KEY, readHintDismissed } from '../workbench/readouts'
import styles from './ArenaScene.module.css'

const WorldView = dynamic(() => import('./ArenaWorldView'), { ssr: false })
const viewOnlyCheckpointMessage = (checkpoint: PolicyCheckpoint) =>
  `"${checkpoint.name}" is a view-only v1 brain — re-train its examples to upgrade, then run the new checkpoint.`
const CAMERA_LABELS: Record<ArenaCamera, string> = {
  overview: 'Arena',
  champion: 'Follow you',
  rival: 'Follow rival',
}

type LoadedSession = { session: ArenaSession; course: ArenaCourse; createMotion: () => ArenaMotion }


function Workbench({
  session,
  course,
  createMotion,
  onRetry,
  championIdentity,
  onChampionIdentity,
  onOpenHelp,
}: LoadedSession & {
  onRetry: () => void
  championIdentity: ChampionIdentity
  onChampionIdentity: (next: ChampionIdentity) => void
  onOpenHelp: () => void
}) {
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const convex = useConvexClient()
  const [visualReady, setVisualReady] = useState(false)
  const [follow, setFollow] = useState<ArenaCamera>('overview')
  const [cinematic, setCinematic] = useState(false)
  const [tournament, setTournament] = useState<ArenaTournament | null>(null)
  const [tournamentRunning, setTournamentRunning] = useState(false)
  const [playMode, setPlayMode] = useState<CoursePlayMode>('practice')
  const [activeCourse, setActiveCourse] = useState(course)
  const [studioOpen, setStudioOpen] = useState(false)
  const [hintOpen, setHintOpen] = useState(() => !readHintDismissed())
  const [coachNudgeOpen, setCoachNudgeOpen] = useState(false)
  const [trainFocusLine, setTrainFocusLine] = useState<string | null>(null)
  const [modeBanner, setModeBanner] = useState<CoursePlayMode | null>(null)
  const [runTip, setRunTip] = useState<string | null>(null)
  const [encounter, setEncounter] = useState<{
    resolution: EncounterResolution
    transferred: number
  } | null>(null)
  const floodWarnedRef = useRef<number | null>(null)
  const lastEncounterTickRef = useRef<number | null>(null)
  const encounterBusyRef = useRef(false)
  const encounterResumeTimer = useRef<number | null>(null)
  const modeBannerTimer = useRef<number | null>(null)
  const runTipTimer = useRef<number | null>(null)
  const checkpoints = useArenaStore(state => state.checkpoints)
  const setCheckpoints = useArenaStore(state => state.setCheckpoints)
  const activeCheckpoint = useArenaStore(state => state.activeCheckpoint)
  const setActiveCheckpoint = useArenaStore(state => state.setActiveCheckpoint)
  const examples = useArenaStore(state => state.examples)
  const setExamples = useArenaStore(state => state.setExamples)
  const [frameAdvice, setFrameAdvice] = useState<{ taken: ArenaAction; atTick: number; observation: ArenaObservation; candidates: CoachingCandidate[] } | null>(null)
  const [promptText, setPromptText] = useState('')
  const [isTraining, setIsTraining] = useState(false)
  const [trainMessage, setTrainMessage] = useState<string | null>(null)
  const [trainResult, setTrainResult] = useState<{ baseline: EvaluationResult; trained: EvaluationResult } | null>(null)
  const [feed, setFeed] = useState<HudFeedEvent[]>([])
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const [clipArmed, setClipArmed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const exampleCounter = useRef(0)
  const feedId = useRef(0)
  const lastFeedTick = useRef(-1)
  const lastFeedPhase = useRef(view.phase)
  const lastFeedBanked = useRef<Record<string, number>>({})
  const lastFeedFlooded = useRef(false)
  const lastFeedDrained = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordStreamRef = useRef<MediaStream | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const clipUrlRef = useRef<string | null>(null)

  const onReady = useCallback(() => setVisualReady(true), [])
  const onError = useCallback((error: Error) => session.fail(error.message), [session])
  const remaining = Math.max(0, Math.ceil((activeCourse.scenario.durationTicks - view.episode.tick) * ARENA_RULES.stepMs / 1000))
  const clock = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`
  const courseIsEvaluation = activeCourse.scenario.split === 'evaluation' || isEvaluationScenario(activeCourse.scenario.id)
  const coachingLocked = courseIsEvaluation || view.scored
  // Scorebug: always-visible sport state derived from the live snapshot.
  const champion = view.episode.agents.find(agent => agent.id === 'champion')
  const rival = view.episode.agents.find(agent => agent.id === 'rival')
  const flooded = view.episode.weather.flooded
  const drained = !flooded && view.episode.weather.drainedUntilTick > view.episode.tick
  const nextFloodIn = (() => {
    if (flooded) return null
    const coming = activeCourse.scenario.floods.find(window => window.startTick > view.episode.tick)
    if (!coming) return null
    return Math.max(0, Math.ceil((coming.startTick - view.episode.tick) * ARENA_RULES.stepMs / 1000))
  })()
  const floodEndsIn = flooded ? (() => {
    const window = activeCourse.scenario.floods.find(w => view.episode.tick >= w.startTick && view.episode.tick < w.endTick)
    if (!window) return null
    return Math.max(0, Math.ceil((window.endTick - view.episode.tick) * ARENA_RULES.stepMs / 1000))
  })() : null

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) session.pause() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [session])

  // Boot: localStorage first (instant, sync never blocks play); then the
  // sync engine pulls Convex, LWW-merges, restores other devices' records,
  // and flushes the persisted outbox behind the scenes.
  useEffect(() => {
    const store = useArenaStore.getState()
    const storedCheckpoints = loadStoredCheckpoints()
    const storedExamples = loadStoredExamples()
    if (storedCheckpoints.length > 0) {
      const executable = storedCheckpoints.filter(isExecutableCheckpoint)
      const legacy = storedCheckpoints.filter(c => !isExecutableCheckpoint(c))
      store.setCheckpoints([...executable, ...legacy])
      const first = executable[0] ?? SEASON_0_BASE_CHECKPOINT
      store.setActiveCheckpoint(first)
      try {
        session.setCheckpoint(first)
        session.selectPolicy('champion', 'learned', first)
      } catch (err) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot boot read of localStorage; the quarantine notice must land before first paint
        setTrainMessage(`Stored brain refused: ${err instanceof Error ? err.message : 'incompatible checkpoint'}`)
      }
      if (legacy.length > 0) {
        setTrainMessage(
          `${legacy.length} stored brain${legacy.length === 1 ? ' is' : 's are'} view-only (v1 schema) — re-train ${legacy.length === 1 ? 'its' : 'their'} examples to upgrade.`,
        )
      }
    }
    if (storedExamples.length > 0) {
      store.setExamples(storedExamples)
    }
    store.markHydrated()
    return startArenaSync(convex)
  }, [session, convex])

  const championAccent = getChampionLook(championIdentity.lookId).accent

  useEffect(() => {
    if (view.phase !== 'finished' || coachingLocked) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- dismissing the one-time nudge when leaving the finished phase is the nudge's lifecycle contract
      setCoachNudgeOpen(false)
      return
    }
    try {
      if (window.sessionStorage.getItem(COACH_NUDGE_KEY) === '1') return
    } catch { /* ignore */ }
    setCoachNudgeOpen(true)
  }, [view.phase, coachingLocked])

  // Mid-run flood tip: once per approaching window, when the valley is ≤12s from flooding.
  useEffect(() => {
    if (view.phase !== 'running' || flooded || nextFloodIn === null || nextFloodIn > 12) return
    const coming = activeCourse.scenario.floods.find(window => window.startTick > view.episode.tick)
    if (!coming || floodWarnedRef.current === coming.startTick) return
    floodWarnedRef.current = coming.startTick
    setRunTip(`Flood in ${nextFloodIn}s — amber valley slows. Take the ridge.`)
    if (runTipTimer.current) window.clearTimeout(runTipTimer.current)
    runTipTimer.current = window.setTimeout(() => setRunTip(null), 5200)
  }, [view.phase, view.episode.tick, flooded, nextFloodIn, activeCourse.scenario.floods])

  useEffect(() => () => {
    if (modeBannerTimer.current) window.clearTimeout(modeBannerTimer.current)
    if (runTipTimer.current) window.clearTimeout(runTipTimer.current)
    if (encounterResumeTimer.current) window.clearTimeout(encounterResumeTimer.current)
  }, [])

  const dismissEncounter = useCallback(() => {
    if (encounterResumeTimer.current) {
      window.clearTimeout(encounterResumeTimer.current)
      encounterResumeTimer.current = null
    }
    setEncounter(null)
    encounterBusyRef.current = false
    if (view.phase === 'paused') session.start()
  }, [session, view.phase])

  // Persist a match summary when a round finishes (links active checkpoint).
  // Idempotency by (matchId, payload) lives in the sync engine's meta, so a
  // re-render or remount never double-records the same match.
  useEffect(() => {
    if (view.phase !== 'finished') return
    const champion = view.episode.agents.find(agent => agent.id === 'champion')
    const rival = view.episode.agents.find(agent => agent.id === 'rival')
    queueMatchSync({
      matchId: session.matchId,
      scenarioId: activeCourse.scenario.id,
      rulesVersion: view.episode.rulesVersion,
      scored: view.scored,
      checkpointId: activeCheckpoint.id,
      championBanked: champion?.banked ?? 0,
      rivalBanked: rival?.banked ?? 0,
      winner: view.episode.winner,
      linkedExampleIds: examples.filter(example => example.approved).map(example => example.id),
    })
  }, [view.phase, view.episode, view.scored, session, activeCourse.scenario.id, activeCheckpoint.id, examples])

  const pushFeed = useCallback((items: { text: string; tone: 'bank' | 'flood' | 'info' }[]) => {
    if (items.length === 0) return
    const stamped = items.map(item => ({ ...item, id: ++feedId.current }))
    const ids = new Set(stamped.map(event => event.id))
    setFeed(prev => [...prev, ...stamped].slice(-3))
    setTimeout(() => setFeed(prev => prev.filter(event => !ids.has(event.id))), 4500)
  }, [])

  // Proximity clash: specialization vectors decide the winner; episode applies cargo/stagger.
  useEffect(() => {
    if (encounterBusyRef.current || encounter) return
    if (view.phase !== 'running') return
    const episode = session.liveEpisode()
    if (!shouldOfferEncounter({
      phaseRunning: true,
      episode,
      lastEncounterTick: lastEncounterTickRef.current,
    })) return

    encounterBusyRef.current = true
    session.pause()
    const championAgent = episode.agents.find(agent => agent.id === 'champion')
    const rivalAgent = episode.agents.find(agent => agent.id === 'rival')
    if (!championAgent || !rivalAgent) {
      encounterBusyRef.current = false
      session.start()
      return
    }
    const championFocus = focusVectorForChampion(examples.filter(example => example.approved))
    const rivalFocus = focusVectorForRival(view.policies.rival)
    const resolution = resolveEncounter(championFocus, rivalFocus, {
      flooded: episode.weather.flooded,
      championCargo: championAgent.cargo,
      rivalCargo: rivalAgent.cargo,
    })
    let transferred = 0
    try {
      transferred = session.applyEncounterClash({
        winnerId: resolution.winnerId,
        loserId: resolution.loserId,
        transferCargo: resolution.transferCargo,
        staggerTicks: ENCOUNTER_STAGGER_TICKS,
      }).transferred
    } catch (err) {
      console.warn('[encounter] prize apply failed:', err)
    }
    lastEncounterTickRef.current = episode.tick
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clash modal must appear on the same tick the episode is paused; deferring a render lets the race visibly stall
    setEncounter({ resolution, transferred })
    pushFeed([{
      text: transferred > 0
        ? `${resolution.reason} Cargo +${transferred}.`
        : resolution.reason,
      tone: 'info',
    }])
    encounterResumeTimer.current = window.setTimeout(() => {
      setEncounter(null)
      encounterBusyRef.current = false
      if (session.getSnapshot().phase === 'paused') session.start()
    }, 2400)
  }, [view.phase, view.episode.tick, view.policies.rival, examples, encounter, session, pushFeed])

  // Live race feed: banks, flood flips, drains, and the full-time score.
  // Throttled to one decision cadence (5 ticks) so snapshot pumps never churn renders.
  useEffect(() => {
    const tick = view.episode.tick
    const phase = view.phase
    if (tick - lastFeedTick.current < 5 && phase === lastFeedPhase.current) return
    type FeedItem = { text: string; tone: 'bank' | 'flood' | 'info' }
    let items: FeedItem[] = []
    for (const agent of view.episode.agents) {
      const before = lastFeedBanked.current[agent.id]
      if (before !== undefined && agent.banked > before) {
        items = [
          ...items,
          {
            text: `${agent.id === 'champion' ? 'You bank' : 'Rival banks'} +${agent.banked - before}`,
            tone: 'bank',
          },
        ]
      }
      lastFeedBanked.current[agent.id] = agent.banked
    }
    const floodedNow = view.episode.weather.flooded
    if (floodedNow !== lastFeedFlooded.current) {
      items = [...items, { text: floodedNow ? 'Flood on the valley' : 'Waters recede — valley open', tone: 'flood' }]
      lastFeedFlooded.current = floodedNow
    }
    const drainedNow = !floodedNow && view.episode.weather.drainedUntilTick > tick
    if (drainedNow && !lastFeedDrained.current) items = [...items, { text: 'Drain opened a path', tone: 'info' }]
    lastFeedDrained.current = drainedNow
    if (phase === 'finished' && lastFeedPhase.current !== 'finished') {
      const you = view.episode.agents.find(agent => agent.id === 'champion')?.banked ?? 0
      const foe = view.episode.agents.find(agent => agent.id === 'rival')?.banked ?? 0
      items = [...items, { text: `Full time — You ${you} · Rival ${foe}`, tone: 'info' }]
    }
    lastFeedTick.current = tick
    lastFeedPhase.current = phase
    pushFeed(items)
  }, [view, pushFeed])

  // Souvenir clip: optional low-cost WebM encode. Auto-record used to hitch the
  // GPU (captureStream + VP9 + preserveDrawingBuffer). Opt-in keeps Play smooth;
  // enable via the Record control once the round is running.
  useEffect(() => {
    const phase = view.phase
    if (phase === 'running' && clipArmed && !recorderRef.current) {
      try {
        if (typeof window === 'undefined') return
        if (window.matchMedia('(pointer: coarse)').matches) return // spare low-end GPUs the encode
        if (typeof MediaRecorder === 'undefined') return
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
        const stream = canvas?.captureStream?.(12)
        if (!stream) return
        const mimeType = ['video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 900_000 } : undefined)
        recordChunksRef.current = []
        recorder.ondataavailable = event => {
          if (event.data.size > 0) recordChunksRef.current.push(event.data)
        }
        recorder.onstop = () => {
          recorderRef.current = null
          recordStreamRef.current?.getTracks().forEach(track => track.stop())
          recordStreamRef.current = null
          const blob = new Blob(recordChunksRef.current, { type: 'video/webm' })
          recordChunksRef.current = []
          if (blob.size === 0) return
          if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
          const url = URL.createObjectURL(blob)
          clipUrlRef.current = url
          setClipUrl(url)
        }
        recordStreamRef.current = stream
        recorder.start(2000)
        recorderRef.current = recorder
      } catch {
        // Recording is a souvenir — never break play.
      }
    }
    if (phase !== 'running' && phase !== 'paused' && recorderRef.current) {
      try {
        if (recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      } catch {
        // Best-effort stop only.
      }
    }
    if (phase === 'ready' && clipUrlRef.current) {
      URL.revokeObjectURL(clipUrlRef.current)
      clipUrlRef.current = null
      setClipUrl(null)
      setClipArmed(false)
    }
  }, [view.phase, clipArmed])

  useEffect(() => () => {
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    } catch {
      // Best-effort teardown only.
    }
    recordStreamRef.current?.getTracks().forEach(track => track.stop())
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
  }, [])

  /** Single-elimination bracket: your trained champion vs the house field, run headlessly on the live layout. */
  const runBracket = () => {
    if (tournamentRunning) return
    if (!isExecutableCheckpoint(activeCheckpoint)) {
      setTrainMessage(viewOnlyCheckpointMessage(activeCheckpoint))
      return
    }
    const entrants: TournamentEntrant[] = [
      { id: 'you', name: activeCheckpoint.name, policy: { strategy: 'learned', checkpoint: activeCheckpoint }, policyVersion: 'learned.you' },
      { id: 'house-careful', name: 'House · Careful', policy: 'safe', policyVersion: 'baseline.safe.v2' },
      { id: 'house-greedy', name: 'House · Greedy', policy: 'greedy', policyVersion: 'baseline.greedy.v2' },
      { id: 'house-weather', name: 'House · Weather', policy: 'weather', policyVersion: 'baseline.weather.v2' },
    ]
    const bracket = createTournament(entrants, Math.floor(Math.random() * 0x7fffffff))
    setTournament(bracket)
    setTournamentRunning(true)
    void runTournament(bracket, activeCourse.scenario, createMotion, () => setTournament({ ...bracket }))
      .then(() => setTournament({ ...bracket }))
      .catch(() => setTrainMessage('The tournament stopped unexpectedly.'))
      .finally(() => setTournamentRunning(false))
  }

  /** Load a finished bracket match into review and play its cinematic reel. */
  const watchMatch = (match: TournamentMatch) => {
    if (!match.recording || view.phase === 'running') return
    setCinematic(true)
    session.reviewFrom(match.recording)
  }

  const primaryAction = () => {
    if (view.phase === 'error') { onRetry(); return }
    if (view.phase === 'review') { setCinematic(false); session.returnToRun(); return }
    if (view.phase === 'running') { session.pause(); return }
    if (view.phase === 'finished') session.reset()
    setHintOpen(false)
    if (follow === 'overview') setFollow('champion')
    session.start()
  }
  const primaryLabel = view.phase === 'running' ? 'Pause' : view.phase === 'paused' ? 'Resume' : view.phase === 'finished' ? 'Play again' : view.phase === 'review' ? 'Back to match' : view.phase === 'error' ? 'Reload world' : 'Play'

  // Space / P toggles play-pause, except while typing, while a button has
  // focus (space already activates it), or while an encounter card is up.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || encounter) return
      if (event.key !== ' ' && event.key.toLowerCase() !== 'p') return
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return
      event.preventDefault()
      primaryAction()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const switchPlayMode = (mode: CoursePlayMode) => {
    if (view.phase !== 'ready' || mode === playMode) return
    const next = applyCourseMode(course, mode)
    setPlayMode(mode)
    setActiveCourse(next)
    session.setCourse(next)
    session.setScored(mode === 'compete')
    if (mode === 'compete') setStudioOpen(false)
    floodWarnedRef.current = null
    setRunTip(null)
    lastEncounterTickRef.current = null
    setEncounter(null)
    encounterBusyRef.current = false
    setModeBanner(mode)
    if (modeBannerTimer.current) window.clearTimeout(modeBannerTimer.current)
    modeBannerTimer.current = window.setTimeout(() => setModeBanner(null), 1100)
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
        if (!isExecutableCheckpoint(imported)) {
          setTrainMessage(`Imported ${imported.name} as view-only. ${viewOnlyCheckpointMessage(imported)}`)
          return
        }
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
    // Tombstone-propagating delete: the old local-only filter silently
    // diverged every other device.
    deleteExampleRecord(id)
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
        const jobId = `train-${Date.now().toString(36)}`
        queueTrainingJobSync({
          jobId,
          status: 'running',
          parentCheckpointId: activeCheckpoint.id,
          resultCheckpointId: null,
          exampleCount: approved.length,
          message: null,
        })
        const trained = trainPolicyCheckpoint(activeCheckpoint, approved, {
          // Browser coach-train config, pinned in versions.test.ts and
          // docs/COMPATIBILITY.md: 60 epochs, lr 0.008 with a deterministic
          // 0.5x step at epoch 30 (few-shot stable; the old 100/0.02 ran
          // hot enough to diverge on ~10-example lessons).
          epochs: 60,
          learningRate: 0.008,
          learningRateDecay: { atEpoch: 30, factor: 0.5 },
          name: `${championIdentity.name} v${checkpoints.length} (+${approved.length})`,
        })

        const baselineEval = evaluatePolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, [applyCourseMode(course, 'practice').scenario])
        const trainedEval = evaluatePolicyCheckpoint(trained, [applyCourseMode(course, 'practice').scenario])

        const focusLine = summarizeCoachFocus(approved)
        setTrainFocusLine(focusLine)
        setCheckpoints(prev => [trained, ...prev])
        setActiveCheckpoint(trained)
        session.setCheckpoint(trained)
        session.selectPolicy('champion', 'learned', trained)
        setIsTraining(false)
        setTrainMessage(
          focusLine
            ? `Training complete. ${focusLine} Loss ${trained.trainingSummary.loss.toFixed(4)} · ${(trained.trainingSummary.accuracy * 100).toFixed(0)}% of the notes landed.`
            : `Training complete. Loss ${trained.trainingSummary.loss.toFixed(4)} · ${(trained.trainingSummary.accuracy * 100).toFixed(0)}% of the notes landed.`,
        )
        setTrainResult({ baseline: baselineEval, trained: trainedEval })
        queueCheckpointSync(trained, approved.map(example => example.id))
        queueTrainingJobSync({
          jobId,
          status: 'succeeded',
          parentCheckpointId: activeCheckpoint.id,
          resultCheckpointId: trained.id,
          exampleCount: approved.length,
          message: `loss ${trained.trainingSummary.loss.toFixed(4)}`,
        })
      } catch (err) {
        setIsTraining(false)
        setTrainMessage(`Training failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
        queueTrainingJobSync({
          jobId: `train-fail-${Date.now().toString(36)}`,
          status: 'failed',
          parentCheckpointId: activeCheckpoint.id,
          resultCheckpointId: null,
          exampleCount: approved.length,
          message: err instanceof Error ? err.message : 'Unknown error',
        })
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

  // WS1.4: at a settled review frame, measure the top alternatives against the
  // action actually taken (route-only rollouts on the real replay snapshot).
  // The counterfactual base is the PRE-decision checkpoint at outcome.tick —
  // view.episode lags one decision behind, so ranking at the live frame would
  // compare futures from the wrong state. Debounced so scrubbing the slider
  // does not run rollouts per frame; these are suggestions only — nothing
  // trains until a human approves the example.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leaving review must immediately drop stale counterfactual advice; the debounced timer below cannot guarantee that
    if (view.phase !== 'review' || coachingLocked) { setFrameAdvice(null); return }
    const outcome = view.episode.agents.find(agent => agent.id === 'champion')?.lastOutcome
    if (!outcome?.accepted || !outcome.action || outcome.tick >= view.episode.tick) { setFrameAdvice(null); return }
    const taken = outcome.action
    const timer = window.setTimeout(() => {
      try {
        const recording = session.activeRecording()
        const frame = recording.checkpoints[Math.floor(outcome.tick / ARENA_RULES.decisionEveryTicks)]
        if (!frame || frame.state.tick !== outcome.tick) { setFrameAdvice(null); return }
        const champObs = observeSnapshot(activeCourse.scenario, frame.state, 'champion')
        const candidates = rankCoachingCandidates(activeCourse.scenario, frame.state, champObs, taken)
        setFrameAdvice(candidates.length > 0 ? { taken, atTick: outcome.tick, observation: champObs, candidates } : null)
      } catch {
        setFrameAdvice(null)
      }
    }, 140)
    return () => window.clearTimeout(timer)
  }, [view.phase, view.replayIndex, coachingLocked])

  const handleAddCandidate = (candidate: CoachingCandidate) => {
    if (coachingLocked || !frameAdvice) return
    exampleCounter.current += 1
    const example: ArenaTrainingExample = {
      id: `outcome-${frameAdvice.atTick}-${exampleCounter.current.toString(36)}`,
      sourceEpisodeId: activeCourse.scenario.id,
      tick: frameAdvice.atTick,
      observation: frameAdvice.observation,
      originalAction: frameAdvice.taken,
      preferredAction: candidate.action,
      rationale: candidate.rationale,
      approved: false,
      source: 'draft',
      provenance: { kind: 'oracle-consequence', teacher: 'safe', reason: candidate.rationale, outcomeDelta: candidate.delta120 },
      outcomeDelta: candidate.delta120,
    }
    setExamples(prev => [example, ...prev])
    setStudioOpen(true)
    setFrameAdvice(prev => prev ? { ...prev, candidates: prev.candidates.filter(c => c !== candidate) } : null)
    setTrainMessage(`Queued a measured fix at ${example.tick}: ${candidate.rationale} Approve it, then train.`)
  }

  const handleSelectCheckpoint = (ckptId: string) => {
    const selected = checkpoints.find(c => c.id === ckptId)
    if (!selected) return
    if (!isExecutableCheckpoint(selected)) {
      setTrainMessage(viewOnlyCheckpointMessage(selected))
      return
    }
    setActiveCheckpoint(selected)
    try {
      session.setCheckpoint(selected)
      session.selectPolicy('champion', 'learned', selected)
    } catch (err) {
      setTrainMessage(`Brain refused: ${err instanceof Error ? err.message : 'incompatible checkpoint'}`)
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
  const championFocus = focusVectorForChampion(examples.filter(example => example.approved))
  const rivalFocus = focusVectorForRival(view.policies.rival)

  const resetForTeaching = useCallback(() => {
    floodWarnedRef.current = null
    setRunTip(null)
    session.reset()
  }, [session])

  // nextStep stays pure render data (label + action key); the ref-touching
  // work happens in the click handler below, where it belongs. The machine
  // itself lives in services/workbenchFlow.ts with golden tests.
  const nextStep = computeNextStep({
    visualReady,
    phase: view.phase,
    playMode,
    coachingLocked,
    studioOpen,
    approvedCount,
  })

  const runNextStep = (action: string | null) => {
    switch (action) {
      case 'retry': onRetry(); break
      case 'play': primaryAction(); break
      case 'review': session.review(); break
      case 'review-coach': session.review(); setStudioOpen(true); break
      case 'teach': resetForTeaching(); break
      case 'coach': setStudioOpen(true); break
      case 'train': handleTrain(); break
    }
  }

  return (
    <div className={styles.stageEnter}>
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>TRAIN YOUR CHAMPION</p>
          <h1>Watch it play. Then teach it.</h1>
          <p className={styles.lede}>Two rovers race for cores. After the round, replay a mistake, approve a fix, and train a new brain.</p>
        </div>
        <div className={styles.introAside}>
          <ol className={styles.progress}>
            <li data-active={view.phase === 'ready' || view.phase === 'running'}>Play</li>
            <li data-active={view.phase === 'paused' || view.phase === 'finished' || view.phase === 'review'}>Replay</li>
            <li data-active={studioOpen && !coachingLocked}>Coach</li>
          </ol>
          <button type="button" className={styles.helpInline} onClick={onOpenHelp}>
            <HelpCircle size={13} /> What do I do?
          </button>
        </div>
      </div>
      <div className={styles.workbench} data-mode={playMode} data-world-ready={visualReady}>
        <section className={styles.viewport} aria-label="Generated world and autonomous rovers">
          <div className={styles.canvas} data-ready={visualReady}>
            <ErrorBoundary onError={onError} fallback={<div className={styles.canvasError}><h2>The world view could not start.</h2><button onClick={onRetry}>Reload world</button></div>}>
              <WorldView course={activeCourse} session={session} follow={follow} cinematic={cinematic && view.phase === 'review'} coachSuggestion={coachSuggestion} championAccent={championAccent} onReady={onReady} onError={onError} />
            </ErrorBoundary>
          </div>
          <div
            className={styles.worldVeil}
            data-ready={visualReady}
            aria-hidden={visualReady}
          >
            {!visualReady && (
              <p>Settling the world…</p>
            )}
          </div>
          {encounter && (
            <div className={`${styles.encounterCard} ${styles.hintEnter}`} role="status">
              <span>CLASH</span>
              <h2>{encounter.resolution.winnerId === 'champion' ? `${championIdentity.name} holds the line.` : 'The house rival forces through.'}</h2>
              <p>{encounter.resolution.reason}</p>
              {encounter.transferred > 0 && <p className={styles.encounterPrize}>Cargo contested · +{encounter.transferred} to the winner</p>}
              <button type="button" className={styles.primaryButton} onClick={dismissEncounter}>Continue now</button>
            </div>
          )}
          {modeBanner && (
            <div className={styles.modeFlash} key={modeBanner} role="status">
              <span>{modeBanner === 'compete' ? 'MATCH' : 'PRACTICE'}</span>
              <p>{modeBanner === 'compete' ? 'Held-out layout. Coaching locked.' : 'Teach freely. Same world, practice floods.'}</p>
            </div>
          )}
          <ViewportHud
            phase={view.phase}
            isMatch={playMode === 'compete'}
            sideHint={follow === 'overview' ? 'Drag to look around' : activeCourse.config.name}
            score={champion && rival ? { you: champion.banked, foe: rival.banked, cargo: champion.cargo } : null}
            clock={clock}
            flooded={flooded}
            drained={drained}
            floodEndsIn={floodEndsIn}
            nextFloodIn={nextFloodIn}
            runTip={runTip}
            feed={feed}
            error={view.error}
            onRetry={onRetry}
          />
          {visualReady && hintOpen && view.phase === 'ready' && !modeBanner && (
            <div className={`${styles.playHint} ${styles.hintEnter}`} role="status">
              <p><strong>Press Play.</strong> Follow your green champion — amber routes flood first.</p>
              <button
                type="button"
                onClick={() => {
                  setHintOpen(false)
                  try { window.sessionStorage.setItem(PLAY_HINT_KEY, '1') } catch { /* ignore */ }
                }}
                aria-label="Dismiss hint"
              >
                Got it
              </button>
            </div>
          )}
          {coachNudgeOpen && view.phase === 'finished' && !coachingLocked && (
            <div className={`${styles.playHint} ${styles.hintEnter}`} role="status">
              <p><strong>Teach the miss.</strong> Open Replay, scrub the bad turn, then Coach that frame.</p>
              <button
                type="button"
                onClick={() => {
                  setCoachNudgeOpen(false)
                  session.review()
                  setStudioOpen(true)
                  try { window.sessionStorage.setItem(COACH_NUDGE_KEY, '1') } catch { /* ignore */ }
                }}
              >
                Open Coach
              </button>
            </div>
          )}
          {view.phase === 'finished' && (
            <div className={`${styles.result} ${styles.hintEnter}`} role="status">
              <span>{playMode === 'compete' ? 'MATCH COMPLETE' : 'ROUND COMPLETE'}</span>
              <h2>{view.episode.winner === 'champion' ? 'Your champion takes it.' : view.episode.winner === 'rival' ? 'The house rival wins.' : 'An even contest.'}</h2>
              <p>{coachingLocked ? 'This was a scored match. Coaching stays off — try Practice if you want to teach it.' : 'Watch the replay, then coach the moment it went wrong.'}</p>
              {!coachingLocked && (
                <div className={styles.replayButtons}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      setCoachNudgeOpen(false)
                      session.review()
                      setStudioOpen(true)
                      try { window.sessionStorage.setItem(COACH_NUDGE_KEY, '1') } catch { /* ignore */ }
                    }}
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
                  <a
                    className={styles.secondaryButton}
                    href="/prints/champion-rover.stl"
                    download="clawdy-champion-rover.stl"
                    onClick={() => setTrainMessage('Saved print kit: clawdy-champion-rover.stl — profile in docs/PRINT_KIT.md')}
                  >
                    <Printer size={16} /> Print your champion
                  </a>
                  {clipUrl && (
                    <a
                      className={styles.secondaryButton}
                      href={clipUrl}
                      download={`clawdy-${activeCourse.scenario.id.replace(/[^a-z0-9-]/gi, '-')}-${view.episode.tick}.webm`}
                    >
                      <Clapperboard size={16} /> Save clip
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
          <div className={styles.worldBottomline}>
            <div className={styles.cameraButtons} role="group" aria-label="Camera view">
              {(['overview', 'champion', 'rival'] as const).map(camera => (
                <button key={camera} aria-pressed={follow === camera} onClick={() => { setFollow(camera); setCinematic(false) }}>{CAMERA_LABELS[camera]}</button>
              ))}
            </div>
            <span className={styles.weather} data-flooded={view.episode.weather.flooded}>{view.episode.weather.flooded ? 'Flood · valley slowed' : 'Clear · all routes open'}</span>
          </div>
        </section>
        <aside className={styles.sidebar} aria-label="Competitor status">
          <div className={styles.sidebarHeader}><span>THE FIELD</span><span className={styles.timer}>{clock}</span></div>
          <div className={styles.modeToggle} role="group" aria-label="Match type" data-flash={modeBanner ?? undefined}>
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
              championIdentity={agent.id === 'champion' ? championIdentity : undefined}
              onChampionIdentity={agent.id === 'champion' ? onChampionIdentity : undefined}
              focusVector={agent.id === 'champion' ? championFocus : rivalFocus}
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
          <button
            className={`${styles.primaryButton}${visualReady && hintOpen && view.phase === 'ready' ? ` ${styles.playPulse}` : ''}`}
            onClick={primaryAction}
            disabled={!visualReady && view.phase !== 'error'}
          >
            {view.phase === 'running' ? <Pause size={16} /> : <Play size={16} />}
            {primaryLabel}
          </button>
          <button className={styles.secondaryButton} onClick={() => { setCinematic(false); floodWarnedRef.current = null; lastEncounterTickRef.current = null; setEncounter(null); encounterBusyRef.current = false; setRunTip(null); session.reset() }} disabled={!visualReady || view.phase === 'error'}><RotateCcw size={15} />Reset</button>
          <button className={styles.secondaryButton} onClick={() => session.review()} disabled={view.phase !== 'paused' && view.phase !== 'finished'}><Eye size={16} />Replay</button>
          <button
            className={styles.secondaryButton}
            type="button"
            aria-pressed={clipArmed}
            disabled={view.phase === 'finished' || view.phase === 'error' || view.phase === 'review'}
            onClick={() => setClipArmed(armed => !armed)}
            title={clipArmed ? 'Clip recording armed — encodes while you play' : 'Arm a low-cost souvenir clip for this run'}
          >
            <Clapperboard size={16} />{clipArmed ? 'Record on' : 'Record'}
          </button>
          <button
            className={styles.secondaryButton}
            aria-pressed={studioOpen}
            onClick={() => setStudioOpen(open => !open)}
            disabled={coachingLocked && examples.length === 0}
          >
            <Sparkles size={15} />{studioOpen ? 'Hide coach' : 'Coach'}
          </button>
        </div>
        <div className={styles.runMeta}>
          <span>{view.episode.tick} / {activeCourse.scenario.durationTicks}</span>
          <button onClick={download} disabled={view.episode.tick === 0} aria-label="Download recorded run"><Download size={16} />Save run</button>
        </div>
      </div>

      <div className={styles.nextStep} role="status">
        <span>Next</span>
        {nextStep.run ? (
          <button type="button" onClick={() => runNextStep(nextStep.run)}>{nextStep.label}</button>
        ) : (
          <strong>{nextStep.label}</strong>
        )}
      </div>

      <TournamentBracket
        tournament={tournament}
        running={tournamentRunning}
        visualReady={visualReady}
        phase={view.phase}
        onRun={runBracket}
        onWatch={watchMatch}
      />

      {view.phase === 'review' && (
        <ReplayPanel
          tick={view.episode.tick}
          replayIndex={view.replayIndex}
          replayLength={view.replayLength}
          championNodeId={view.episode.agents.find(a => a.id === 'champion')?.nodeId ?? 'base'}
          championCargo={view.episode.agents.find(a => a.id === 'champion')?.cargo ?? 0}
          flooded={view.episode.weather.flooded}
          cinematic={cinematic}
          coachingLocked={coachingLocked}
          currentMistake={currentMistake}
          frameAdvice={frameAdvice}
          onSeek={frame => { setCinematic(false); session.seek(frame) }}
          onToggleCinematic={() => setCinematic(on => !on)}
          onCoachThisMoment={() => handlePropose(view.episode.weather.flooded ? 'take ridge route during flood' : 'prioritize energy core')}
          onQueueMistake={handleAddMistake}
          onQueueCandidate={handleAddCandidate}
        />
      )}

      {studioOpen && (
      <CoachPanel
        activeCheckpoint={activeCheckpoint}
        checkpoints={checkpoints}
        phase={view.phase}
        coachingLocked={coachingLocked}
        trainFocusLine={trainFocusLine}
        onSelectCheckpoint={handleSelectCheckpoint}
        onExportCheckpoint={handleExportCheckpoint}
        onImportClick={handleImportClick}
        onFileChange={handleFileChange}
        fileInputRef={fileInputRef}
        onPropose={text => handlePropose(text)}
        promptText={promptText}
        onPromptTextChange={setPromptText}
        approvedCount={approvedCount}
        isTraining={isTraining}
        onTrain={handleTrain}
        examples={examples}
        onToggleApprove={toggleApprove}
        onRemoveExample={removeExample}
        trainMessage={trainMessage}
        trainResult={trainResult}
        courseName={course.config.name}
      />
      )}

      <footer className={styles.footer}>
        <p><strong>Play → Replay → Coach → Train → Match.</strong> The new brain is a real weight update, not a saved prompt.</p>
        <span>Play <ArrowRight size={13} /> Coach <ArrowRight size={13} /> Match</span>
      </footer>
    </div>
  )
}

export default function ArenaScene() {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<LoadedSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [championIdentity, setChampionIdentity] = useState<ChampionIdentity>(() => loadChampionIdentity())

  useEffect(() => {
    saveChampionIdentity(championIdentity)
  }, [championIdentity])

  useEffect(() => {
    const abort = new AbortController()
    let owned: ArenaSession | undefined
    void loadArenaCourse(abort.signal).then(bundle => {
      if (abort.signal.aborted) { bundle.dispose(); return }
      try {
        owned = new ArenaSession(bundle.course, bundle.physics)
        setLoaded({ session: owned, course: bundle.course, createMotion: bundle.createMotion })
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

  const onChampionIdentity = useCallback((next: ChampionIdentity) => {
    setChampionIdentity({
      name: next.name.slice(0, 24),
      lookId: next.lookId,
    })
  }, [])

  return (
    <div className={styles.shell}>
      <BrandHeader
        activeCheckpoint={loaded?.session.getSnapshot().checkpoint ?? SEASON_0_BASE_CHECKPOINT}
        championName={championIdentity.name}
        onOpenHelp={() => setHelpOpen(true)}
      />
      {loaded ? (
        <Workbench
          key={attempt}
          {...loaded}
          onRetry={retry}
          championIdentity={championIdentity}
          onChampionIdentity={onChampionIdentity}
          onOpenHelp={() => setHelpOpen(true)}
        />
      ) : (
        <BootScreen error={error} onRetry={retry} />
      )}
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

