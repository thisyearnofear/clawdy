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
  bump: { frequency: 260, duration: 0.25, type: 'sine', gain: 0.7 },
}

type CueName = 'collect' | 'bank' | 'drain' | 'recovery' | 'bump'

const SAMPLE_BASE = '/assets/kenney/sci-fi-sounds'
const SAMPLE_CUES: Record<CueName, { url: string; gain: number }> = {
  collect: { url: `${SAMPLE_BASE}/collect.wav`, gain: 0.6 },
  bank: { url: `${SAMPLE_BASE}/bank.wav`, gain: 0.6 },
  drain: { url: `${SAMPLE_BASE}/drain.wav`, gain: 0.6 },
  recovery: { url: `${SAMPLE_BASE}/impact.wav`, gain: 0.45 },
  bump: { url: `${SAMPLE_BASE}/impact.wav`, gain: 0.45 },
}
const ENGINE_URL = `${SAMPLE_BASE}/engine.wav`
const MOTOR_GAIN = 0.18
const MAX_ONESHOTS = 12

type AudioContextCtor = new () => AudioContext

function audioContextCtor(): AudioContextCtor | null {
  const g = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return g.AudioContext ?? g.webkitAudioContext ?? null
}

export function isAudioSupported(): boolean {
  return audioContextCtor() !== null
}

