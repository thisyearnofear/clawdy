import type { ArenaCourse } from './arenaCourse'
import type { ArenaMotion } from './arenaPhysics'
import type { SurfaceSample } from './worldSurface'
import { type ArenaObservation, type ArenaRecording, type ArenaSnapshot, observeSnapshot } from './arenaEpisode'
import { ArenaRunner, type CollectorStrategy, type EntrantPolicyOption } from './arenaPolicy'
import { type PolicyCheckpoint, SEASON_0_BASE_CHECKPOINT } from './policyModel'
import { type ArenaEvent, type ArenaEventListener, type ArenaPhase } from './arenaProtocol'

export type { ArenaPhase, ArenaEvent, ArenaEventListener } from './arenaProtocol'

export interface ArenaSessionView {
  phase: ArenaPhase
  episode: ArenaSnapshot
  policies: Readonly<Record<string, CollectorStrategy>>
  checkpoint: PolicyCheckpoint | null
  replayIndex: number
  replayLength: number
  error: string | null
  scored: boolean
}

function makeMatchId(): string {
  return `match-${Date.now()}-${Math.floor(Math.random() * 1_000_000).toString(36)}`
}

export class ArenaSession {
  #course: ArenaCourse
  #motion: ArenaMotion
  #runner: ArenaRunner
  #policies: Record<string, CollectorStrategy> = { champion: 'learned', rival: 'weather' }
  #checkpoint: PolicyCheckpoint = SEASON_0_BASE_CHECKPOINT
  #view: ArenaSessionView
  #review: ArenaRecording | null = null
  #returnPhase: 'ready' | 'paused' | 'finished' = 'paused'
  #listeners = new Set<() => void>()
  #eventListeners = new Map<string, Set<ArenaEventListener<ArenaEvent['type']>>>()
  #matchId = makeMatchId()
  #ended = false
  #disposed = false
  #scored = false

  constructor(course: ArenaCourse, motion: ArenaMotion) {
    this.#course = structuredClone(course)
    this.#motion = motion
    this.#runner = this.#createRunner(this.#policies, this.#checkpoint)
    this.#view = this.#initialView()
  }

