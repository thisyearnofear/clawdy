import type { ArenaAction } from './arenaEpisode'
import type { ArenaSession } from './arenaSession'

const MASTER_GAIN = 0.12

type ToneSpec = { frequency: number; duration: number; type: OscillatorType; gain: number }

const TONES: Record<string, ToneSpec> = {
  collect: { frequency: 660, duration: 0.14, type: 'sine', gain: 1 },
  bank: { frequency: 440, duration: 0.22, type: 'triangle', gain: 1 },
  drain: { frequency: 220, duration: 0.3, type: 'triangle', gain: 0.9 },
  'flood-on': { frequency: 180, duration: 0.4, type: 'sine', gain: 0.8 },
  'flood-off': { frequency: 300, duration: 0.3, type: 'sine', gain: 0.7 },
  finish: { frequency: 520, duration: 0.5, type: 'triangle', gain: 1 },
  recovery: { frequency: 260, duration: 0.25, type: 'sine', gain: 0.7 },
}

type AudioContextCtor = new () => AudioContext

function audioContextCtor(): AudioContextCtor | null {
  const g = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return g.AudioContext ?? g.webkitAudioContext ?? null
}

export function isAudioSupported(): boolean {
  return audioContextCtor() !== null
}

type LiveVoice = { osc: OscillatorNode; gain: GainNode }

export class ArenaSound {
  #context: AudioContext | null = null
  #master: GainNode | null = null
  #unsubscribes: (() => void)[] = []
  #played = new Set<string>()
  #matchId: string | null = null
  #lastFlooded: boolean | null = null
  #recoveries = new Map<string, number>()
  #enabled = false
  #disposed = false
  #unavailable = false
  #enableToken = 0
  #resumePromise: Promise<void> | null = null
  #voices = new Set<LiveVoice>()

  constructor(private readonly onUnavailable?: () => void) {}

  /** True when this runtime can create a Web Audio context. */
  static supported(): boolean {
    return audioContextCtor() !== null
  }

  get unlocked(): boolean {
    return this.#context !== null
  }

  get enabled(): boolean {
    return this.#enabled
  }

