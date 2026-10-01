'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Radio, Square } from 'lucide-react'
import {
  useViskoOrbisDynamic,
  useViskoOrbisDynamicChunkComplete,
  useViskoOrbisDynamicCommandError,
  useViskoOrbisDynamicGenerationStarted,
  useViskoOrbisDynamicState,
  ViskoOrbisDynamicMainVideoView,
  ViskoOrbisDynamicProvider,
  type ViskoOrbisDynamicStateMessage,
} from '@reactor-models/visko-orbis-dynamic'
import type { ArenaSession } from '../../services/arenaSession'
import type { ArenaSnapshot } from '../../services/arenaEpisode'
import { planCinematicShots, shotAt, type CinematicShot } from '../../services/arenaCinematic'
import {
  BROADCAST_TRIGGER_PRIORITIES,
  buildBroadcastIntent,
  broadcastTriggersBetween,
  triggerFromShot,
  type BroadcastIntent,
  type BroadcastTrigger,
} from '../../services/arenaBroadcast'
import { OrbisDirector } from '../../services/orbisDirector'
import { createReactorTokenResolver } from '../../services/reactorToken'
import styles from '../environment/ArenaScene.module.css'

/**
 * Orbis broadcast panel (docs/SCENES.md, AI-video stage). The deterministic
 * replay-cam stays the on-stage floor — this is a parallel generated view of
 * the same recorded facts: shot boundaries in review (and live event
 * transitions in play) become rate-limited Orbis prompts. Nothing here feeds
 * back into a match; it is presentation only.
 *
 * Degradation ladder: live Orbis video → prompt storyboard (offline mode) →
 * the replay-cam, which needs no panel at all.
 */

type BroadcastMode = 'off' | 'live' | 'offline'
type IntentStatus = 'queued' | 'dispatched' | 'failed'

interface TimelineEntry {
  id: string
  status: IntentStatus
  intent: BroadcastIntent
}

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'Disconnected',
  connecting: 'Placing session',
  waiting: 'Assigning GPU',
  ready: 'Ready',
}

function upsertTimeline(entries: TimelineEntry[], intent: BroadcastIntent, status: IntentStatus): TimelineEntry[] {
  const id = `${intent.kind}-${intent.createdAt}`
  const next = entries.map(entry => (entry.id === id ? { ...entry, status } : entry))
  if (next.some(entry => entry.id === id)) return next
  return [{ id, status, intent }, ...next].slice(0, 6)
}

export default function BroadcastPanel({ session }: { session: ArenaSession }) {
  const tokenResolver = useMemo(() => createReactorTokenResolver(), [])
  return (
    <ViskoOrbisDynamicProvider jwtToken={tokenResolver}>
      <BroadcastExperience session={session} />
    </ViskoOrbisDynamicProvider>
  )
}