type LiveVoice = { source: AudioScheduledSourceNode; gain: GainNode; oneShot?: boolean }

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
  #buffers = new Map<string, AudioBuffer>()
  #sampleAbort: AbortController | null = null
  #motor: LiveVoice | null = null
  #lastTick = 0
  #attachMatchId: string | null = null
  #attachTick = 0

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
        this.#loadSamples(this.#context)
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

  #loadSamples(context: AudioContext) {
    if (typeof fetch !== 'function' || typeof context.decodeAudioData !== 'function') return
    const abort = new AbortController()
    this.#sampleAbort?.abort()
    this.#sampleAbort = abort
    const urls = [...new Set([ENGINE_URL, ...Object.values(SAMPLE_CUES).map(cue => cue.url)])]
    for (const url of urls) {
      fetch(url, { signal: abort.signal })
        .then(response => {
          if (!response.ok) throw new Error(`sample ${url} ${response.status}`)
          return response.arrayBuffer()
        })
        .then(data => {
          if (abort.signal.aborted || this.#disposed || this.#context !== context) return null
          return context.decodeAudioData(data)
        })
        .then(buffer => {
          if (!buffer || abort.signal.aborted || this.#disposed || this.#context !== context) return
          this.#buffers.set(url, buffer)
        })
        .catch(() => { })
    }
  }

  #stopVoice(voice: LiveVoice) {
    try { voice.source.stop() } catch { /* already stopped */ }
    try { voice.source.disconnect() } catch { /* detached */ }
    try { voice.gain.disconnect() } catch { /* detached */ }
  }

  #stopVoices() {
    for (const voice of this.#voices) this.#stopVoice(voice)
    this.#voices.clear()
    this.#motor = null
  }

  #addVoice(source: AudioScheduledSourceNode, gain: GainNode, oneShot = false): LiveVoice {
    if (oneShot) {
      const oneshots = [...this.#voices].filter(voice => voice.oneShot)
      if (oneshots.length >= MAX_ONESHOTS) {
        const oldest = oneshots[0]
        this.#voices.delete(oldest)
        this.#stopVoice(oldest)
      }
    }
    const voice: LiveVoice = { source, gain, oneShot }
    this.#voices.add(voice)
    source.onended = () => {
      this.#voices.delete(voice)
      if (this.#motor === voice) this.#motor = null
      try { source.disconnect() } catch { /* detached */ }
      try { gain.disconnect() } catch { /* detached */ }
    }
    return voice
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
    this.#addVoice(osc, gain, true)
    osc.start(now)
    osc.stop(now + spec.duration + 0.05)
  }

  #sample(name: CueName): boolean {
    if (!this.#enabled || !this.#context || !this.#master || this.#context.state !== 'running') return false
    const cue = SAMPLE_CUES[name]
    const buffer = this.#buffers.get(cue.url)
    if (!buffer) return false
    const source = this.#context.createBufferSource()
    const gain = this.#context.createGain()
    source.buffer = buffer
    gain.gain.value = cue.gain
    source.connect(gain).connect(this.#master)
    this.#addVoice(source, gain, true)
    source.start()
    return true
  }

  #cue(name: CueName | keyof typeof TONES) {
    if (name in SAMPLE_CUES && this.#sample(name as CueName)) return
    if (name in TONES) this.#tone(name)
  }

  #startMotor() {
    if (this.#motor || !this.#enabled || !this.#context || !this.#master || this.#context.state !== 'running') return
    const buffer = this.#buffers.get(ENGINE_URL)
    if (!buffer) return
    const source = this.#context.createBufferSource()
    const gain = this.#context.createGain()
    source.buffer = buffer
    source.loop = true
    gain.gain.value = MOTOR_GAIN
    source.connect(gain).connect(this.#master)
    this.#motor = this.#addVoice(source, gain)
    source.start()
  }

  #stopMotor() {
    const motor = this.#motor
    if (!motor) return
    this.#motor = null
    this.#voices.delete(motor)
    this.#stopVoice(motor)
  }

  #once(key: string, cue: CueName | keyof typeof TONES) {
    if (this.#played.has(key)) return
    this.#played.add(key)
    this.#cue(cue)
  }

  #matchScope(matchId: string) {
    // Fresh match → fresh dedupe/weather memory, so a new run can't inherit a flood-off cue.
    if (matchId === this.#matchId) return
    this.#matchId = matchId
    this.#played.clear()
    this.#lastFlooded = null
    this.#recoveries.clear()
    this.#lastTick = matchId === this.#attachMatchId ? this.#attachTick : 0
    this.#stopMotor()
  }

  attach(session: ArenaSession) {
    this.#attachMatchId = session.matchId ?? null
    this.#attachTick = session.getSnapshot().episode?.tick ?? 0
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
      episode: {
        weather: { flooded: boolean }
        agents: { id: string; recoveries: number; transit?: unknown; staggeredUntilTick?: number }[]
        events?: { type: string; tick: number; winnerId?: string; loserId?: string }[]
      }
    }) => {
      if (session.getSnapshot().phase !== 'running') return
      this.#matchScope(event.matchId)
      for (const episodeEvent of event.episode.events ?? []) {
        if (episodeEvent.type !== 'bump') continue
        if (episodeEvent.tick <= this.#lastTick || episodeEvent.tick > event.tick) continue
        this.#once(`${event.matchId}:${episodeEvent.tick}:${episodeEvent.winnerId}:${episodeEvent.loserId}:bump`, 'bump')
      }
      this.#lastTick = event.tick
      const champion = event.episode.agents.find(agent => agent.id === 'champion')
      const moving = Boolean(champion?.transit) && !(typeof champion?.staggeredUntilTick === 'number' && champion.staggeredUntilTick > event.tick)
      if (moving) this.#startMotor()
      else this.#stopMotor()
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
    const onPhase = (event: { current: string }) => {
      if (event.current !== 'running') this.#stopVoices()
    }
    this.#unsubscribes.push(
      session.on('action_result', onAction),
      session.on('tick', onTick),
      session.on('match_end', onEnd),
      session.on('phase', onPhase),
    )
  }

  dispose() {
    this.#disposed = true
    this.#enableToken += 1
    this.#resumePromise = null
    for (const unsubscribe of this.#unsubscribes.splice(0)) unsubscribe()
    this.#sampleAbort?.abort()
    this.#sampleAbort = null
    this.#buffers.clear()
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
