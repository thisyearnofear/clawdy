'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Clapperboard, Download, Eye, FastForward, HelpCircle, Pause, Play, Printer, Radio, RotateCcw, SkipForward, Sparkles, Volume2, VolumeX } from 'lucide-react'
import { ARENA_RULES, observeSnapshot, type ArenaAction, type ArenaObservation, type ArenaRecording } from '../../services/arenaEpisode'
import { loadArenaCourse, selectWorkbenchCourse, type ArenaCourse, type WorkbenchPlayMode } from '../../services/arenaCourse'
import { isEvaluationScenario, rejectEvaluationExamples } from '../../services/arenaScenarios'
import { ArenaSession, SESSION_SPEEDS, type SessionSpeed } from '../../services/arenaSession'
import type { ArenaMotion } from '../../services/arenaPhysics'
import { type EntrantPolicyOption } from '../../services/arenaPolicy'
import { MOMENT_LABELS, MOMENT_LEAD_TICKS, nextMomentAfter, type MatchMoment } from '../../services/matchTimeline'
import { createTournament, runTournament, type ArenaTournament, type TournamentEntrant, type TournamentMatch } from '../../services/arenaTournament'
import { type PolicyCheckpoint, SEASON_0_BASE_CHECKPOINT } from '../../services/policyModel'
import { isBundledStarter, SEASON_0_STARTER_CHECKPOINT } from '../../services/starterCheckpoint'
import { brainForRuleset } from '../../services/skirmishBrains'
import { proposeCorrection, summarizeCoachFocus } from '../../services/coachingEngine'
import { rankCoachingCandidates, type CoachingCandidate } from '../../services/coachingCandidates'
import { draftRecordedCorrection, recordedCoachContext } from '../../services/coachingReview'
import { comparisonFrameAt, divergenceFrameIndex, type PracticeComparison } from '../../services/practiceComparison'
import { useCoachingWorker } from '../utils/useCoachingWorker'
import { liveCallContext, type LiveCallContext } from '../../services/liveCall'
import { engagementView, heroLedeMode } from '../../services/engagement'
import { loadEngagementProgress, saveEngagementProgress } from '../../services/engagementProgress'
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
import {
  BUILD_STORAGE_KEY,
  baseBuild,
  DEFAULT_BUILD,
  isValidBuild,
  parseBuild,
  serializeBuild,
  type Build,
} from '../../services/buildBudget'
import {
  isValidTrainingConfig,
  parseTrainingConfig,
  serializeTrainingConfig,
  TRAINING_STORAGE_KEY,
  type TrainingConfig,
} from '../../services/trainingConfig'
import { useConvexClient } from '../ConvexClientProvider'
import { api } from '../../convex/_generated/api'
import type { ReplayMarker } from '../../services/replayMarkers'
import { buildReplayStory, captionAt } from '../../services/replayStory'
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
import type { ForgedLook } from '../../services/forgeView'
import { LessonComparison } from '../workbench/LessonComparison'
import { LiveCallPrompt } from '../workbench/LiveCallPrompt'
import { HelpDrawer } from '../workbench/HelpDrawer'
import { ReplayPanel } from '../workbench/ReplayPanel'
import { TournamentBracket } from '../workbench/TournamentBracket'
import { ViewportHud, type HudFeedEvent } from '../workbench/ViewportHud'
import { RulesetPicker } from '../workbench/RulesetPicker'
import type { RulesetId } from '../../services/chassis'
import { courseForRuleset, isSkirmishUnlocked, skirmishDisclosure, subscribeSkirmishUnlock, unlockSkirmish } from '../../services/workbenchRuleset'
import { actionsEqual, COACH_ANYTIME_KEY, COACH_MISTAKE_KEY, COACH_NUDGE_KEY, friendlyActionLabel, isExecutableCheckpoint, PLAY_HINT_KEY, readHintDismissed, routeLabel } from '../workbench/readouts'
import styles from './ArenaScene.module.css'

const WorldView = dynamic(() => import('./ArenaWorldView'), { ssr: false })
// WebRTC SDK is browser-only; keep it out of the SSR/initial bundle.
const BroadcastPanel = dynamic(() => import('../workbench/BroadcastPanel'), { ssr: false })
const viewOnlyCheckpointMessage = (checkpoint: PolicyCheckpoint) =>
  `"${checkpoint.name}" is from an older format, so it's view-only for now — re-train its examples to bring it up to date and make it playable again.`
const CAMERA_LABELS: Record<ArenaCamera, string> = {
  overview: 'Arena',
  champion: 'Follow you',
  rival: 'Follow rival',
  compare: 'Both brains',
}

type LoadedSession = { session: ArenaSession; course: ArenaCourse; rushCourse: ArenaCourse; createMotion: () => ArenaMotion }

type SharedReplay = {
  shareId: string
  kind: 'challenge' | 'tournament'
  participants: { name: string; brainId: string }[]
  /** championIndex[i] is the participant index whose brain is the champion in recordings[i]. */
  championIndex: number[]
  recordings: ArenaRecording[]
  index: number
  markers: ReplayMarker[]
}


