'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowRight, Clapperboard, Download, Eye, FastForward, HelpCircle, Pause, Play, Printer, RotateCcw, SkipForward, Sparkles, Volume2, VolumeX } from 'lucide-react'
import { ARENA_RULES, observeSnapshot, type ArenaAction, type ArenaObservation, type ArenaRecording } from '../../services/arenaEpisode'
import { loadArenaCourse, applyCourseMode, type ArenaCourse, type CoursePlayMode } from '../../services/arenaCourse'
import { isEvaluationScenario, rejectEvaluationExamples } from '../../services/arenaScenarios'
import { ArenaSession, SESSION_SPEEDS, type SessionSpeed } from '../../services/arenaSession'
import type { ArenaMotion } from '../../services/arenaPhysics'
import { type EntrantPolicyOption } from '../../services/arenaPolicy'
import { buildMatchTimeline, MOMENT_LABELS, MOMENT_LEAD_TICKS, nextMomentAfter, type MatchMoment } from '../../services/matchTimeline'
import { createTournament, runTournament, type ArenaTournament, type TournamentEntrant, type TournamentMatch } from '../../services/arenaTournament'
import { type PolicyCheckpoint, SEASON_0_BASE_CHECKPOINT } from '../../services/policyModel'
import { isBundledStarter, SEASON_0_STARTER_CHECKPOINT } from '../../services/starterCheckpoint'
import { trainPolicyCheckpoint } from '../../services/policyTrainer'
import { proposeCorrection, summarizeCoachFocus } from '../../services/coachingEngine'
import { rankCoachingCandidates, type CoachingCandidate } from '../../services/coachingCandidates'
import { draftRecordedCorrection, recordedCoachContext } from '../../services/coachingReview'
import { comparePracticeCheckpoints, comparisonFrameAt, type PracticeComparison } from '../../services/practiceComparison'
import { ArenaSound } from '../../services/arenaSound'
import {
  encounterDistance,
  focusVectorForChampion,
  shouldOfferEncounter,
  shouldOfferSighting,
} from '../../services/arenaEncounter'
import {
  getChampionLook,
  loadChampionIdentity,
  saveChampionIdentity,
  type ChampionIdentity,
} from '../../services/championIdentity'
import {
  downloadCheckpointFile,
  loadStoredCheckpoints,
  loadStoredExamples,
  readCheckpointFile,
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
import { recordFunnelEvent } from '../../services/funnelLog'
import { computeNextStep, detectMistakeSignal } from '../../services/workbenchFlow'
import type { ArenaCamera } from './ArenaWorldView'
import type { FxCue } from './WorldFX'
import { ErrorBoundary } from '../utils/ErrorBoundary'
import { AgentCard } from '../workbench/AgentCard'
import { BeatTimeline } from '../workbench/BeatTimeline'
import { BootScreen } from '../workbench/BootScreen'
import { BrandHeader } from '../workbench/BrandHeader'
import { CoachPanel } from '../workbench/CoachPanel'
import { LessonComparison } from '../workbench/LessonComparison'
import { HelpDrawer } from '../workbench/HelpDrawer'
import { ReplayPanel } from '../workbench/ReplayPanel'
import { TournamentBracket } from '../workbench/TournamentBracket'
import { ViewportHud, type HudFeedEvent } from '../workbench/ViewportHud'
import { actionsEqual, COACH_ANYTIME_KEY, COACH_MISTAKE_KEY, COACH_NUDGE_KEY, isExecutableCheckpoint, PLAY_HINT_KEY, readHintDismissed, routeLabel } from '../workbench/readouts'
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
  const [hasCompletedRun, setHasCompletedRun] = useState(false)
  const [mistakeMoment, setMistakeMoment] = useState<{ tick: number; headline: string; detail: string } | null>(null)
  const [trainFocusLine, setTrainFocusLine] = useState<string | null>(null)
  const [modeBanner, setModeBanner] = useState<CoursePlayMode | null>(null)
  const [runTip, setRunTip] = useState<string | null>(null)
  const floodWarnedRef = useRef<number | null>(null)
  const lastEncounterTickRef = useRef<number | null>(null)
  const modeBannerTimer = useRef<number | null>(null)
  const runTipTimer = useRef<number | null>(null)
  const mistakeTimer = useRef<number | null>(null)
  const prevRecoveriesRef = useRef(0)
  const prevObservedTickRef = useRef(0)
  const [speed, setSpeedState] = useState<SessionSpeed>(1)
  const speedRef = useRef<SessionSpeed>(1)
  // Director's track: a headless clone of this run computes where the beats
  // will land. Keyed by matchId so a reset/mode switch can't serve stale
  // predictions; built once on run start (deferred a task so Play doesn't
  // eat the whole match's sim cost inside the click). State, not a ref —
  // the skip button's label renders from it.
  const [director, setDirector] = useState<{ matchId: string; moments: MatchMoment[] } | null>(null)
  // World-space dramatization cue for clash/sighting beats — the scene owns
  // detection (and the card); the cue carries positions at detection time so
  // the world can animate the beat even while the run is paused.
  const [fxCue, setFxCue] = useState<FxCue | null>(null)
  const applySpeed = useCallback((next: SessionSpeed) => {
    speedRef.current = next
    session.setSpeed(next)
    setSpeedState(next)
  }, [session])
  const checkpoints = useArenaStore(state => state.checkpoints)
  // True once the user owns a brain that isn't a bundled built-in (trained
  // or imported) — gates the tournament bracket, which is framed around
  // "your trained champion vs the house field".
  const hasOwnBrain = checkpoints.some(checkpoint =>
    isExecutableCheckpoint(checkpoint)
    && !isBundledStarter(checkpoint)
    && checkpoint.id !== SEASON_0_BASE_CHECKPOINT.id,
  )
  const setCheckpoints = useArenaStore(state => state.setCheckpoints)
  const activeCheckpoint = useArenaStore(state => state.activeCheckpoint)
  const setActiveCheckpoint = useArenaStore(state => state.setActiveCheckpoint)
  const examples = useArenaStore(state => state.examples)
  const setExamples = useArenaStore(state => state.setExamples)
  const [frameAdvice, setFrameAdvice] = useState<{ taken: ArenaAction; atTick: number; observation: ArenaObservation; candidates: CoachingCandidate[] } | null>(null)
  const [promptText, setPromptText] = useState('')
  const [isTraining, setIsTraining] = useState(false)
  const [trainMessage, setTrainMessage] = useState<string | null>(null)
  const [comparison, setComparison] = useState<PracticeComparison | null>(null)
  const [comparisonReviewing, setComparisonReviewing] = useState<'baseline' | 'trained' | null>(null)
  const [coachSelection, setCoachSelection] = useState<{ recording: ArenaRecording; replayIndex: number; tick: number; action: ArenaAction } | null>(null)
  const [feed, setFeed] = useState<HudFeedEvent[]>([])
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const [clipArmed, setClipArmed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const exampleCounter = useRef(0)
  const trainAbortRef = useRef<AbortController | null>(null)
  const trainTimerRef = useRef<number | null>(null)
  const trainingBusyRef = useRef(false)
  const importAbortRef = useRef<AbortController | null>(null)
  const comparisonRef = useRef<HTMLDivElement | null>(null)
  const soundRef = useRef<ArenaSound | null>(null)
  const [soundState, setSoundState] = useState<'off' | 'on' | 'unavailable'>(() =>
    ArenaSound.supported() ? 'off' : 'unavailable',
  )
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

  const onReady = useCallback(() => { setVisualReady(true); recordFunnelEvent('boot.ready') }, [])
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
    const executable = storedCheckpoints.filter(isExecutableCheckpoint)
    const legacy = storedCheckpoints.filter(c => !isExecutableCheckpoint(c))
    if (storedCheckpoints.length > 0) {
      store.setCheckpoints([...executable, ...legacy])
      if (legacy.length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot boot read of localStorage; the quarantine notice must land before first paint
        setTrainMessage(
          `${legacy.length} stored brain${legacy.length === 1 ? ' is' : 's are'} view-only (v1 schema) — re-train ${legacy.length === 1 ? 'its' : 'their'} examples to upgrade.`,
        )
      }
    }
    // Always install a live brain: prefer a user-owned executable
    // checkpoint, then the bundled starter, then whatever is stored (the
    // untrained base MLP wanders and banks ~0 — last resort only).
    const first = executable.find(c => !isBundledStarter(c) && c.id !== SEASON_0_BASE_CHECKPOINT.id)
      ?? executable.find(isBundledStarter)
      ?? executable[0]
      ?? SEASON_0_STARTER_CHECKPOINT
    store.setActiveCheckpoint(first)
    try {
      session.setCheckpoint(first)
      session.selectPolicy('champion', 'learned', first)
    } catch (err) {
      setTrainMessage(`Stored brain refused: ${err instanceof Error ? err.message : 'incompatible checkpoint'}`)
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
    recordFunnelEvent('tip.flood', `in=${nextFloodIn}s`)
    // An approaching flood is a watchable beat — pull FF back to real time.
    if (speedRef.current > 1) applySpeed(1)
    setRunTip(`Flood in ${nextFloodIn}s — amber valley slows. Take the ridge.`)
    if (runTipTimer.current) window.clearTimeout(runTipTimer.current)
    runTipTimer.current = window.setTimeout(() => setRunTip(null), 5200)
  }, [view.phase, view.episode.tick, flooded, nextFloodIn, activeCourse.scenario.floods, applySpeed])

  // Mid-run coaching discoverability: coaching is legal any time in Practice
  // (the lock is compete-only), but nothing told the user that — they watched
  // a full ~60s round before the finish nudge. One-shot tip ~10s in, deferred
  // while a flood tip is already up, and skipped once the stronger
  // mistake-moment banner has surfaced.
  useEffect(() => {
    if (view.phase !== 'running' || playMode !== 'practice') return
    if (view.episode.tick < 200 || runTip) return
    try {
      if (window.sessionStorage.getItem(COACH_ANYTIME_KEY) === '1'
        || window.sessionStorage.getItem(COACH_MISTAKE_KEY) === '1') return
      window.sessionStorage.setItem(COACH_ANYTIME_KEY, '1')
    } catch { /* ignore */ }
    recordFunnelEvent('tip.midrun')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot ambient tip, same lifecycle contract as the flood warning above
    setRunTip('Practice lets you coach mid-run — Pause anytime and open Coach to teach a moment.')
    if (runTipTimer.current) window.clearTimeout(runTipTimer.current)
    runTipTimer.current = window.setTimeout(() => setRunTip(null), 5200)
  }, [view.phase, view.episode.tick, playMode, runTip])

  // First-mistake trigger: the first *visible* champion error in Practice —
  // a rescue, a non-cadence rejection, or a flood-caught transit — surfaces
  // a "coach that moment" card that jumps straight into review of that
  // frame. Once per session; in-transit rejections are cadence noise and
  // invisible to the player, so they never trigger.
  useEffect(() => {
    if (view.phase !== 'running' || playMode !== 'practice') return
    if (mistakeMoment) return
    try {
      if (window.sessionStorage.getItem(COACH_MISTAKE_KEY) === '1') return
    } catch { /* ignore */ }
    const championAgent = view.episode.agents.find(agent => agent.id === 'champion')
    if (!championAgent) return
    const signal = detectMistakeSignal({
      tick: view.episode.tick,
      flooded,
      recoveries: championAgent.recoveries,
      prevRecoveries: prevRecoveriesRef.current,
      lastOutcome: championAgent.lastOutcome,
      transitEdgeId: championAgent.transit?.edgeId ?? null,
      floodableEdgeIds: new Set(activeCourse.scenario.edges.filter(e => e.floodable).map(e => e.id)),
      sinceTick: prevObservedTickRef.current,
    })
    // Re-sync the cursors every observed tick — a reset dropping recoveries
    // below the ref must not wedge the next run's first rescue, and a
    // fast-forward pump must not make a fresh rejection look stale.
    prevRecoveriesRef.current = championAgent.recoveries
    prevObservedTickRef.current = view.episode.tick
    if (!signal) return
    try { window.sessionStorage.setItem(COACH_MISTAKE_KEY, '1') } catch { /* ignore */ }
    recordFunnelEvent('mistake.shown', signal.headline)
    // Coachable moments pull the match back to real time.
    if (speedRef.current > 1) applySpeed(1)
    setMistakeMoment({ tick: view.episode.tick, ...signal })
    if (mistakeTimer.current) window.clearTimeout(mistakeTimer.current)
    mistakeTimer.current = window.setTimeout(() => {
      setMistakeMoment(null)
      recordFunnelEvent('mistake.timeout')
    }, 15000)
  }, [view.phase, view.episode, playMode, mistakeMoment, flooded, activeCourse.scenario.edges, applySpeed])

  // Funnel: first paint of the play hint, each coach-studio open, and the
  // moment a user-owned brain exists (tournament unlock) — the three
  // disclosures whose conversion decides whether the ladder works.
  const playTipLoggedRef = useRef(false)
  const ownBrainLoggedRef = useRef(false)
  useEffect(() => {
    if (playTipLoggedRef.current || !visualReady || !hintOpen || view.phase !== 'ready') return
    playTipLoggedRef.current = true
    recordFunnelEvent('tip.play')
  }, [visualReady, hintOpen, view.phase])
  useEffect(() => {
    if (studioOpen) recordFunnelEvent('studio.open')
  }, [studioOpen])
  useEffect(() => {
    if (ownBrainLoggedRef.current || !hasOwnBrain) return
    ownBrainLoggedRef.current = true
    recordFunnelEvent('brain.own')
  }, [hasOwnBrain])

  // Clear the moment card when play leaves the live phases — finished has
  // its own coach nudge and review is already the destination.
  useEffect(() => {
    if (view.phase === 'running' || view.phase === 'paused') return
    if (mistakeTimer.current) {
      window.clearTimeout(mistakeTimer.current)
      mistakeTimer.current = null
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the card is scoped to the live run it was raised from
    setMistakeMoment(null)
  }, [view.phase])

  useEffect(() => () => {
    if (modeBannerTimer.current) window.clearTimeout(modeBannerTimer.current)
    if (runTipTimer.current) window.clearTimeout(runTipTimer.current)
    if (mistakeTimer.current) window.clearTimeout(mistakeTimer.current)
  }, [])

  // Jump the mistake moment straight into replay review: pause, review the
  // live recording, seek to the decision frame that produced the signal,
  // and open the Coach studio so the frame's fixes are one click away.
  const coachMistake = useCallback(() => {
    if (!mistakeMoment) return
    if (mistakeTimer.current) {
      window.clearTimeout(mistakeTimer.current)
      mistakeTimer.current = null
    }
    try {
      session.pause()
      session.review()
      session.seek(Math.floor(mistakeMoment.tick / ARENA_RULES.decisionEveryTicks))
    } catch {
      // Session may already be reviewing, or the frame index raced a trim —
      // the studio still gives the user the coaching path.
    }
    recordFunnelEvent('mistake.coach', `t${mistakeMoment.tick}`)
    setStudioOpen(true)
    setMistakeMoment(null)
  }, [mistakeMoment, session])

  const dismissMistake = useCallback(() => {
    if (mistakeTimer.current) {
      window.clearTimeout(mistakeTimer.current)
      mistakeTimer.current = null
    }
    recordFunnelEvent('mistake.dismiss')
    setMistakeMoment(null)
  }, [])

  // Persist a match summary when a round finishes (links active checkpoint).
  // Idempotency by (matchId, payload) lives in the sync engine's meta, so a
  // re-render or remount never double-records the same match.
  const finishedLoggedRef = useRef<string | null>(null)
  useEffect(() => {
    if (view.phase !== 'finished') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first finish unlocks the souvenir controls; phase transitions only land here
    setHasCompletedRun(true)
    const champion = view.episode.agents.find(agent => agent.id === 'champion')
    const rival = view.episode.agents.find(agent => agent.id === 'rival')
    if (finishedLoggedRef.current !== session.matchId) {
      finishedLoggedRef.current = session.matchId
      recordFunnelEvent('run.finished', `mode=${playMode} scored=${view.scored} banked=${champion?.banked ?? 0} winner=${view.episode.winner ?? 'draw'}`)
    }
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
  }, [view.phase, view.episode, view.scored, session, activeCourse.scenario.id, activeCheckpoint.id, examples, playMode])

  useEffect(() => {
    const sound = new ArenaSound(() => setSoundState('unavailable'))
    sound.attach(session)
    soundRef.current = sound
    return () => { sound.dispose(); soundRef.current = null }
  }, [session])

  useEffect(() => {
    const onVisibility = () => {
      const sound = soundRef.current
      if (!sound) return
      if (document.visibilityState === 'hidden') sound.suspend()
      else if (view.phase === 'running') sound.resume()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [view.phase])

  useEffect(() => {
    const sound = soundRef.current
    if (!sound) return
    if (view.phase === 'running') sound.resume()
    else sound.suspend()
  }, [view.phase])

  const toggleSound = useCallback(() => {
    const sound = soundRef.current
    if (!sound || soundState === 'unavailable') return
    if (soundState === 'on') {
      sound.setEnabled(false)
      setSoundState('off')
    } else if (sound.setEnabled(true)) {
      setSoundState('on')
    } else {
      setSoundState('unavailable')
    }
  }, [soundState])

  const pushFeed = useCallback((items: { text: string; tone: 'bank' | 'flood' | 'info' }[]) => {
    if (items.length === 0) return
    const stamped = items.map(item => ({ ...item, id: ++feedId.current }))
    const ids = new Set(stamped.map(event => event.id))
    setFeed(prev => [...prev, ...stamped].slice(-3))
    setTimeout(() => setFeed(prev => prev.filter(event => !ids.has(event.id))), 4500)
  }, [])

  useEffect(() => {
    if (view.phase !== 'running') return
    const episode = session.liveEpisode()
    if (!shouldOfferEncounter({
      phaseRunning: true,
      episode,
      lastEncounterTick: lastEncounterTickRef.current,
    })) return
    lastEncounterTickRef.current = episode.tick
    recordFunnelEvent('encounter.contested')
    setFxCue({
      id: episode.tick * 2,
      kind: 'sighting',
      tick: episode.tick,
      positions: Object.fromEntries(episode.agents.map(agent => [agent.id, [...agent.position]])),
    })
    pushFeed([{ text: 'Contested ground — both rovers are nearby. Routes and pickups decide the score.', tone: 'info' }])
    // A beat worth watching pulls fast-forward back to real time.
    if (speedRef.current > 1) applySpeed(1)
  }, [view.phase, view.episode.tick, session, pushFeed, applySpeed])

  // Passive "rival sighted" beat: near-range proximity that never pauses the
  // sim — a feed note plus a short HUD tip. On the Sandstone course the lanes
  // run ~6m apart, so this is what turns "two parallel time trials" into a
  // match the player can feel; the contested-ground cue owns the close band.
  const lastSightingTickRef = useRef<number | null>(null)
  const sightingCountRef = useRef(0)
  useEffect(() => {
    if (view.phase !== 'running' || runTip) return
    const episode = session.liveEpisode()
    if (!shouldOfferSighting({
      phaseRunning: true,
      episode,
      lastEncounterTick: lastEncounterTickRef.current,
      lastSightingTick: lastSightingTickRef.current,
      sightingCount: sightingCountRef.current,
    })) return
    lastSightingTickRef.current = episode.tick
    sightingCountRef.current += 1
    const distance = encounterDistance(episode)
    recordFunnelEvent('encounter.sighted', distance !== null ? `d=${distance.toFixed(1)}m` : undefined)
    setFxCue({
      id: episode.tick * 2 + 1,
      kind: 'sighting',
      tick: episode.tick,
      positions: Object.fromEntries(episode.agents.map(agent => [agent.id, [...agent.position]])),
    })
    pushFeed([{ text: 'Rival sighted on the same stretch — close enough to contest.', tone: 'info' }])
    // A beat worth watching pulls fast-forward back to real time.
    if (speedRef.current > 1) applySpeed(1)
    setRunTip('Rival sighted nearby — contested ground is presentation only; routes and pickups decide the score.')
    if (runTipTimer.current) window.clearTimeout(runTipTimer.current)
    runTipTimer.current = window.setTimeout(() => setRunTip(null), 4200)
  }, [view.phase, view.episode.tick, runTip, session, pushFeed, applySpeed])

  // Director's track: once per match, run a headless clone of this episode
  // (same scenario, same locked policies/checkpoint, same physics adapter)
  // and record where the beats land — contested proximity is forecast as a
  // presentation beat only; it never mutates the predicted score. Powers
  // "Skip to next moment" and drops the user a few ticks ahead of each beat.
  useEffect(() => {
    // First publish after start can already be tick ~5 (HUD throttle) — the
    // build window is wide enough to catch it, narrow enough that a resume
    // mid-match never rebuilds.
    if (view.phase !== 'running' || view.episode.tick > 10) return
    if (director?.matchId === session.matchId) return
    const matchId = session.matchId
    const scenario = activeCourse.scenario
    // A learned entrant without its checkpoint in view means the session is
    // running a brain the director can't see — skip the forecast rather than
    // predict the wrong match.
    if (Object.values(view.policies).includes('learned') && !view.checkpoint) return
    const options: Record<string, EntrantPolicyOption> = {}
    for (const [id, strategy] of Object.entries(view.policies)) {
      options[id] = strategy === 'learned' ? { strategy: 'learned', checkpoint: view.checkpoint! } : strategy
    }
    const timer = window.setTimeout(() => {
      try {
        const moments = buildMatchTimeline(scenario, options, createMotion)
        setDirector({ matchId, moments })
      } catch {
        // No forecast, no problem — Skip still falls through to the finish.
        setDirector({ matchId, moments: [{ tick: scenario.durationTicks, kind: 'finish' }] })
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [view.phase, view.episode.tick, session, activeCourse.scenario, view.policies, view.checkpoint, createMotion, director])

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
    trainAbortRef.current?.abort()
    importAbortRef.current?.abort()
    importAbortRef.current = null
    trainingBusyRef.current = false
    if (trainTimerRef.current !== null) window.clearTimeout(trainTimerRef.current)
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
    if (!match.recording || view.phase === 'running' || isTraining) return
    setCinematic(true)
    session.reviewFrom(match.recording)
  }

  const primaryAction = () => {
    if (isTraining) return
    if (view.phase === 'error') { onRetry(); return }
    if (view.phase === 'review') { setCinematic(false); session.returnToRun(); return }
    if (view.phase === 'running') { session.pause(); return }
    if (view.phase === 'finished') session.reset()
    setHintOpen(false)
    if (follow === 'overview') setFollow('champion')
    recordFunnelEvent('run.start', `mode=${playMode} from=${view.phase}`)
    session.start()
  }
  const primaryLabel = view.phase === 'running' ? 'Pause' : view.phase === 'paused' ? 'Resume' : view.phase === 'finished' ? 'Play again' : view.phase === 'review' ? 'Back to match' : view.phase === 'error' ? 'Reload world' : 'Play'

  // Fast-forward is pure presentation: the episode is deterministic and the
  // checkpoint is locked at start, so skipping can never change the result —
  // it only trades away live observation. The beats pull playback back to
  // 1× on their own (see the sighting/mistake/flood effects), so the user
  // can't FF past the moments they'd want to coach.
  const cycleSpeed = () => {
    const next = SESSION_SPEEDS[(SESSION_SPEEDS.indexOf(speed) + 1) % SESSION_SPEEDS.length]
    recordFunnelEvent('run.speed', `${next}x`)
    applySpeed(next)
  }

  const liveDirector = director?.matchId === session.matchId ? director : null
  const upcomingMoment = liveDirector ? nextMomentAfter(liveDirector.moments, view.episode.tick) : null

  const skipAhead = () => {
    const live = session.liveEpisode()
    const upcoming = liveDirector ? nextMomentAfter(liveDirector.moments, live.tick) : null
    recordFunnelEvent('run.skip', upcoming ? `${upcoming.kind}@t${upcoming.tick}` : 'finish')
    // Land at real time just ahead of the beat so the approach is watchable;
    // the beats are presentation only, so skipping can never cost the user a
    // scoring swing — it only skips live observation.
    applySpeed(1)
    if (upcoming) {
      session.skipToTick(Math.max(live.tick + 1, upcoming.tick - MOMENT_LEAD_TICKS[upcoming.kind]))
    } else {
      session.skipToEnd()
    }
  }

  // Space / P toggles play-pause, except while typing or while a button has
  // focus (space already activates it).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
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
    if (view.phase !== 'ready' || mode === playMode || isTraining) return
    setCoachSelection(null)
    const next = applyCourseMode(course, mode)
    setPlayMode(mode)
    setActiveCourse(next)
    recordFunnelEvent('mode.select', mode)
    session.setCourse(next)
    session.setScored(mode === 'compete')
    if (mode === 'compete') setStudioOpen(false)
    floodWarnedRef.current = null
    setRunTip(null)
    lastEncounterTickRef.current = null
    lastSightingTickRef.current = null
    sightingCountRef.current = 0
    setDirector(null)
    setComparison(null)
    setComparisonReviewing(null)
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

  const handlePropose = (text: string) => {
    if (isTraining || view.phase === 'running') return
    if (coachingLocked) {
      setTrainMessage('This is a scored match. Switch to Practice to coach and train.')
      return
    }
    if (!text.trim()) return
    if (!coachContext || !reviewRecording) {
      setTrainMessage('Replay a recorded decision first — open Replay and scrub to a decision frame.')
      return
    }
    const example = proposeCorrection(text, coachContext.observation, coachContext.originalAction, reviewRecording.scenario.id)
    if (example) {
      setExamples(prev => [example, ...prev])
      recordFunnelEvent('example.draft', 'prompt')
      setPromptText('')
      setStudioOpen(true)
      setTrainMessage(`Proposed a fix at ${example.tick}: ${example.rationale} Approve it, then train.`)
    } else {
      setTrainMessage(`Could not find a valid legal action matching that guidance for tick ${coachContext.tick}.`)
    }
  }

  const handleExportCheckpoint = () => {
    downloadCheckpointFile(activeCheckpoint)
    setTrainMessage(`Exported checkpoint file: ${activeCheckpoint.name}`)
  }

  const handleImportClick = () => {
    if (isTraining || trainingBusyRef.current || view.phase !== 'ready' || coachingLocked) return
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    importAbortRef.current?.abort()
    const controller = new AbortController()
    importAbortRef.current = controller
    // The read may complete after the user started a run or training —
    // re-check the live snapshot and busy flag instead of render-time state.
    const canImport = () => {
      if (trainingBusyRef.current) return false
      const snap = session.getSnapshot()
      return snap.phase === 'ready' && !snap.scored
    }
    readCheckpointFile(file, canImport, controller.signal)
      .then(imported => {
        if (importAbortRef.current !== controller || controller.signal.aborted) return
        importAbortRef.current = null
        if (fileInputRef.current) fileInputRef.current.value = ''
        if (!canImport()) {
          setTrainMessage('Import refused: reset to a fresh Practice setup first.')
          return
        }
        setCheckpoints(prev => {
          const filtered = prev.filter(c => c.id !== imported.id)
          return [imported, ...filtered]
        })
        if (!isExecutableCheckpoint(imported)) {
          setTrainMessage(`Imported ${imported.name} as view-only. ${viewOnlyCheckpointMessage(imported)}`)
          return
        }
        try {
          session.setCheckpoint(imported)
          session.selectPolicy('champion', 'learned', imported)
          setActiveCheckpoint(imported)
          setComparison(null)
          setComparisonReviewing(null)
          setCoachSelection(null)
          setTrainMessage(`Successfully imported checkpoint: ${imported.name} (${imported.weightsHash.slice(0, 14)})`)
        } catch (err) {
          setTrainMessage(`Imported ${imported.name} but could not make it active: ${err instanceof Error ? err.message : 'incompatible checkpoint'}`)
        }
      })
      .catch(err => {
        if (importAbortRef.current !== controller || controller.signal.aborted) return
        importAbortRef.current = null
        if (fileInputRef.current) fileInputRef.current.value = ''
        if (err instanceof Error && err.name === 'AbortError') {
          if (!canImport()) setTrainMessage('Import refused: reset to a fresh Practice setup first.')
          return
        }
        setTrainMessage(`Import failed: ${err instanceof Error ? err.message : 'Invalid checkpoint file'}`)
      })
  }

  const toggleApprove = (id: string) => {
    if (isTraining || view.phase === 'running' || coachingLocked) return
    const target = examples.find(ex => ex.id === id)
    if (!target) return
    if (isEvaluationScenario(target.sourceEpisodeId)) {
      setTrainMessage(`Cannot approve an example from held-out scenario "${target.sourceEpisodeId}". It is reserved for evaluation.`)
      return
    }
    const approved = !target.approved
    recordFunnelEvent(approved ? 'example.approve' : 'example.unapprove', `t${target.tick}`)
    setExamples(prev => prev.map(ex => ex.id === id ? { ...ex, approved, source: approved ? 'approved' as const : 'draft' as const } : ex))
  }

  const removeExample = (id: string) => {
    if (isTraining || view.phase === 'running' || coachingLocked) return
    // Tombstone-propagating delete: the old local-only filter silently
    // diverged every other device.
    deleteExampleRecord(id)
  }

  const handleTrain = () => {
    if (coachingLocked) {
      setTrainMessage('This is a scored match. Switch to Practice to coach and train.')
      return
    }
    if (isTraining || trainingBusyRef.current || view.phase === 'running') return
    if (examples.filter(e => e.approved).length === 0) return
    rejectEvaluationExamples(examples.filter(e => e.approved))

    if (activeCourse.scenario.split !== 'practice' || isEvaluationScenario(activeCourse.scenario.id)) {
      setTrainMessage('Training needs a practice scenario — a held-out recording is never used as a coaching prompt source.')
      return
    }
    const parent = structuredClone(activeCheckpoint)
    const approved = structuredClone(examples.filter(e => e.approved))
    const practiceScenario = structuredClone(activeCourse.scenario)
    const rivalOption: EntrantPolicyOption = view.policies.rival === 'learned'
      ? { strategy: 'learned', checkpoint: parent }
      : view.policies.rival
    const controllerVersion = view.episode.controllerVersion
    const abort = new AbortController()
    trainAbortRef.current?.abort()
    trainAbortRef.current = abort
    importAbortRef.current?.abort()
    importAbortRef.current = null
    if (fileInputRef.current) fileInputRef.current.value = ''
    trainingBusyRef.current = true

    setIsTraining(true)
    setTrainMessage('Teaching from the approved notes…')
    setComparison(null)
    setComparisonReviewing(null)
    setCoachSelection(null)

    if (trainTimerRef.current !== null) window.clearTimeout(trainTimerRef.current)
    trainTimerRef.current = window.setTimeout(() => {
      trainTimerRef.current = null
      if (abort.signal.aborted) { trainingBusyRef.current = false; return }
      const jobId = `train-${Date.now().toString(36)}`
      let trained: PolicyCheckpoint
      try {
        queueTrainingJobSync({
          jobId,
          status: 'running',
          parentCheckpointId: parent.id,
          resultCheckpointId: null,
          exampleCount: approved.length,
          message: null,
        })
        trained = trainPolicyCheckpoint(parent, approved, {
          // Browser coach-train config, pinned in versions.test.ts and
          // docs/COMPATIBILITY.md: 60 epochs, lr 0.008 with a deterministic
          // 0.5x step at epoch 30 (few-shot stable; the old 100/0.02 ran
          // hot enough to diverge on ~10-example lessons).
          epochs: 60,
          learningRate: 0.008,
          learningRateDecay: { atEpoch: 30, factor: 0.5 },
          name: `${championIdentity.name} v${checkpoints.length} (+${approved.length})`,
        })
        setCheckpoints(prev => [trained, ...prev])
        queueCheckpointSync(trained, approved.map(example => example.id))
      } catch (err) {
        trainingBusyRef.current = false
        setIsTraining(false)
        setTrainMessage(`Training failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
        queueTrainingJobSync({
          jobId,
          status: 'failed',
          parentCheckpointId: parent.id,
          resultCheckpointId: null,
          exampleCount: approved.length,
          message: err instanceof Error ? err.message : 'Unknown error',
        })
        return
      }

      const finishTraining = (message: string) => {
        trainingBusyRef.current = false
        setIsTraining(false)
        setTrainMessage(message)
        queueTrainingJobSync({
          jobId,
          status: 'succeeded',
          parentCheckpointId: parent.id,
          resultCheckpointId: trained.id,
          exampleCount: approved.length,
          message: `loss ${trained.trainingSummary.loss.toFixed(4)}`,
        })
      }
      const adoptChild = (): boolean => {
        try { session.reset() } catch (err) {
          setTrainMessage(`Trained brain saved but the session could not reset: ${err instanceof Error ? err.message : 'unknown error'}`)
          return false
        }
        try {
          session.setCheckpoint(trained)
          session.selectPolicy('champion', 'learned', trained)
          setActiveCheckpoint(trained)
          return true
        } catch (err) {
          setTrainMessage(`Trained brain saved but could not be loaded: ${err instanceof Error ? err.message : 'incompatible checkpoint'}`)
          return false
        }
      }
      const focusLine = summarizeCoachFocus(approved)
      setTrainFocusLine(focusLine)
      const lossLine = `Loss ${trained.trainingSummary.loss.toFixed(4)} · ${(trained.trainingSummary.accuracy * 100).toFixed(0)}% of the notes landed.`
      setTrainMessage('Training complete — comparing recorded practice runs…')
      comparePracticeCheckpoints(parent, trained, practiceScenario, createMotion, {
        rival: rivalOption,
        controllerVersion,
        signal: abort.signal,
      }).then(result => {
        if (abort.signal.aborted) { trainingBusyRef.current = false; return }
        setComparison(result)
        requestAnimationFrame(() => comparisonRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
        const adopted = adoptChild()
        recordFunnelEvent('train.done', `n=${approved.length} loss=${trained.trainingSummary.loss.toFixed(4)} banked ${result.baseline.banked}→${result.trained.banked}`)
        if (!adopted) { trainingBusyRef.current = false; setIsTraining(false); return }
        finishTraining(
          focusLine
            ? `Training complete. ${focusLine} ${lossLine} Compare the recorded runs below.`
            : `Training complete. ${lossLine} Compare the recorded runs below.`,
        )
      }).catch(err => {
        if (abort.signal.aborted) { trainingBusyRef.current = false; return }
        const adopted = adoptChild()
        recordFunnelEvent('train.done', `n=${approved.length} comparison-unavailable`)
        if (!adopted) { trainingBusyRef.current = false; setIsTraining(false); return }
        finishTraining(`Training complete; physical comparison unavailable (${err instanceof Error ? err.message : 'unknown error'}). The new brain is saved — ${lossLine}`)
      })
    }, 0)
  }

  const reviewRecording = view.phase === 'review' ? session.activeRecording() : null
  const coachContext = (() => {
    if (!reviewRecording || coachingLocked) return null
    try {
      return recordedCoachContext(reviewRecording, view.replayIndex)
    } catch {
      return null
    }
  })()

  const selectedCoachAction = coachSelection && coachContext && reviewRecording
    && coachSelection.recording === reviewRecording
    && coachSelection.replayIndex === view.replayIndex
    && coachSelection.tick === coachContext.tick
    && coachContext.alternatives.some(candidate => actionsEqual(candidate, coachSelection.action))
    ? coachSelection.action
    : null

  const coachMoveChoices = coachContext
    ? coachContext.alternatives
        .filter((action): action is ArenaAction & { edgeId: string } => action.type === 'move' && 'edgeId' in action)
        .map(action => ({ edgeId: action.edgeId }))
    : undefined
  const coachOriginalEdgeId = coachContext && coachContext.originalAction.type === 'move' && 'edgeId' in coachContext.originalAction
    ? (coachContext.originalAction as { edgeId: string }).edgeId
    : null
  const selectedCoachEdgeId = selectedCoachAction && selectedCoachAction.type === 'move' && 'edgeId' in selectedCoachAction
    ? (selectedCoachAction as { edgeId: string }).edgeId
    : null

  const handleCoachSelect = (action: ArenaAction) => {
    if (coachingLocked || isTraining || view.phase === 'running' || !coachContext || !reviewRecording) return
    setCoachSelection({ recording: reviewRecording, replayIndex: view.replayIndex, tick: coachContext.tick, action })
  }

  const handleCoachEdge = (edgeId: string) => {
    if (coachingLocked || isTraining || view.phase === 'running' || !coachContext || !reviewRecording) return
    const action = coachContext.alternatives.find(
      candidate => candidate.type === 'move' && 'edgeId' in candidate && (candidate as { edgeId: string }).edgeId === edgeId,
    )
    if (action) setCoachSelection({ recording: reviewRecording, replayIndex: view.replayIndex, tick: coachContext.tick, action })
  }

  const handleQueueCorrection = () => {
    if (coachingLocked || isTraining || view.phase === 'running' || !coachContext || !selectedCoachAction || !reviewRecording) return
    exampleCounter.current += 1
    try {
      const example = draftRecordedCorrection(
        coachContext,
        selectedCoachAction,
        reviewRecording.scenario.id,
        `coach-${coachContext.tick}-${exampleCounter.current.toString(36)}`,
      )
      setExamples(prev => [example, ...prev])
      recordFunnelEvent('example.draft', 'recorded')
      setStudioOpen(true)
      setCoachSelection(null)
      setTrainMessage(`Draft correction queued at tick ${example.tick}. Approve it, then train.`)
    } catch (err) {
      setTrainMessage(`Could not draft that correction: ${err instanceof Error ? err.message : 'unsupported alternative'}`)
    }
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

  const handleSelectCheckpoint = (ckptId: string) => {
    if (isTraining || trainingBusyRef.current || view.phase === 'running') return
    if (view.phase !== 'ready') {
      setTrainMessage('Reset to a fresh setup before changing the active brain.')
      return
    }
    const selected = checkpoints.find(c => c.id === ckptId)
    if (!selected) return
    if (!isExecutableCheckpoint(selected)) {
      setTrainMessage(viewOnlyCheckpointMessage(selected))
      return
    }
    try {
      session.setCheckpoint(selected)
      session.selectPolicy('champion', 'learned', selected)
    } catch (err) {
      setTrainMessage(`Brain refused: ${err instanceof Error ? err.message : 'incompatible checkpoint'}`)
      return
    }
    setActiveCheckpoint(selected)
    setComparison(null)
    setComparisonReviewing(null)
    setCoachSelection(null)
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
  const championFocus = approvedCount > 0
    ? focusVectorForChampion(examples.filter(example => example.approved))
    : null

  const ghostPose = comparison && comparisonReviewing && view.phase === 'review'
    ? (() => {
        const other = comparisonReviewing === 'trained' ? comparison.baseline : comparison.trained
        const label = comparisonReviewing === 'trained' ? 'Parent' : 'New'
        const frame = comparisonFrameAt(other.recording, view.episode.tick)
        const agentState = frame?.agents.find(agent => agent.id === 'champion')
        return agentState ? { position: agentState.position, label } : null
      })()
    : null

  const reviewComparisonRun = (which: 'baseline' | 'trained') => {
    if (!comparison || isTraining || view.phase === 'running') return
    try {
      session.reviewFrom(comparison[which].recording)
    } catch (err) {
      setTrainMessage(`Could not open that recorded run: ${err instanceof Error ? err.message : 'unknown error'}`)
      return
    }
    setComparisonReviewing(which)
    setCinematic(false)
  }

  const jumpToDivergence = () => {
    if (!comparison?.firstDivergence || isTraining || view.phase === 'running') return
    if (view.phase !== 'review' || comparisonReviewing !== 'trained') reviewComparisonRun('trained')
    const divergence = comparison.firstDivergence
    const frames = comparison.trained.recording.checkpoints
    let best = 0
    let bestDistance = Infinity
    frames.forEach((frame, index) => {
      const distance = Math.abs(frame.state.tick - divergence.tick)
      if (distance < bestDistance) { bestDistance = distance; best = index }
    })
    try { session.seek(best) } catch { /* frame may have raced a trim */ }
  }

  const resetForTeaching = useCallback(() => {
    floodWarnedRef.current = null
    setDirector(null)
    setComparison(null)
    setComparisonReviewing(null)
    setCoachSelection(null)
    setRunTip(null)
    session.reset()
  }, [session])

  const championIntent = !champion
    ? null
    : champion.transit
      ? `Heading to ${champion.transit.to} · ${routeLabel(champion.transit.edgeId)}`
      : champion.lastOutcome?.action?.type === 'wait'
        ? 'Waiting / recharging'
        : null

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
    if (isTraining) return
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
      <div className={styles.controlBar}>
        {(view.phase === 'running' || view.phase === 'paused') && (
          <BeatTimeline
            moments={liveDirector?.moments ?? null}
            floods={activeCourse.scenario.floods}
            tick={view.episode.tick}
            durationTicks={activeCourse.scenario.durationTicks}
            onJump={target => { applySpeed(1); session.skipToTick(Math.max(view.episode.tick + 1, target)) }}
          />
        )}
        <div className={styles.mainControls}>
          <button
            className={`${styles.primaryButton}${visualReady && hintOpen && view.phase === 'ready' ? ` ${styles.playPulse}` : ''}`}
            onClick={primaryAction}
            disabled={(!visualReady && view.phase !== 'error') || isTraining}
          >
            {view.phase === 'running' ? <Pause size={16} /> : <Play size={16} />}
            {primaryLabel}
          </button>
          {(view.phase === 'running' || view.phase === 'paused') && (
            <>
              <button
                className={styles.secondaryButton}
                onClick={cycleSpeed}
                title="Playback speed — presentation only; the sim stays deterministic"
              >
                <FastForward size={15} />{speed}×
              </button>
              <button
                className={styles.secondaryButton}
                onClick={skipAhead}
                disabled={!visualReady}
                title={upcomingMoment && upcomingMoment.kind !== 'finish'
                  ? `Skip ahead to the next ${MOMENT_LABELS[upcomingMoment.kind]}`
                  : 'Skip to the final whistle'}
              >
                <SkipForward size={15} />Skip{upcomingMoment && upcomingMoment.kind !== 'finish' ? ` · ${MOMENT_LABELS[upcomingMoment.kind]}` : ''}
              </button>
            </>
          )}
          <button className={styles.secondaryButton} onClick={() => { setCinematic(false); floodWarnedRef.current = null; lastEncounterTickRef.current = null; lastSightingTickRef.current = null; sightingCountRef.current = 0; setDirector(null); setComparison(null); setComparisonReviewing(null); setCoachSelection(null); setRunTip(null); session.reset() }} disabled={!visualReady || view.phase === 'error' || isTraining}><RotateCcw size={15} />Reset</button>
          <button className={styles.secondaryButton} onClick={() => session.review()} disabled={(view.phase !== 'paused' && view.phase !== 'finished') || isTraining}><Eye size={16} />Replay</button>
          {(hasCompletedRun || view.phase !== 'ready' || view.episode.tick > 0) && (
            <button
              className={styles.secondaryButton}
              type="button"
              aria-pressed={clipArmed}
              disabled={view.phase === 'finished' || view.phase === 'error' || view.phase === 'review' || isTraining}
              onClick={() => setClipArmed(armed => !armed)}
              title={clipArmed ? 'Clip recording armed — encodes while you play' : 'Arm a low-cost souvenir clip for this run'}
            >
              <Clapperboard size={16} />{clipArmed ? 'Record on' : 'Record'}
            </button>
          )}
          <button
            className={styles.secondaryButton}
            aria-pressed={studioOpen}
            onClick={() => setStudioOpen(open => !open)}
            disabled={coachingLocked && examples.length === 0}
          >
            <Sparkles size={15} />{studioOpen ? 'Hide coach' : 'Coach'}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            aria-pressed={soundState === 'on'}
            disabled={soundState === 'unavailable'}
            onClick={toggleSound}
            title="Short synthesized cues for banks, floods and the finish"
          >
            {soundState === 'on' ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {soundState === 'unavailable' ? 'Sound unavailable' : soundState === 'on' ? 'Sound on' : 'Sound off'}
          </button>
        </div>
        <div className={styles.runMeta}>
          <span>{view.episode.tick} / {activeCourse.scenario.durationTicks}</span>
          {view.episode.tick > 0 && (
            <button onClick={download} aria-label="Download recorded run"><Download size={16} />Save run</button>
          )}
        </div>
      </div>
      <div className={styles.workbench} data-mode={playMode} data-world-ready={visualReady} data-coach={studioOpen}>
        <section className={styles.viewport} aria-label="Generated world and autonomous rovers">
          <div className={styles.canvas} data-ready={visualReady}>
            <ErrorBoundary onError={onError} fallback={<div className={styles.canvasError}><h2>The world view could not start.</h2><button onClick={onRetry}>Reload world</button></div>}>
              <WorldView
                course={activeCourse}
                session={session}
                follow={follow}
                cinematic={cinematic && view.phase === 'review'}
                coachOriginalEdgeId={coachOriginalEdgeId}
                coachChoices={coachMoveChoices}
                selectedCoachEdgeId={selectedCoachEdgeId}
                onCoachEdge={coachContext && !coachingLocked ? handleCoachEdge : undefined}
                ghostPose={ghostPose}
                championName={championIdentity.name}
                championAccent={championAccent}
                fxCue={fxCue}
                onReady={onReady}
                onError={onError}
              />
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
            intent={championIntent}
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
              <p><strong>Press Play.</strong> Follow your champion — it runs the house starter brain until you coach it into your own.</p>
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
          {mistakeMoment && (view.phase === 'running' || view.phase === 'paused') && (
            <div className={`${styles.playHint} ${styles.hintEnter}`} role="status">
              <p><strong>{mistakeMoment.headline}.</strong> {mistakeMoment.detail}</p>
              <div className={styles.replayButtons}>
                <button type="button" onClick={coachMistake}>
                  <Sparkles size={14} /> Coach that moment
                </button>
                <button type="button" onClick={dismissMistake} aria-label="Dismiss coaching suggestion">
                  Not now
                </button>
              </div>
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
            <button type="button" aria-pressed={playMode === 'practice'} disabled={view.phase !== 'ready' || isTraining} onClick={() => switchPlayMode('practice')}>Practice</button>
            <button type="button" aria-pressed={playMode === 'compete'} disabled={view.phase !== 'ready' || isTraining} onClick={() => switchPlayMode('compete')}>Match</button>
          </div>
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
              coachContext={coachContext}
              selectedAction={selectedCoachAction}
              frameAdvice={frameAdvice}
              onSeek={frame => { setCinematic(false); session.seek(frame) }}
              onToggleCinematic={() => setCinematic(on => !on)}
              onSelectAction={handleCoachSelect}
              onQueueCorrection={handleQueueCorrection}
            />
          )}
          {view.phase === 'review' ? (
            <details className={styles.fieldDetails}>
              <summary>The field</summary>
              {view.episode.agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  policy={view.policies[agent.id]}
                  unlocked={view.phase === 'ready' && playMode === 'practice' && !isTraining}
                  onPolicy={policy => { if (isTraining || view.phase !== 'ready' || coachingLocked) return; session.selectPolicy(agent.id, policy, activeCheckpoint) }}
                  championIdentity={agent.id === 'champion' ? championIdentity : undefined}
                  onChampionIdentity={agent.id === 'champion' ? onChampionIdentity : undefined}
                  focusVector={agent.id === 'champion' ? championFocus : null}
                  focusNote={agent.id === 'champion' ? 'Training focus (approved notes)' : undefined}
                />
              ))}
            </details>
          ) : (
            view.episode.agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                policy={view.policies[agent.id]}
                unlocked={view.phase === 'ready' && playMode === 'practice' && !isTraining}
                onPolicy={policy => { if (isTraining || view.phase !== 'ready' || coachingLocked) return; session.selectPolicy(agent.id, policy, activeCheckpoint) }}
                championIdentity={agent.id === 'champion' ? championIdentity : undefined}
                onChampionIdentity={agent.id === 'champion' ? onChampionIdentity : undefined}
                focusVector={agent.id === 'champion' ? championFocus : null}
                focusNote={agent.id === 'champion' ? 'Training focus (approved notes)' : undefined}
              />
            ))
          )}
          <div className={styles.ruleCard}>
            <strong>{playMode === 'compete' ? 'Scored match. No coaching.' : 'Collect. Bank. Survive the flood.'}</strong>
            <p>{playMode === 'compete' ? 'Same world, different flood and core layout. Weights stay frozen until you reset to Practice.' : `Grab cores and bank them at base. Floods slow the valley; a drain costs ${ARENA_RULES.drainCost} energy and helps both rovers.`}</p>
            <div className={styles.legend}><span><i />High route</span><span><i />Floodable route</span></div>
          </div>
        </aside>
        {studioOpen && (
          <div className={styles.coachColumn}>
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
            />
          </div>
        )}
      </div>

      <div className={styles.nextStep} role="status">
        <span>Next</span>
        {nextStep.run ? (
          <button type="button" onClick={() => runNextStep(nextStep.run)}>{nextStep.label}</button>
        ) : (
          <strong>{nextStep.label}</strong>
        )}
      </div>

      {comparison && (
        <div ref={comparisonRef}>
          <LessonComparison
            comparison={comparison}
            reviewing={comparisonReviewing}
            onWatch={reviewComparisonRun}
            onJumpToDivergence={jumpToDivergence}
          />
        </div>
      )}

      <details className={styles.tournamentDetails}>
        <summary>Tournament · single elimination</summary>
        {hasOwnBrain ? (
          <TournamentBracket
            tournament={tournament}
            running={tournamentRunning}
            visualReady={visualReady}
            phase={view.phase}
            onRun={runBracket}
            onWatch={watchMatch}
          />
        ) : (
          <section className={styles.replay} aria-label="Tournament bracket">
            <div>
              <strong>Tournament · single elimination</strong>
              <span>Unlocks once you train or import your first brain</span>
            </div>
          </section>
        )}
      </details>

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