  /** Create the context/master. Call only from an explicit user gesture. */
  unlock(): boolean {
    if (this.#disposed || this.#unavailable) return false
    const Ctor = audioContextCtor()
    if (!Ctor) {
      this.#markUnavailable()
      return false
    }
    try {
      if (!this.#context) {
        this.#context = new Ctor()
        this.#master = this.#context.createGain()
        this.#master.gain.value = MASTER_GAIN
        this.#master.connect(this.#context.destination)
      }
    } catch {
      try { this.#master?.disconnect() } catch { }
      const partial = this.#context
      this.#context = null
      this.#master = null
      if (partial && partial.state !== 'closed') {
        try { void partial.close().catch(() => { }) } catch { }
      }
      this.#markUnavailable()
      return false
    }
    return true
  }

  setEnabled(on: boolean): boolean {
    if (!on) {
      this.#enabled = false
      this.#enableToken += 1
      this.#resumePromise = null
      this.#stopVoices()
      this.suspend()
      return true
    }
    if (this.#disposed || this.#unavailable) return false
    if (!this.#enabled) {
      if (!this.#context && !this.unlock()) return false
      this.#enabled = true
      this.#enableToken += 1
    }
    return this.#resumeContext(this.#enableToken)
  }

  /** Suspend output without tearing down (pause / hidden tab). */
  suspend() {
    this.#stopVoices()
    if (this.#context?.state === 'running') {
      void this.#context.suspend().catch(() => { /* non-fatal */ })
    }
  }

  resume() {
    if (!this.#enabled || this.#disposed || this.#unavailable) return
    this.#resumeContext(this.#enableToken)
  }

  #resumeContext(attempt: number): boolean {
    const context = this.#context
    if (!context || this.#disposed || this.#unavailable || !this.#enabled) return false
    if (context.state !== 'suspended') return true
    if (this.#resumePromise) return true
    let promise: Promise<void>
    try {
      promise = context.resume()
    } catch {
      this.#markUnavailable()
      return false
    }
    this.#resumePromise = promise
    promise.then(
      () => {
        if (this.#resumePromise === promise) this.#resumePromise = null
      },
      () => {
        if (this.#resumePromise === promise) this.#resumePromise = null
        if (
          this.#disposed || this.#unavailable || !this.#enabled
          || this.#context !== context || this.#enableToken !== attempt
        ) return
        this.#markUnavailable()
      },
    )
    return true
  }

  #markUnavailable() {
    if (this.#unavailable || this.#disposed) return
    this.#unavailable = true
    this.#enabled = false
    this.#resumePromise = null
    this.#stopVoices()
    try { this.onUnavailable?.() } catch { }
  }

  #stopVoices() {
    for (const voice of this.#voices) {
      try { voice.osc.stop() } catch { /* already stopped */ }
      try { voice.osc.disconnect() } catch { /* detached */ }
      try { voice.gain.disconnect() } catch { /* detached */ }
    }
    this.#voices.clear()
  }

  #tone(name: keyof typeof TONES) {
    if (!this.#enabled || !this.#context || !this.#master || this.#context.state !== 'running') return
    const spec = TONES[name]
    const now = this.#context.currentTime
    const osc = this.#context.createOscillator()
    const gain = this.#context.createGain()
    osc.type = spec.type
    osc.frequency.value = spec.frequency
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(spec.gain, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration)
    osc.connect(gain).connect(this.#master)
    const voice: LiveVoice = { osc, gain }
    this.#voices.add(voice)
    osc.onended = () => {
      this.#voices.delete(voice)
      try { osc.disconnect() } catch { /* detached */ }
      try { gain.disconnect() } catch { /* detached */ }
    }
    osc.start(now)
    osc.stop(now + spec.duration + 0.05)
  }

  #once(key: string, tone: keyof typeof TONES) {
    if (this.#played.has(key)) return
    this.#played.add(key)
    this.#tone(tone)
  }

  #matchScope(matchId: string) {
    // Fresh match → fresh dedupe/weather memory, so a new run can't inherit a flood-off cue.
    if (matchId === this.#matchId) return
    this.#matchId = matchId
    this.#played.clear()
    this.#lastFlooded = null
    this.#recoveries.clear()
  }

  attach(session: ArenaSession) {
    const onAction = (event: {
      matchId: string
      agentId: string
      tick: number
      action: ArenaAction | null
      accepted: boolean
    }) => {
      if (session.getSnapshot().phase !== 'running') return
      if (!event.accepted || !event.action) return
      this.#matchScope(event.matchId)
      const key = `${event.matchId}:${event.tick}:${event.agentId}:${event.action.type}`
      if (event.action.type === 'collect' || event.action.type === 'bank' || event.action.type === 'drain') {
        this.#once(key, event.action.type)
      }
    }
    const onTick = (event: {
      matchId: string
      tick: number
      episode: { weather: { flooded: boolean }; agents: { id: string; recoveries: number }[] }
    }) => {
      if (session.getSnapshot().phase !== 'running') return
      this.#matchScope(event.matchId)
      const flooded = event.episode.weather.flooded
      if (this.#lastFlooded !== null && flooded !== this.#lastFlooded) {
        this.#once(`${event.matchId}:${event.tick}:flood`, flooded ? 'flood-on' : 'flood-off')
      }
      this.#lastFlooded = flooded
      for (const agent of event.episode.agents) {
        const before = this.#recoveries.get(agent.id) ?? agent.recoveries
        if (agent.recoveries > before) {
          this.#once(`${event.matchId}:${event.tick}:${agent.id}:recovery`, 'recovery')
        }
        this.#recoveries.set(agent.id, agent.recoveries)
      }
    }
    const onEnd = (event: { matchId: string; outcome?: string }) => {
      const phase = session.getSnapshot().phase
      if (phase !== 'running' && phase !== 'finished') return
      if (event.outcome !== 'finished') return
      this.#matchScope(event.matchId)
      this.#once(`${event.matchId}:finish`, 'finish')
    }
    this.#unsubscribes.push(
      session.on('action_result', onAction),
      session.on('tick', onTick),
      session.on('match_end', onEnd),
    )
  }

  dispose() {
    this.#disposed = true
    this.#enableToken += 1
    this.#resumePromise = null
    for (const unsubscribe of this.#unsubscribes.splice(0)) unsubscribe()
    this.#stopVoices()
    this.#played.clear()
    this.#recoveries.clear()
    this.#lastFlooded = null
    this.#matchId = null
    this.#enabled = false
    if (this.#context && this.#context.state !== 'closed') {
      void this.#context.close().catch(() => { /* already closed */ })
    }
    this.#context = null
    this.#master = null
  }
}