function Workbench({
  session,
  course,
  rushCourse,
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
  const [playMode, setPlayMode] = useState<WorkbenchPlayMode>('practice')
  const [activeCourse, setActiveCourse] = useState(course)
  const [rulesetId, setRulesetId] = useState<RulesetId | undefined>(undefined)
  const skirmishUnlocked = useSyncExternalStore(subscribeSkirmishUnlock, isSkirmishUnlocked, () => false)
  const [studioOpen, setStudioOpen] = useState(false)
  const [broadcastRequest, setBroadcastRequest] = useState(0)
  const [hintOpen, setHintOpen] = useState(() => !readHintDismissed())
  // The chassis build is a player preference, persisted beside the other
  // local records. A build saved by an older build of the app (or a corrupt
  // entry) resolves to the hauler baseline rather than throwing, matching the
  // additive-and-versioned rule the checkpoint format already uses.
  const [build, setBuild] = useState<Build>(() => {
    try {
      return parseBuild(typeof window === 'undefined' ? null : window.localStorage.getItem(BUILD_STORAGE_KEY))
    } catch {
      return baseBuild(DEFAULT_BUILD.chassis)
    }
  })
  const [coachNudgeOpen, setCoachNudgeOpen] = useState(false)
  // Stream B training controls. These configure the evolution-strategy builder
  // (`services/trainingConfig.ts`), NOT the pinned browser trainer below — the
  // Train button's 60/0.008/decay config is frozen by versions.test.ts and the
  // eval pin, and stays exactly as it is.
  const [trainingConfig, setTrainingConfig] = useState<TrainingConfig>(() => {
    try {
      return parseTrainingConfig(typeof window === 'undefined' ? null : window.localStorage.getItem(TRAINING_STORAGE_KEY))
    } catch {
      return parseTrainingConfig(null)
    }
  })
  const [hasCompletedRun, setHasCompletedRun] = useState(() => loadEngagementProgress().hasCompletedRun)
  const [forgedLook, setForgedLook] = useState<ForgedLook | null>(null)
  const [mistakeMoment, setMistakeMoment] = useState<{ tick: number; headline: string; detail: string } | null>(null)
  const [liveCall, setLiveCall] = useState<LiveCallContext | null>(null)
  const liveCallUsedRef = useRef(false)
  const [trainFocusLine, setTrainFocusLine] = useState<string | null>(null)
  const [modeBanner, setModeBanner] = useState<WorkbenchPlayMode | null>(null)
  const [runTip, setRunTip] = useState<string | null>(null)
  const [sharedReplay, setSharedReplay] = useState<SharedReplay | null>(null)
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
  // Progressive disclosure: how much of the workbench is shown depends on how
  // far into the product this player is. A first visit gets one job and one
  // button instead of every surface at once.
  const engagement = engagementView({ hasCompletedRun, hasOwnBrain })
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
  // Set once the player has actually watched a lesson replay, so the guidance
  // machine stops pushing it. Resets with the comparison itself.
  const [comparisonWatched, setComparisonWatched] = useState(false)
  const [recompareBusy, setRecompareBusy] = useState(false)
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

  // Training, the two comparison matches, and the beat forecast all run in a
  // worker so the canvas never stalls at the moment the player is waiting on
  // the result.
  const coachWorker = useCoachingWorker()

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
          `${legacy.length} saved brain${legacy.length === 1 ? '' : 's'} ${legacy.length === 1 ? 'is' : 'are'} from an older format and can only be viewed for now — re-train ${legacy.length === 1 ? 'its' : 'their'} examples to bring ${legacy.length === 1 ? 'it' : 'them'} up to date.`,
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
      setTrainMessage(`Couldn't load your saved brain (${err instanceof Error ? err.message : 'incompatible checkpoint'}) — starting fresh with the house brain instead.`)
    }
    if (storedExamples.length > 0) {
      store.setExamples(storedExamples)
    }
    store.markHydrated()
    return startArenaSync(convex)
  }, [session, convex])

  // ?replay=<shareId> boots straight into review of a published league match.
  // The slug is the capability, so this path does not need sign-in. Recordings
  // arrive as storage URLs; the session validates the schema before presenting
  // them, and user ids never cross the wire.
  useEffect(() => {
    const shareId = new URLSearchParams(window.location.search).get('replay')
    if (!shareId) return
    if (!convex) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot boot read; the notice is the offline failure surface
      setTrainMessage('Shared replays need a live Convex connection.')
      return
    }
    let cancelled = false
    void convex.query(api.league.viewReplay, { shareId }).then(async doc => {
      if (cancelled) return
      if (!doc) { setTrainMessage('That replay link does not point at a saved match.'); return }
      const recordings = await Promise.all(doc.urls.map(async url => {
        const parsed = JSON.parse(await (await fetch(url)).text()) as ArenaRecording
        if (parsed?.schemaVersion !== 'arena-recording-v1' || !Array.isArray(parsed.checkpoints) || parsed.checkpoints.length === 0) {
          throw new Error('recording-schema-mismatch')
        }
        return parsed
      }))
      if (cancelled || recordings.length === 0) return
      setSharedReplay({
        shareId,
        kind: doc.kind,
        participants: doc.participants,
        championIndex: doc.championIndex,
        recordings,
        index: 0,
        markers: doc.markers,
      })
      setCinematic(true)
      session.reviewFrom(recordings[0])
      // Consume the share link so leaving review and reloading doesn't reopen it.
      window.history.replaceState(null, '', window.location.pathname)
    }).catch(() => { if (!cancelled) setTrainMessage('Could not load that replay link.') })
    return () => { cancelled = true }
  }, [convex, session])

  const selectSharedSide = (index: number) => {
    setSharedReplay(current => {
      if (!current || index === current.index || !current.recordings[index]) return current
      session.reviewFrom(current.recordings[index])
      return { ...current, index }
    })
  }

  /** The banner only applies while the shared recording is the one under review. */
  const sharedReplayActive = sharedReplay !== null && session.activeRecording() === sharedReplay.recordings[sharedReplay.index]

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
    setRunTip('Practice lets you coach mid-run — call a route while it races, or Pause and open Replay.')
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

  // The mid-race verb: once per Practice run, offer to call the champion's next
  // route while it is live. Scoped to practice — a scored Match locks coaching,
  // so this can never touch a result.
  useEffect(() => {
    if (view.phase !== 'running' || playMode !== 'practice') return
    if (liveCall || liveCallUsedRef.current || isTraining) return
    let observation
    try {
      observation = session.observe('champion', { forceDecision: true })
    } catch {
      return
    }
    const championAgent = view.episode.agents.find(agent => agent.id === 'champion')
    if (!championAgent) return
    const context = liveCallContext({
      tick: view.episode.tick,
      durationTicks: activeCourse.scenario.durationTicks,
      observation,
      // What it will do absent coaching is whatever it last committed, so the
      // prompt can name the default a call is overriding.
      plannedAction: championAgent.lastOutcome?.accepted && championAgent.lastOutcome.action
        ? championAgent.lastOutcome.action
        : null,
      alreadyCalled: liveCallUsedRef.current,
    })
    if (!context) return
    recordFunnelEvent('tip.livecall', `t${context.tick}`)
    setLiveCall(context)
  }, [view.phase, view.episode, playMode, liveCall, isTraining, mistakeMoment, session, activeCourse.scenario.durationTicks])

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

  const handleLiveCall = (edgeId: string) => {
    if (!liveCall) return
    liveCallUsedRef.current = true
    setLiveCall(null)
    const preferred: ArenaAction = { type: 'move', edgeId }
    if (!liveCall.routeOptions.some(option => option.edgeId === edgeId)) {
      setTrainMessage('That route is not available right now — the champion keeps its own plan for this run.')
      return
    }
    try {
      exampleCounter.current += 1
      // Recorded as an approved example directly: the player chose it live, in
      // the moment, rather than in post-hoc review — that is the whole point.
      const example = {
        id: `live-${liveCall.tick}-${exampleCounter.current.toString(36)}`,
        sourceEpisodeId: activeCourse.scenario.id,
        tick: liveCall.tick,
        observation: structuredClone(liveCall.observation),
        originalAction: structuredClone(liveCall.plannedAction ?? { type: 'wait' as const }),
        preferredAction: preferred,
        rationale: `Called live at tick ${liveCall.tick}: take ${routeLabel(edgeId)} instead of ${liveCall.plannedAction ? friendlyActionLabel(liveCall.plannedAction) : 'waiting'}.`,
        approved: true,
        source: 'approved' as const,
        provenance: { kind: 'human' as const },
      }
      setExamples(prev => [example, ...prev])
      recordFunnelEvent('example.draft', 'live-call')
      // Deliberately does NOT open the Coach column. A call happens mid-race,
      // and expanding to a third column while the player is watching a flood
      // countdown is exactly the overstimulation this prompt caused. The
      // lesson is saved and the status line confirms it; the player opens
      // Coach when they choose, which is also where Approve and Train live.
      setTrainMessage(`Live call saved — teach it ${routeLabel(edgeId)}. Finish the race, then open Lessons to approve and train.`)
    } catch {
      setTrainMessage("Couldn't save that call — pause and use Coach instead.")
    }
  }

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
    // Persisted so a returning player is not re-shown the first-visit layout.
    saveEngagementProgress({ ...loadEngagementProgress(), hasCompletedRun: true })
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
    let cancelled = false
    void coachWorker.timeline({ scenario, options }).then(moments => {
      if (cancelled) return
      setDirector({ matchId, moments })
    }).catch(() => {
      // No forecast, no problem — Skip still falls through to the finish.
      if (!cancelled) setDirector({ matchId, moments: [{ tick: scenario.durationTicks, kind: 'finish' }] })
    })
    return () => { cancelled = true }
  }, [view.phase, view.episode.tick, session, activeCourse.scenario, view.policies, view.checkpoint, coachWorker, director])

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
      .catch(() => setTrainMessage('The tournament hit a snag and had to stop — give it another go.'))
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
  const startMatchRef = useRef(primaryAction)
  useEffect(() => { startMatchRef.current = primaryAction })
  const canBroadcast = visualReady && !isTraining && (view.phase === 'ready' || view.phase === 'finished')
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

  const switchPlayMode = (mode: WorkbenchPlayMode) => {
    if (view.phase !== 'ready' || mode === playMode || isTraining || tournamentRunning || sharedReplay) return
    setCoachSelection(null)
    setLiveCall(null)
    liveCallUsedRef.current = false
    const nextRuleset = mode === 'rush' ? rulesetId : undefined
    const next = courseForRuleset(selectWorkbenchCourse(course, rushCourse, mode), build, nextRuleset)
    setRulesetId(nextRuleset)
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
    setComparisonWatched(false)
    setComparisonReviewing(null)
    setModeBanner(mode)
    if (modeBannerTimer.current) window.clearTimeout(modeBannerTimer.current)
    modeBannerTimer.current = window.setTimeout(() => setModeBanner(null), 1100)
  }
  const switchRuleset = (nextRuleset: RulesetId | undefined, unlock = false) => {
    if (view.phase !== 'ready' || isTraining || tournamentRunning || sharedReplay) return
    if (nextRuleset === 'skirmish' && !skirmishUnlocked && !unlock) return
    if (unlock) {
      if (!skirmishDisclosure({ unlocked: skirmishUnlocked, hasCompletedRun, hasOwnBrain }).canSkip) return
      unlockSkirmish()
    }
    const mode = nextRuleset === 'skirmish' ? 'rush' : 'practice'
    const next = courseForRuleset(selectWorkbenchCourse(course, rushCourse, mode), build, nextRuleset)
    session.setScored(false)
    session.setCourse(next)
    setRulesetId(nextRuleset)
    setPlayMode(mode)
    setActiveCourse(next)
    setCoachSelection(null)
    setLiveCall(null)
    liveCallUsedRef.current = false
    setDirector(null)
    setComparison(null)
    setComparisonWatched(false)
    setComparisonReviewing(null)
    setRunTip(null)
    setModeBanner(null)
    floodWarnedRef.current = null
    lastEncounterTickRef.current = null
    lastSightingTickRef.current = null
    sightingCountRef.current = 0
  }
  const skipToSkirmish = () => switchRuleset('skirmish', true)
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
      setTrainMessage('Coaching is off during a scored Match — hop back to Practice to keep teaching.')
      return
    }
    if (!text.trim()) return
    if (!coachContext || !reviewRecording) {
      setTrainMessage('Pick a moment to coach first — open Replay and scrub to a decision.')
      return
    }
    const example = proposeCorrection(text, coachContext.observation, coachContext.originalAction, reviewRecording.scenario.id)
    if (example) {
      setExamples(prev => [example, ...prev])
      recordFunnelEvent('example.draft', 'prompt')
      setPromptText('')
      setStudioOpen(true)
      setTrainMessage(`Got it — drafted "${example.rationale}" for tick ${example.tick}. Approve it below, then train when you're ready.`)
    } else {
      setTrainMessage(`That note doesn't match a legal move at tick ${coachContext.tick} — try different wording, or pick an alternative in Replay.`)
    }
  }

  const handleExportCheckpoint = () => {
    downloadCheckpointFile(activeCheckpoint)
    setTrainMessage(`Downloaded "${activeCheckpoint.name}" as a checkpoint file — share it or keep it as a backup.`)
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
          setTrainMessage("Can't import mid-round — hit Reset to start a fresh Practice setup first.")
          return
        }
        setCheckpoints(prev => {
          const filtered = prev.filter(c => c.id !== imported.id)
          return [imported, ...filtered]
        })
        if (!isExecutableCheckpoint(imported)) {
          setTrainMessage(`Imported "${imported.name}" — ${viewOnlyCheckpointMessage(imported)}`)
          return
        }
        try {
          session.setCheckpoint(imported)
          session.selectPolicy('champion', 'learned', imported)
          setActiveCheckpoint(imported)
          setComparison(null)
          setComparisonWatched(false)
          setComparisonReviewing(null)
          setCoachSelection(null)
          setTrainMessage(`Imported "${imported.name}" and made it active — ready to play (checkpoint ${imported.weightsHash.slice(0, 8)}).`)
        } catch (err) {
          setTrainMessage(`Saved "${imported.name}", but couldn't make it active: ${err instanceof Error ? err.message : 'incompatible checkpoint'}. Try selecting it from the brain list.`)
        }
      })
      .catch(err => {
        if (importAbortRef.current !== controller || controller.signal.aborted) return
        importAbortRef.current = null
        if (fileInputRef.current) fileInputRef.current.value = ''
        if (err instanceof Error && err.name === 'AbortError') {
          if (!canImport()) setTrainMessage("Can't import mid-round — hit Reset to start a fresh Practice setup first.")
          return
        }
        setTrainMessage(`That file didn't import: ${err instanceof Error ? err.message : 'Invalid checkpoint file'}. Double-check it's a Clawdy checkpoint export.`)
      })
  }

  // House brains follow the ruleset and chassis; a player's own brain is never swapped.
  useEffect(() => {
    if (view.phase !== 'ready') return
    const wanted = brainForRuleset(activeCheckpoint, build.chassis, rulesetId)
    if (wanted.id === activeCheckpoint.id) return
    useArenaStore.getState().setActiveCheckpoint(wanted)
    try {
      session.setCheckpoint(wanted)
      session.selectPolicy('champion', 'learned', wanted)
    } catch { /* locked mid-run; the next ready phase retries */ }
  }, [rulesetId, build.chassis, view.phase, activeCheckpoint, session])

  const handleBuildChange = (next: Build) => {
    if (isTraining || coachingLocked || view.phase === 'running' || (rulesetId === 'skirmish' && view.phase !== 'ready')) return
    if (!isValidBuild(next)) {
      setTrainMessage('That build is over budget — the panel will not accept it.')
      return
    }
    if (rulesetId === 'skirmish') {
      const nextCourse = courseForRuleset(rushCourse, next, rulesetId)
      session.setCourse(nextCourse)
      setActiveCourse(nextCourse)
      setDirector(null)
    }
    setBuild(next)
    try {
      window.localStorage.setItem(BUILD_STORAGE_KEY, serializeBuild(next))
    } catch (err) {
      setTrainMessage(`Build applied, but it wouldn't save to this browser: ${err instanceof Error ? err.message : 'storage unavailable'}.`)
    }
  }

  const handleTrainingConfigChange = (next: TrainingConfig) => {
    if (!isValidTrainingConfig(next)) {
      setTrainMessage('Those training settings are out of range — the panel will not accept them.')
      return
    }
    setTrainingConfig(next)
    try {
      window.localStorage.setItem(TRAINING_STORAGE_KEY, serializeTrainingConfig(next))
    } catch (err) {
      setTrainMessage(`Training settings applied, but they wouldn't save to this browser: ${err instanceof Error ? err.message : 'storage unavailable'}.`)
    }
  }

  const toggleApprove = (id: string) => {
    if (isTraining || view.phase === 'running' || coachingLocked) return
    const target = examples.find(ex => ex.id === id)
    if (!target) return
    if (isEvaluationScenario(target.sourceEpisodeId)) {
      setTrainMessage(`That example is from a held-out Match scenario ("${target.sourceEpisodeId}") — it's reserved for scoring, so it can't be approved for training.`)
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
      setTrainMessage('Coaching is off during a scored Match — hop back to Practice to keep teaching.')
      return
    }
    if (isTraining || trainingBusyRef.current || view.phase === 'running') return
    if (examples.filter(e => e.approved).length === 0) return
    rejectEvaluationExamples(examples.filter(e => e.approved))

    if (activeCourse.scenario.split !== 'practice' || isEvaluationScenario(activeCourse.scenario.id)) {
      setTrainMessage("Training only works on Practice runs — a held-out Match recording can't be used to teach, to keep scoring fair.")
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
    setTrainMessage(
      approved.length < 3
        ? `Teaching from ${approved.length} approved note${approved.length === 1 ? '' : 's'} — small lessons can swing the score either way before they settle in. Here goes…`
        : 'Teaching from the approved notes…',
    )
    setComparison(null)
    setComparisonWatched(false)
    setComparisonReviewing(null)
    setCoachSelection(null)

    if (trainTimerRef.current !== null) window.clearTimeout(trainTimerRef.current)
    const jobId = `train-${Date.now().toString(36)}`
    const trainOptions = {
      // Browser coach-train config, pinned in versions.test.ts and
      // docs/COMPATIBILITY.md: 60 epochs, lr 0.008 with a deterministic
      // 0.5x step at epoch 30 (few-shot stable; the old 100/0.02 ran
      // hot enough to diverge on ~10-example lessons).
      epochs: 60,
      learningRate: 0.008,
      learningRateDecay: { atEpoch: 30, factor: 0.5 },
      name: `${championIdentity.name} v${checkpoints.length} (+${approved.length})`,
    }
    queueTrainingJobSync({
      jobId,
      status: 'running',
      parentCheckpointId: parent.id,
      resultCheckpointId: null,
      exampleCount: approved.length,
      message: null,
    })
    const focusLine = summarizeCoachFocus(approved)
    setTrainFocusLine(focusLine)
    const failTraining = (err: unknown) => {
      trainingBusyRef.current = false
      setIsTraining(false)
      const message = err instanceof Error ? err.message : 'Unknown error'
      setTrainMessage(`Training didn't take: ${message}. Your approved notes are still here — try again.`)
      queueTrainingJobSync({
        jobId,
        status: 'failed',
        parentCheckpointId: parent.id,
        resultCheckpointId: null,
        exampleCount: approved.length,
        message,
      })
    }
    const adoptChild = (trained: PolicyCheckpoint): boolean => {
      try { session.reset() } catch (err) {
        setTrainMessage(`Saved the new brain, but the practice session wouldn't reset: ${err instanceof Error ? err.message : 'unknown error'}. Try Reset.`)
        return false
      }
      try {
        session.setCheckpoint(trained)
        session.selectPolicy('champion', 'learned', trained)
        setActiveCheckpoint(trained)
        return true
      } catch (err) {
        setTrainMessage(`Saved the new brain, but it wouldn't load into the arena: ${err instanceof Error ? err.message : 'incompatible checkpoint'}.`)
        return false
      }
    }
    const finishTraining = (trained: PolicyCheckpoint, message: string) => {
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

    // 60 epochs of backprop, then two full 1200-tick comparison matches, both
    // in the worker. The canvas keeps rendering and the coach panel keeps its
    // "teaching" message instead of the tab freezing at the payoff moment.
    void coachWorker.train({ parent, examples: approved, options: trainOptions }).then(trained => {
      if (abort.signal.aborted) { trainingBusyRef.current = false; return }
      setCheckpoints(prev => [trained, ...prev])
      queueCheckpointSync(trained, approved.map(example => example.id))
      setTrainMessage("Training's done — let's see how the new brain stacks up against the old one…")
      return coachWorker.compare({
        parent,
        child: trained,
        scenario: practiceScenario,
        rival: rivalOption,
        controllerVersion,
      }).then(result => ({ trained, result }), (err: unknown) => {
        // The brain trained and saved fine — only the side-by-side failed.
        // Adopt it anyway; the player keeps the lesson even without the replay.
        if (abort.signal.aborted) throw err
        const adopted = adoptChild(trained)
        recordFunnelEvent('train.done', `n=${approved.length} comparison-unavailable`)
        if (!adopted) { trainingBusyRef.current = false; setIsTraining(false); throw err }
        const lossLine = `Loss ${trained.trainingSummary.loss.toFixed(4)} · ${(trained.trainingSummary.accuracy * 100).toFixed(0)}% of the notes landed.`
        finishTraining(trained, `New brain trained and saved, though the side-by-side comparison didn't run (${err instanceof Error ? err.message : 'unknown error'}). ${lossLine}`)
        throw err
      })
    }).then(outcome => {
      if (!outcome) return
      if (abort.signal.aborted) { trainingBusyRef.current = false; return }
      const { trained, result } = outcome
      setComparison(result)
      requestAnimationFrame(() => comparisonRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
      const adopted = adoptChild(trained)
      recordFunnelEvent('train.done', `n=${approved.length} loss=${trained.trainingSummary.loss.toFixed(4)} banked ${result.baseline.banked}→${result.trained.banked}`)
      if (!adopted) { trainingBusyRef.current = false; setIsTraining(false); return }
      const lossLine = `Loss ${trained.trainingSummary.loss.toFixed(4)} · ${(trained.trainingSummary.accuracy * 100).toFixed(0)}% of the notes landed.`
      finishTraining(
        trained,
        focusLine
          ? `New brain trained. ${focusLine} ${lossLine} See how it did below.`
          : `New brain trained. ${lossLine} See how it did below.`,
      )
    }).catch(err => {
      if (abort.signal.aborted) { trainingBusyRef.current = false; return }
      // Only a genuine training failure lands here; the comparison branch
      // above has already settled its own message and rethrows.
      if (trainingBusyRef.current) failTraining(err)
    })
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

  // What decided the run, told from the coach's side (or by name in a shared
  // replay, where nobody is "you"). Cached per recording, so scrubbing is free.
  const replayStory = (() => {
    if (!reviewRecording) return []
    try {
      if (sharedReplayActive && sharedReplay) {
        const champion = sharedReplay.championIndex[sharedReplay.index] ?? 0
        return buildReplayStory(reviewRecording, {
          names: {
            champion: sharedReplay.participants[champion]?.name ?? 'Champion',
            rival: sharedReplay.participants[1 - champion]?.name ?? 'Rival',
          },
        })
      }
      return buildReplayStory(reviewRecording, { you: 'champion', names: { champion: 'Your champion', rival: 'Rival' } })
    } catch {
      return []
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
      setTrainMessage(`Correction drafted for tick ${example.tick} — approve it below, then hit Train when you're ready.`)
    } catch (err) {
      setTrainMessage(`Couldn't draft that correction: ${err instanceof Error ? err.message : 'unsupported alternative'}. Try a different alternative in Replay.`)
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
    // Deliberately keyed on the review frame, not on view.episode/session/
    // activeCourse.scenario. Adding them would re-run the ranking rollouts on
    // every published tick instead of once per scrubbed frame, which is the
    // exact cost the debounce above exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase, view.replayIndex, coachingLocked])

  const handleSelectCheckpoint = (ckptId: string) => {
    if (isTraining || trainingBusyRef.current || view.phase === 'running') return
    if (view.phase !== 'ready') {
      setTrainMessage("Hit Reset first — you can't switch brains mid-round.")
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
      setTrainMessage(`That brain wouldn't load: ${err instanceof Error ? err.message : 'incompatible checkpoint'}.`)
      return
    }
    setActiveCheckpoint(selected)
    setComparison(null)
    setComparisonWatched(false)
    setComparisonReviewing(null)
    setCoachSelection(null)
  }

  const handleShareCard = () => {
    if (typeof document === 'undefined') return
    const canvas = document.querySelector('canvas')
    if (!canvas) {
      setTrainMessage("Couldn't capture a snapshot of the arena — scrub a few replay frames and try again.")
      return
    }
    let dataUrl: string
    try {
      dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png')
    } catch {
      setTrainMessage('Your browser blocked the screenshot — this works best on desktop Chrome or Firefox.')
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
    setTrainMessage(`Saved your share card as "${filename}" — show it off!`)
  }

  const approvedCount = examples.filter(e => e.approved && !isEvaluationScenario(e.sourceEpisodeId)).length
  const championFocus = approvedCount > 0
    ? focusVectorForChampion(examples.filter(example => example.approved))
    : null

  const ghostPose = comparison && comparisonReviewing && view.phase === 'review'
    ? (() => {
        const other = comparisonReviewing === 'trained' ? comparison.baseline : comparison.trained
        // Label the brain by what it actually is: watching the trained run
        // means the ghost is the parent, and vice versa.
        const label = comparisonReviewing === 'trained' ? 'Parent' : 'New brain'
        const frame = comparisonFrameAt(other.recording, view.episode.tick)
        const agentState = frame?.agents.find(agent => agent.id === 'champion')
        // Pass the whole agent state, not just a position — the ghost renders
        // the real rover silhouette and needs the recorded quaternion to steer.
        return agentState ? { agent: agentState, label } : null
      })()
    : null

  const reviewComparisonRun = (which: 'baseline' | 'trained') => {
    if (!comparison || isTraining || view.phase === 'running') return
    try {
      session.reviewFrom(comparison[which].recording)
    } catch (err) {
      setTrainMessage(`Couldn't open that recorded run: ${err instanceof Error ? err.message : 'unknown error'}.`)
      return
    }
    setComparisonReviewing(which)
    // Land on the divergence rather than frame 0. A 241-frame replay that starts
    // at the beginning asks the player to scrub for the one moment that
    // matters; seeking there turns "Watch the lesson" into a single click that
    // actually shows the difference. Both runs seek the same frame index so the
    // ghost and the live rover stay tick-aligned.
    const frame = divergenceFrameIndex(comparison)
    if (frame !== null) {
      try { session.seek(frame) } catch { /* frame may have raced a trim */ }
    }
    // Cinematic replay only exists in the review phase, so this starts playback
    // rather than parking on a frame.
    setCinematic(true)
    // Frame both brains unless the player has deliberately chosen a camera;
    // the default overview frequently stacks the two rovers on one tile, which
    // hides the very divergence they came here to see.
    if (follow === 'overview') setFollow('compare')
  }

  // Re-derive the two comparison runs. The recordings live in memory only, so
  // a reload or reset loses them; this is deterministic and the coaching worker
  // is already warm, so the wait is short. Reuses the checkpoints already
  // stored on the existing comparison rather than re-reading the store, so it
  // always compares the same two brains on the same board.
  //
  // Plain function, not useCallback: the only caller is the LessonComparison
  // render below, which is recreated every render, so the memoization bought no
  // referential stability (and the React Compiler flagged the dependency list
  // as unpreservable — same as resetForTeaching).
  const recompare = () => {
    if (!comparison || recompareBusy || isTraining) return
    const scenario = comparison.baseline.recording.scenario
    const parent = checkpoints.find(checkpoint => checkpoint.weightsHash === comparison.baseline.weightsHash)
    const child = checkpoints.find(checkpoint => checkpoint.weightsHash === comparison.trained.weightsHash)
    if (!parent || !child) {
      setTrainMessage('That comparison needs both brains still loaded — import or re-train one to compare again.')
      return
    }
    setRecompareBusy(true)
    void coachWorker.compare({
      parent,
      child,
      scenario: structuredClone(scenario),
      rival: comparison.rival,
      controllerVersion: comparison.controllerVersion,
    }).then(result => {
      setComparison(result)
      setComparisonReviewing(null)
      setComparisonWatched(false)
      setTrainMessage('Re-ran both brains on the same practice board.')
    }).catch(err => {
      setTrainMessage(`Couldn't re-run the comparison: ${err instanceof Error ? err.message : 'unknown error'}.`)
    }).finally(() => setRecompareBusy(false))
  }

  const jumpToDivergence = () => {
    if (!comparison?.firstDivergence || isTraining || view.phase === 'running') return
    if (view.phase !== 'review' || comparisonReviewing !== 'trained') reviewComparisonRun('trained')
    const frame = divergenceFrameIndex(comparison)
    if (frame === null) return
    try { session.seek(frame) } catch { /* frame may have raced a trim */ }
  }

  // Plain function, not useCallback: it is called only from runNextStep below,
  // which is itself recreated each render, so the manual memoization bought no
  // referential stability and only forced a hand-maintained dependency list
  // (which the React Compiler flagged as unpreservable).
  const resetForTeaching = () => {
    floodWarnedRef.current = null
    setDirector(null)
    setComparison(null)
    setComparisonWatched(false)
    setComparisonReviewing(null)
    setCoachSelection(null)
    setRunTip(null)
    session.reset()
  }

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
    hasUnwatchedComparison: comparison !== null && !comparisonWatched,
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
      case 'watch-lesson': reviewComparisonRun('trained'); setComparisonWatched(true); break
    }
  }

  return (
    <div className={styles.stageEnter}>
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>TRAIN YOUR CHAMPION</p>
          <h1>Watch it play. Then teach it.</h1>
          <p className={styles.lede}>
            {heroLedeMode(engagement) === 'loop-only'
              ? <>Press <strong>Play</strong> and watch your rover race for cores on its own. Then coach it into your own.</>
              : <>A trained rover races for cores on its own — and Orbis broadcasts the match live as generated video. Hit <strong>Watch it broadcast live</strong>, or Play to replay a mistake, approve a fix and train a new brain.</>}
          </p>
        </div>
        <div className={styles.introAside}>
          {engagement.showProgressRail && (
            <ol className={styles.progress}>
              <li data-active={view.phase === 'ready' || view.phase === 'running'}>Play</li>
              <li data-active={view.phase === 'paused' || view.phase === 'finished' || view.phase === 'review'}>Replay</li>
              <li data-active={studioOpen && !coachingLocked}>Coach</li>
            </ol>
          )}
          <button type="button" className={styles.helpInline} onClick={onOpenHelp}>
            <HelpCircle size={13} /> What do I do?
          </button>
        </div>
      </div>
      <div className={styles.controlBar}>
        {/* Available in review too: the comparison replay is exactly where a
            moment scrub earns its keep. Jump semantics differ by phase —
            skipToTick is a no-op in review, so seek by frame index there. */}
        {(view.phase === 'running' || view.phase === 'paused' || view.phase === 'review') && (
          <BeatTimeline
            moments={liveDirector?.moments ?? null}
            floods={activeCourse.scenario.floods}
            tick={view.episode.tick}
            durationTicks={activeCourse.scenario.durationTicks}
            onJump={target => {
              applySpeed(1)
              if (view.phase === 'review') {
                const frames = session.activeRecording().checkpoints
                const index = frames.findIndex(frame => frame.state.tick >= target)
                const bounded = index === -1 ? frames.length - 1 : index
                if (bounded >= 0) { try { session.seek(bounded) } catch { /* frame may have raced a trim */ } }
                setCinematic(false)
                return
              }
              session.skipToTick(Math.max(view.episode.tick + 1, target))
            }}
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
          {canBroadcast && engagement.showBroadcastCta && (
            <button
              className={styles.broadcastCta}
              onClick={() => setBroadcastRequest(n => n + 1)}
              title="Connect the Orbis live-video feed, then start the match"
            >
              <Radio size={16} />
              Watch it broadcast live
            </button>
          )}
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
          {/* Play and Coach are the loop itself and stay visible from the
              start. The run utilities are inert before a first round. */}
          {engagement.showRunControls && (
            <>
              <button className={styles.secondaryButton} onClick={() => { setCinematic(false); floodWarnedRef.current = null; lastEncounterTickRef.current = null; lastSightingTickRef.current = null; sightingCountRef.current = 0; setDirector(null); setComparison(null); setComparisonWatched(false); setComparisonReviewing(null); setCoachSelection(null); setRunTip(null); session.reset() }} disabled={!visualReady || view.phase === 'error' || isTraining}><RotateCcw size={15} />Reset</button>
              <button className={styles.secondaryButton} onClick={() => session.review()} title={view.phase === 'paused' || view.phase === 'finished' ? 'Scrub the recorded round' : 'Available once a round is paused or finished'} disabled={(view.phase !== 'paused' && view.phase !== 'finished') || isTraining}><Eye size={16} />Replay</button>
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
            </>
          )}
          <button
            className={styles.secondaryButton}
            aria-pressed={studioOpen}
            onClick={() => setStudioOpen(open => !open)}
            disabled={coachingLocked && examples.length === 0}
            title="Open the Coach panel to approve lessons and train"
          >
            {/* "Lessons" not "Coach": the 3D route picker in Replay is also a
                coaching surface, and two controls called Coach made it unclear
                which one the player was about to open. */}
            <Sparkles size={15} />{studioOpen ? 'Hide lessons' : 'Lessons'}
          </button>
        </div>
        <div className={styles.runMeta}>
          <span>{view.episode.tick} / {activeCourse.scenario.durationTicks}</span>
          {view.episode.tick > 0 && (
            <button onClick={download} aria-label="Download recorded run"><Download size={16} />Save run</button>
          )}
        </div>
      </div>
      <div
        className={styles.workbench}
        data-mode={playMode}
        data-world-ready={visualReady}
        data-coach={studioOpen}
        data-live={view.phase === 'running' || view.phase === 'paused' || undefined}
      >
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
                chassisByEntrant={{ champion: build.chassis }}
                forgedLook={forgedLook}
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
              <span>{modeBanner === 'compete' ? 'MATCH' : modeBanner === 'rush' ? 'RUSH' : 'PRACTICE'}</span>
              <p>{modeBanner === 'compete' ? 'Held-out layout. Coaching locked.' : modeBanner === 'rush' ? 'Unranked race. Chase the mother cores and watch for bumps.' : 'Teach freely. Same world, practice floods.'}</p>
            </div>
          )}
          <ViewportHud
            phase={view.phase}
            isMatch={playMode === 'compete'}
            sideHint={follow === 'overview' ? 'Drag to look around' : activeCourse.config.name}
            score={champion && rival ? { you: champion.banked, foe: rival.banked, cargo: champion.cargo } : null}
            agent={champion}
            rulesetId={sharedReplay ? sharedReplay.recordings[sharedReplay.index]?.scenario.rulesetId : activeCourse.scenario.rulesetId}
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
          {engagement.showPlayHint && visualReady && hintOpen && view.phase === 'ready' && !modeBanner && (
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
          {liveCall && view.phase === 'running' && (
            <LiveCallPrompt
              context={liveCall}
              onCall={handleLiveCall}
              onDismiss={() => {
                liveCallUsedRef.current = true
                setLiveCall(null)
                recordFunnelEvent('tip.livecall.dismiss')
              }}
            />
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
                Open Lessons
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
                    onClick={() => setTrainMessage("Saved your champion's print kit (clawdy-champion-rover.stl) — print profile in docs/PRINT_KIT.md.")}
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
            {engagement.showCameraSwitcher && (
              <div className={styles.cameraButtons} role="group" aria-label="Camera view">
                {/* "Both brains" only exists while a comparison ghost is on the
                    field; offering it otherwise would frame nothing. */}
                {(['overview', 'champion', 'rival', ...(ghostPose ? ['compare' as const] : [])] as const).map(camera => (
                  <button key={camera} aria-pressed={follow === camera} onClick={() => { setFollow(camera); setCinematic(false) }}>{CAMERA_LABELS[camera]}</button>
                ))}
              </div>
            )}
            <span className={styles.weather} data-flooded={view.episode.weather.flooded}>{view.episode.weather.flooded ? 'Flood · valley slowed' : 'Clear · all routes open'}</span>
          </div>
        </section>
        <aside className={styles.sidebar} aria-label="Competitor status">
          <div className={styles.sidebarHeader}><span>THE FIELD</span><span className={styles.timer}>{clock}</span></div>
          {!sharedReplayActive && (
            <RulesetPicker
              rulesetId={rulesetId}
              unlocked={skirmishUnlocked}
              canSkip={skirmishDisclosure({ unlocked: skirmishUnlocked, hasCompletedRun, hasOwnBrain }).canSkip}
              disabled={view.phase !== 'ready' || isTraining || tournamentRunning || !!sharedReplay}
              onChange={next => switchRuleset(next)}
              onSkip={skipToSkirmish}
            />
          )}
          {rulesetId === 'skirmish' ? (
            <p className={`${styles.buildReadout} ${styles.rulesetModeNote}`}>Skirmish preview is unranked. Choose Training Grounds above for the original Practice, Rush and Match modes.</p>
          ) : (
          <div className={styles.modeToggle} role="group" aria-label="Match type" data-flash={modeBanner ?? undefined}>
            <button type="button" aria-pressed={playMode === 'practice'} disabled={view.phase !== 'ready' || isTraining} onClick={() => switchPlayMode('practice')}>Practice</button>
            <button type="button" aria-pressed={playMode === 'rush'} disabled={view.phase !== 'ready' || isTraining} onClick={() => switchPlayMode('rush')}>Rush · unranked</button>
            <button type="button" aria-pressed={playMode === 'compete'} disabled={view.phase !== 'ready' || isTraining} onClick={() => switchPlayMode('compete')}>Match</button>
          </div>
          )}
          {view.phase === 'review' && sharedReplayActive && sharedReplay && (
            <section className={styles.replayPanel} aria-label="Shared league replay">
              <div className={styles.replayHead}>
                <strong>{sharedReplay.kind === 'tournament' ? 'Tournament replay' : 'Challenge replay'}</strong>
                <span>{sharedReplay.participants.map(participant => participant.name).join(' vs ')}</span>
              </div>
              {sharedReplay.recordings.length > 1 && (
                <div className={styles.modeToggle} role="group" aria-label="Replay side">
                  {sharedReplay.recordings.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-pressed={sharedReplay.index === index}
                      onClick={() => selectSharedSide(index)}
                    >
                      {sharedReplay.participants[sharedReplay.championIndex[index]]?.name ?? `Side ${index + 1}`}
                    </button>
                  ))}
                </div>
              )}
              {sharedReplay.markers.length > 0 && (
                <p className={styles.correctionNote}>
                  {[...sharedReplay.markers.reduce((counts, marker) => counts.set(marker.type, (counts.get(marker.type) ?? 0) + 1), new Map<string, number>())]
                    .map(([type, count]) => `${type.replace('_', ' ')} ×${count}`)
                    .join(' · ')}
                </p>
              )}
            </section>
          )}
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
              moments={replayStory}
              captionNow={captionAt(replayStory, view.episode.tick)}
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
                compact={!engagement.showAgentDetail}
                unlocked={view.phase === 'ready' && playMode === 'practice' && !isTraining}
                onPolicy={policy => { if (isTraining || view.phase !== 'ready' || coachingLocked) return; session.selectPolicy(agent.id, policy, activeCheckpoint) }}
                championIdentity={agent.id === 'champion' ? championIdentity : undefined}
                onChampionIdentity={agent.id === 'champion' ? onChampionIdentity : undefined}
                focusVector={agent.id === 'champion' ? championFocus : null}
                focusNote={agent.id === 'champion' ? 'Training focus (approved notes)' : undefined}
              />
            ))
          )}
          {engagement.showBroadcastPanel && <BroadcastPanel session={session} request={broadcastRequest} onFeedReady={() => startMatchRef.current()} />}
          <div className={styles.ruleCard}>
            <strong>{playMode === 'compete' ? 'Scored match. No coaching.' : playMode === 'rush' ? 'Rush · unranked. Race for the mother cores.' : 'Collect. Bank. Survive the flood.'}</strong>
            {/* The paragraph is a second instruction competing with the lede on
                arrival; the one-line rule and the legend carry the same idea. */}
            {engagement.showRulesDetail && (
              <p>{playMode === 'compete' ? 'Same world, different flood and core layout. Weights stay frozen until you reset to Practice.' : playMode === 'rush' ? 'A full-load core spawns at the centre each wave. First rover there takes it; close encounters can steal cargo. Bank at your base before time runs out.' : `Grab cores and bank them at base. Floods slow the valley; a drain costs ${ARENA_RULES.drainCost} energy and helps both rovers.`}</p>
            )}
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
              build={build}
              onBuildChange={handleBuildChange}
              rulesetId={rulesetId}
              trainingConfig={trainingConfig}
              onTrainingConfigChange={handleTrainingConfigChange}
              onForgedLookChange={setForgedLook}
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
            onWatch={(which) => { reviewComparisonRun(which); setComparisonWatched(true) }}
            onJumpToDivergence={jumpToDivergence}
            onRecompare={recompare}
            recompareBusy={recompareBusy}
          />
        </div>
      )}

      {engagement.showTournament && (
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
      )}

      {/* The loop was restated in the hero lede, the progress rail and this
          footer. The rail is gone and the footer would be the third telling. */}
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
        setLoaded({ session: owned, course: bundle.course, rushCourse: bundle.rushCourse, createMotion: bundle.createMotion })
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