  #createRunner(policies: Record<string, CollectorStrategy>, checkpoint: PolicyCheckpoint) {
    const options: Record<string, EntrantPolicyOption> = {}
    for (const [id, strategy] of Object.entries(policies)) {
      if (strategy === 'learned') {
        options[id] = { strategy: 'learned', checkpoint, energyPatienceMinRemaining: 400 }
      } else {
        options[id] = strategy
      }
    }
    const runner = new ArenaRunner(this.#course.scenario, options, this.#motion)
    runner.setDecisionListener((event) => {
      this.#emit({
        type: 'decision',
        matchId: this.#matchId,
        agentId: event.agentId,
        sequence: event.sequence,
        tick: event.tick,
        action: event.action,
      })
      this.#emit({
        type: 'decision_ack',
        matchId: this.#matchId,
        agentId: event.agentId,
        sequence: event.sequence,
        tick: event.tick,
        accepted: event.outcome.accepted,
        reason: event.outcome.reason,
      })
    })
    return runner
  }

  #initialView(): ArenaSessionView {
    return {
      phase: 'ready',
      episode: this.#runner.snapshot(),
      policies: { ...this.#policies },
      checkpoint: this.#checkpoint,
      replayIndex: 0,
      replayLength: 0,
      error: null,
      scored: this.#scored,
    }
  }

  #assertActive() {
    if (this.#disposed) throw new Error('Arena session is disposed')
  }

  #assertNotScored(action: string) {
    if (this.#scored) throw new Error(`Cannot ${action} on a scored match`)
  }

  #publish(update: Partial<ArenaSessionView>) {
    this.#view = { ...this.#view, ...update }
    for (const listener of this.#listeners) listener()
  }

  #emit(event: ArenaEvent) {
    const listeners = this.#eventListeners.get(event.type)
    if (listeners) {
      for (const listener of listeners) listener(event)
    }
  }

  #emitPhase(previous: ArenaPhase, current: ArenaPhase) {
    if (previous !== current) this.#emit({ type: 'phase', matchId: this.#matchId, previous, current })
  }

  #policyVersion(agentId: string): string {
    const strategy = this.#policies[agentId]
    if (strategy === 'learned') return this.#checkpoint.id
    return strategy
  }

  getSnapshot = () => this.#view

  subscribe = (listener: () => void) => {
    this.#assertActive()
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  on<T extends ArenaEvent['type']>(type: T, listener: ArenaEventListener<T>) {
    this.#assertActive()
    if (!this.#eventListeners.has(type)) this.#eventListeners.set(type, new Set())
    this.#eventListeners.get(type)!.add(listener as unknown as ArenaEventListener<ArenaEvent['type']>)
    return () => this.off(type, listener)
  }

  off<T extends ArenaEvent['type']>(type: T, listener: ArenaEventListener<T>) {
    this.#assertActive()
    const listeners = this.#eventListeners.get(type)
    if (listeners) listeners.delete(listener as unknown as ArenaEventListener<ArenaEvent['type']>)
  }

  setScored(scored: boolean) {
    this.#assertActive()
    if (this.#view.phase !== 'ready') throw new Error('Cannot change scored flag after the match has started')
    this.#scored = scored
    this.#publish({ scored })
  }

  setCourse(course: ArenaCourse) {
    this.#assertActive()
    if (this.#view.phase !== 'ready') throw new Error('Cannot change the course after the match has started')
    this.#course = structuredClone(course)
    this.#runner = this.#createRunner(this.#policies, this.#checkpoint)
    this.#publish(this.#initialView())
  }

  get scored() {
    return this.#scored
  }

  selectPolicy(agentId: string, strategy: CollectorStrategy, checkpoint?: PolicyCheckpoint) {
    this.#assertActive()
    this.#assertNotScored('change policy')
    if (this.#view.phase !== 'ready') throw new Error('Policy selection is locked until the episode is reset')
    if (!this.#course.scenario.entrants.some(entrant => entrant.id === agentId)) throw new Error('Unknown entrant')
    const policies = { ...this.#policies, [agentId]: strategy }
    if (checkpoint) this.#checkpoint = checkpoint
    const runner = this.#createRunner(policies, this.#checkpoint)
    this.#policies = policies
    this.#runner = runner
    this.#publish(this.#initialView())
    if (this.#view.phase === 'ready' && this.#matchId) {
      this.#emit({ type: 'policy_change', matchId: this.#matchId, agentId, strategy, checkpointId: this.#checkpoint.id })
    }
  }

  setCheckpoint(checkpoint: PolicyCheckpoint) {
    this.#assertActive()
    this.#assertNotScored('change checkpoint')
    if (this.#view.phase !== 'ready') throw new Error('Policy selection is locked until the episode is reset')
    this.#checkpoint = checkpoint
    const runner = this.#createRunner(this.#policies, this.#checkpoint)
    this.#runner = runner
    this.#publish(this.#initialView())
  }

  start() {
    this.#assertActive()
    if (this.#view.phase !== 'ready' && this.#view.phase !== 'paused') throw new Error('Reset the episode before starting another run')
    const previous = this.#view.phase
    this.#publish({ phase: 'running' })
    this.#emitPhase(previous, 'running')
    const players = this.#course.scenario.entrants.map(entrant => ({
      id: entrant.id,
      policyVersion: this.#policyVersion(entrant.id),
    }))
    const episode = this.#view.episode
    this.#emit({
      type: 'match_start',
      matchId: this.#matchId,
      scenarioId: this.#course.scenario.id,
      rulesVersion: episode.rulesVersion,
      controllerVersion: episode.controllerVersion,
      players,
      scored: this.#scored,
    })
  }

  pause() {
    this.#assertActive()
    if (this.#view.phase === 'running') {
      const previous = this.#view.phase
      this.#publish({ phase: 'paused' })
      this.#emitPhase(previous, 'paused')
    }
  }

  advanceMicroseconds(elapsedUs: number) {
    this.#assertActive()
    if (this.#view.phase !== 'running') return
    try {
      const previousPhase = this.#view.phase
      const ticks = this.#runner.advanceMicroseconds(elapsedUs, 8)
      if (ticks === 0) return
      const episode = this.#runner.snapshot()
      this.#publish({ episode, phase: episode.status === 'finished' ? 'finished' : 'running' })
      this.#emitPhase(previousPhase, this.#view.phase)
      this.#emit({ type: 'tick', matchId: this.#matchId, tick: episode.tick, episode })
      for (const agent of episode.agents) {
        const outcome = agent.lastOutcome
        if (outcome && outcome.tick === episode.tick) {
          this.#emit({
            type: 'action_result',
            matchId: this.#matchId,
            agentId: agent.id,
            tick: outcome.tick,
            action: outcome.action,
            accepted: outcome.accepted,
            reason: outcome.reason,
          })
        }
      }
      if (episode.status === 'finished' && !this.#ended) {
        this.#ended = true
        const score: Record<string, number> = {}
        for (const agent of episode.agents) score[agent.id] = agent.banked
        this.#emit({ type: 'match_end', matchId: this.#matchId, outcome: 'finished', score })
      }
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Simulation failed')
    }
  }

  fail(message: string) {
    this.#assertActive()
    const previous = this.#view.phase
    this.#publish({ phase: 'error', error: message })
    this.#emitPhase(previous, 'error')
    if (!this.#ended) {
      this.#ended = true
      this.#emit({ type: 'error', matchId: this.#matchId, message })
      this.#emit({ type: 'match_end', matchId: this.#matchId, outcome: 'error', score: {} })
    }
  }

  reset() {
    this.#assertActive()
    this.#runner.reset()
    this.#review = null
    this.#returnPhase = 'paused'
    this.#matchId = makeMatchId()
    this.#ended = false
    this.#publish(this.#initialView())
  }

  review() {
    this.#assertActive()
    if (this.#view.phase !== 'paused' && this.#view.phase !== 'finished') throw new Error('Pause or finish the run before reviewing it')
    const previous = this.#view.phase
    this.#returnPhase = this.#view.phase
    this.#review = this.#runner.recording()
    this.#publish({ phase: 'review', episode: structuredClone(this.#review.checkpoints[0].state), replayIndex: 0, replayLength: this.#review.checkpoints.length })
    this.#emitPhase(previous, 'review')
  }

  /**
   * Review an external recording (e.g. a tournament match that did not run in
   * this session). The recording is presented, never re-simulated.
   */
  reviewFrom(recording: ArenaRecording) {
    this.#assertActive()
    if (this.#view.phase === 'running') throw new Error('Pause the run before reviewing a recorded match')
    if (recording?.schemaVersion !== 'arena-recording-v1' || !Array.isArray(recording.checkpoints) ||
        recording.checkpoints.length === 0 || !recording.checkpoints[0]?.state?.agents?.length) {
      if (recording?.schemaVersion !== 'arena-recording-v1') {
        throw new Error(`recording-schema-mismatch (got ${recording?.schemaVersion}, want arena-recording-v1)`)
      }
      throw new Error('Invalid or empty arena recording')
    }
    const previous = this.#view.phase
    if (previous !== 'review') this.#returnPhase = previous === 'error' ? 'paused' : previous
    this.#review = recording
    this.#publish({ phase: 'review', episode: structuredClone(recording.checkpoints[0].state), replayIndex: 0, replayLength: recording.checkpoints.length })
    this.#emitPhase(previous, 'review')
  }

  /** The recording under review, or the live run's recording when not reviewing. */
  activeRecording(): ArenaRecording {
    this.#assertActive()
    return this.#review ?? this.#runner.recording()
  }

  seek(index: number) {
    this.#assertActive()
    if (this.#view.phase !== 'review' || !this.#review || !Number.isSafeInteger(index) || index < 0 || index >= this.#review.checkpoints.length) {
      throw new Error('Invalid replay frame')
    }
    this.#publish({ episode: structuredClone(this.#review.checkpoints[index].state), replayIndex: index })
  }

  returnToRun() {
    this.#assertActive()
    if (this.#view.phase !== 'review') return
    const previous = this.#view.phase
    this.#review = null
    this.#publish({ phase: this.#returnPhase, episode: this.#runner.snapshot(), replayIndex: 0, replayLength: 0 })
    this.#emitPhase(previous, this.#returnPhase)
  }

  reviewObservation(agentId = 'champion', forceDecision = true): ArenaObservation | null {
    this.#assertActive()
    if (this.#view.phase !== 'review' || !this.#review || !this.#view.episode) return null
    return observeSnapshot(this.#course.scenario, this.#view.episode, agentId, { forceDecision })
  }

  observe(agentId: string, options?: { forceDecision?: boolean }): ArenaObservation {
    this.#assertActive()
    if (this.#view.phase === 'review' && this.#view.episode) {
      return observeSnapshot(this.#course.scenario, this.#view.episode, agentId, {
        forceDecision: options?.forceDecision ?? true,
      })
    }
    return this.#runner.observe(agentId, options)
  }

  sampleGround(position: [number, number, number]): SurfaceSample | null {
    this.#assertActive()
    if ('sample' in this.#motion) return (this.#motion as { sample: (pos: [number, number, number], maxDistance?: number) => SurfaceSample | null }).sample(position, 20)
    return null
  }

  recording() {
    this.#assertActive()
    return this.#runner.recording()
  }

  dispose() {
    if (this.#disposed) return
    this.#disposed = true
    this.#listeners.clear()
    this.#eventListeners.clear()
    this.#motion.dispose()
  }
}