function BroadcastExperience({ session }: { session: ArenaSession }) {
  const reactor = useViskoOrbisDynamic()
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const director = useMemo(() => new OrbisDirector({ minDispatchIntervalMs: 1400 }), [])
  const [mode, setMode] = useState<BroadcastMode>('off')
  const [modelState, setModelState] = useState<ViskoOrbisDynamicStateMessage | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [activePrompt, setActivePrompt] = useState('')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [priming, setPriming] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [airing, setAiring] = useState<{ kind: string; reason: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reactorRef = useRef(reactor)
  const modeRef = useRef<BroadcastMode>('off')
  const modelStateRef = useRef<ViskoOrbisDynamicStateMessage | null>(null)
  const lastShotKeyRef = useRef<string | null>(null)
  const prevLiveRef = useRef<ArenaSnapshot | null>(null)
  const storyboardRef = useRef<{ recording: unknown; shots: CinematicShot[] } | null>(null)

  useEffect(() => {
    reactorRef.current = reactor
    modelStateRef.current = modelState
    modeRef.current = mode
  }, [reactor, modelState, mode])

  useViskoOrbisDynamicState(message => setModelState(message))
  useViskoOrbisDynamicCommandError(message => setCommandError(`${message.command}: ${message.reason}`))
  useViskoOrbisDynamicGenerationStarted(() => setPriming(true))
  useViskoOrbisDynamicChunkComplete(message => {
    if (message.frames_emitted > 0) setPriming(false)
  })

  // Dispatch timeline. A 'dispatched' beat while live also starts generation —
  // Orbis needs one accepted prompt before `start`, which that dispatch has
  // just provided.
  useEffect(() => {
    const offEvent = director.onEvent(({ type, intent, error }) => {
      setTimeline(entries => upsertTimeline(entries, intent, type))
      if (type === 'failed') setCommandError(error ?? 'prompt dispatch failed')
      if (type === 'dispatched') setAiring({ kind: intent.kind, reason: intent.reason })
      if (type === 'dispatched') {
        const current = reactorRef.current
        if (modeRef.current === 'live' && current.status === 'ready' && !modelStateRef.current?.started) {
          void current.start().catch((error: unknown) => {
            setCommandError(error instanceof Error ? error.message : String(error))
          })
        }
      }
    })
    return () => {
      offEvent()
      director.dispose()
    }
  }, [director])

  // Transport wiring: offline mode records prompts locally so the grammar is
  // inspectable without a Reactor key (the storyboard floor of the ladder).
  useEffect(() => {
    if (mode === 'offline') {
      director.setTransport({
        setPrompt: async (prompt: string) => { setActivePrompt(prompt) },
      })
      return
    }
    if (mode === 'live' && reactor.status === 'ready') {
      director.setTransport({
        setPrompt: async (prompt: string) => {
          await reactorRef.current.setPrompt({ prompt })
          setActivePrompt(prompt)
        },
        setAudioPrompt: async (prompt: string) => {
          await reactorRef.current.setAudioPrompt({ prompt })
        },
      })
      return
    }
    director.setTransport(null)
  }, [mode, reactor.status, director])

  // Session ended on its own (grant cap, network drop): keep the broadcast
  // alive in storyboard mode instead of leaving a dead video box on stage.
  const wasReadyRef = useRef(false)
  useEffect(() => {
    if (reactor.status === 'ready') wasReadyRef.current = true
    if (mode === 'live' && wasReadyRef.current && reactor.status === 'disconnected') {
      wasReadyRef.current = false
      setMode('offline')
      modeRef.current = 'offline'
      setNotice('Live session ended — continuing as a prompt storyboard.')
    }
  }, [mode, reactor.status])

  const enqueueTrigger = useCallback((trigger: BroadcastTrigger, snapshot: ArenaSnapshot) => {
    if (modeRef.current === 'off') return
    director.enqueue(buildBroadcastIntent(trigger, snapshot))
  }, [director])

  const arm = useCallback((next: Exclude<BroadcastMode, 'off'>) => {
    setMode(next)
    modeRef.current = next
    setConnectionError(null)
    setCommandError(null)
    setTimeline([])
    setAiring(null)
    setNotice(null)
    wasReadyRef.current = false
    director.resetScene()
    lastShotKeyRef.current = null
    prevLiveRef.current = null
  }, [director])

  const disarm = useCallback(() => {
    setMode('off')
    setAiring(null)
    modeRef.current = 'off'
    // Flushes the pending slot and drops the transport so nothing dispatches
    // after the feed is cut.
    director.setEnabled(false)
    director.setEnabled(true)
    lastShotKeyRef.current = null
    prevLiveRef.current = null
    const current = reactorRef.current
    if (current.status === 'ready' || current.status === 'waiting' || current.status === 'connecting') {
      void current.disconnect().catch(() => undefined)
    }
  }, [director])

  const connectLive = useCallback(async () => {
    arm('live')
    setConnecting(true)
    try {
      await reactorRef.current.connect()
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error))
    } finally {
      setConnecting(false)
    }
  }, [arm])

  // Once the session is ready, warm settings before the first frame: a fixed
  // seed keeps demo reels comparable, and model audio is on when the
  // deployment has an audio track (rejected silently otherwise).
  useEffect(() => {
    if (mode !== 'live' || reactor.status !== 'ready') return
    void reactor.setSeed({ seed: 20261001 }).catch(() => undefined)
    void reactor.setAudioEnabled({ audio_enabled: true }).catch(() => undefined)
  }, [mode, reactor.status, reactor])

  // Event feed — the world changes, prompts follow. Review mode replays the
  // recorded storyboard; live phases diff consecutive published snapshots for
  // the same recorded-fact transitions.
  useEffect(() => {
    if (mode === 'off') {
      prevLiveRef.current = null
      return
    }
    if (view.phase === 'review') {
      const recording = session.activeRecording()
      if (storyboardRef.current?.recording !== recording) {
        storyboardRef.current = { recording, shots: planCinematicShots(recording) }
        lastShotKeyRef.current = null
        director.resetScene()
      }
      const shot = shotAt(storyboardRef.current.shots, view.replayIndex)
      if (!shot) return
      const key = `${shot.fromIndex}:${shot.kind}`
      if (key === lastShotKeyRef.current) return
      lastShotKeyRef.current = key
      enqueueTrigger(triggerFromShot(shot), view.episode)
      return
    }
    if (view.phase === 'running' || view.phase === 'paused') {
      const prev = prevLiveRef.current
      prevLiveRef.current = view.episode
      if (!prev) {
        enqueueTrigger(
          { kind: 'establish', agentId: null, reason: 'match opens', priority: BROADCAST_TRIGGER_PRIORITIES.establish },
          view.episode,
        )
        return
      }
      for (const trigger of broadcastTriggersBetween(prev, view.episode)) {
        enqueueTrigger(trigger, view.episode)
      }
      return
    }
    prevLiveRef.current = null
  }, [mode, view, session, director, enqueueTrigger])

  const liveModelState = reactor.status === 'ready' ? modelState : null
  const showPriming = priming && reactor.status === 'ready'
  const statusLabel = mode === 'offline'
    ? 'Storyboard mode'
    : mode === 'off'
      ? 'Off air'
      : (STATUS_LABELS[reactor.status] ?? reactor.status)

  return (
    <section className={styles.broadcastPanel} aria-label="Orbis broadcast">
      <div className={styles.replayHead}>
        <strong>Orbis broadcast</strong>
        <span className={styles.broadcastStatus} data-live={mode === 'live' && reactor.status === 'ready'}>
          {statusLabel}
        </span>
        {mode === 'off' ? (
          <>
            <button
              type="button"
              className={styles.frameCoachButton}
              onClick={() => void connectLive()}
              disabled={connecting}
              title="Connect a Reactor session and let Orbis render this world as it changes"
            >
              <Radio size={13} />
              {connecting ? 'Connecting…' : 'Go live'}
            </button>
            <button
              type="button"
              className={styles.frameCoachButton}
              onClick={() => arm('offline')}
              title="Preview the prompt feed without a Reactor session"
            >
              Storyboard
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.frameCoachButton}
            aria-pressed="true"
            onClick={disarm}
            title="End the broadcast and disconnect the session"
          >
            <Square size={13} />
            Cut feed
          </button>
        )}
      </div>

      {mode !== 'off' && (
        <div className={styles.broadcastStage}>
          {mode === 'live' ? (
            <>
              <ViskoOrbisDynamicMainVideoView
                className={styles.broadcastVideo}
                videoObjectFit="cover"
                audioTrack="main_audio"
              />
              {airing && !showPriming && reactor.status === 'ready' && (
                <div className={styles.broadcastLowerThird} key={airing.reason} aria-live="polite">
                  <strong>{airing.kind}</strong>
                  <span>{airing.reason}</span>
                </div>
              )}
              {(reactor.status !== 'ready' || showPriming) && (
                <div className={styles.broadcastOverlay}>
                  <span>{showPriming ? 'Priming stream' : 'Live video waits for connection'}</span>
                </div>
              )}
            </>
          ) : (
            <div className={styles.broadcastStoryboard} aria-live="polite">
              <span>Prompt storyboard — not generated video</span>
              <p>{activePrompt || 'Play or scrub the match; each new beat lands here as a prompt.'}</p>
            </div>
          )}
        </div>
      )}

      {notice && <p className={styles.correctionNote}>{notice}</p>}
      {connectionError && <p className={styles.correctionNote}>Connection: {connectionError}</p>}
      {commandError && <p className={styles.correctionNote}>Orbis: {commandError}</p>}
      {mode === 'live' && liveModelState && (
        <p className={styles.correctionNote}>chunk {liveModelState.current_chunk}</p>
      )}

      {mode !== 'off' && timeline.length > 0 && (
        <ul className={styles.broadcastTimeline}>
          {timeline.map(entry => (
            <li key={entry.id} data-status={entry.status}>
              <span>{entry.intent.kind}</span>
              <em>{entry.intent.reason}</em>
            </li>
          ))}
        </ul>
      )}
      {mode !== 'off' && (
        <p className={styles.correctionNote}>
          Presentation only — the replay-cam and scoreboard stay authoritative.
        </p>
      )}
    </section>
  )
}
