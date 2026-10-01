import type { BroadcastIntent } from './arenaBroadcast'

/**
 * OrbisDirector converts broadcast intents into rate-limited prompt
 * dispatches. Transport-agnostic: a live session injects `setPrompt`, while
 * storyboard mode and tests observe queued intents without credentials.
 * Orbis emits a chunk about every 1.8 s, so prompts are held to that cadence
 * and coalesced — a fast sequence of events lands as its most dramatic beat
 * rather than a backlog of stale prompts.
 */

export interface OrbisTransport {
  setPrompt(prompt: string): Promise<void> | void
  /** Optional: Orbis audio-track steering. Omit when the transport has no audio. */
  setAudioPrompt?: (prompt: string) => Promise<void> | void
}

export interface OrbisDirectorOptions {
  enabled?: boolean
  minDispatchIntervalMs?: number
  now?: () => number
}

export type OrbisDirectorEventType = 'queued' | 'dispatched' | 'failed'

export interface OrbisDirectorEvent {
  type: OrbisDirectorEventType
  intent: BroadcastIntent
  error?: string
}

const DEFAULT_MIN_DISPATCH_INTERVAL_MS = 1800

export class OrbisDirector {
  private enabled: boolean
  private readonly minDispatchIntervalMs: number
  private readonly now: () => number
  private transport: OrbisTransport | null = null
  private pending: BroadcastIntent | null = null
  private dispatchTimer: ReturnType<typeof setTimeout> | null = null
  private lastDispatchAt = -Infinity
  private dispatched = false
  private flushing = false
  private listeners = new Set<(event: OrbisDirectorEvent) => void>()

  constructor(options: OrbisDirectorOptions = {}) {
    this.enabled = options.enabled ?? true
    this.minDispatchIntervalMs = options.minDispatchIntervalMs ?? DEFAULT_MIN_DISPATCH_INTERVAL_MS
    this.now = options.now ?? (() => Date.now())
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (enabled) return
    if (this.dispatchTimer !== null) clearTimeout(this.dispatchTimer)
    this.dispatchTimer = null
    this.pending = null
    this.transport = null
  }

  /** True once at least one prompt has actually shipped since reset. */
  hasDispatched(): boolean {
    return this.dispatched
  }

  /** Next dispatch opens a fresh scene (initial prompt, not a delta). */
  resetScene() {
    this.dispatched = false
  }

  setTransport(transport: OrbisTransport | null) {
    if (this.transport === transport) return
    this.transport = transport
    if (transport) this.scheduleFlush(this.lastDispatchAt === -Infinity ? 0 : undefined)
  }

  onEvent(listener: (event: OrbisDirectorEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(type: OrbisDirectorEventType, intent: BroadcastIntent, error?: string) {
    const event: OrbisDirectorEvent = { type, intent, error }
    for (const listener of this.listeners) listener(event)
  }

  /**
   * Queue an intent. Keeps the highest-priority pending prompt; on a tie the
   * newest wins so a fast match never replays stale states.
   */
  enqueue(intent: BroadcastIntent): BroadcastIntent | null {
    if (!this.enabled) return null
    if (!this.pending || intent.priority >= this.pending.priority) {
      this.pending = intent
      this.emit('queued', intent)
      this.scheduleFlush()
    }
    return intent
  }

  getPendingIntent(): BroadcastIntent | null {
    return this.pending
  }

  private scheduleFlush(overrideDelay?: number) {
    if (this.dispatchTimer !== null || this.flushing) return
    const elapsed = this.now() - this.lastDispatchAt
    const delay = overrideDelay ?? Math.max(0, this.minDispatchIntervalMs - elapsed)
    this.dispatchTimer = setTimeout(() => {
      this.dispatchTimer = null
      void this.flush()
    }, delay)
  }

  private async flush() {
    if (this.flushing) return
    const intent = this.pending
    const transport = this.transport
    if (!intent || !transport || !this.enabled) return
    this.pending = null
    this.flushing = true

    try {
      // The initial/delta decision lands at dispatch, not enqueue: whichever
      // intent survives the pending slot opens the scene if nothing has
      // shipped yet.
      const { prompt, audioPrompt } = intent.build(!this.dispatched)
      await transport.setPrompt(prompt)
      // Audio prompt is best-effort: a deployment without an audio track
      // rejects set_audio_prompt, and that must not fail the visual prompt.
      if (audioPrompt && transport.setAudioPrompt) {
        try {
          await transport.setAudioPrompt(audioPrompt)
        } catch {
          console.warn('OrbisDirector: audio prompt rejected (visual prompt still dispatched)')
        }
      }
      if (this.transport !== transport) return
      this.dispatched = true
      this.lastDispatchAt = this.now()
      this.emit('dispatched', intent)
    } catch {
      if (this.transport !== transport) return
      this.emit('failed', intent, 'prompt dispatch failed')
    } finally {
      this.flushing = false
      if (this.pending && this.transport && this.enabled) this.scheduleFlush()
    }
  }

  dispose() {
    if (this.dispatchTimer !== null) clearTimeout(this.dispatchTimer)
    this.dispatchTimer = null
    this.pending = null
    this.transport = null
    this.dispatched = false
    this.flushing = false
    this.listeners.clear()
  }
}
