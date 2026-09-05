import type { ArenaCourse } from './arenaCourse'
import type { ArenaMotion } from './arenaPhysics'
import type { ArenaRecording, ArenaSnapshot } from './arenaEpisode'
import { ArenaRunner, type CollectorStrategy } from './arenaPolicy'

export type ArenaPhase = 'ready' | 'running' | 'paused' | 'finished' | 'review' | 'error'
export interface ArenaSessionView {
  phase: ArenaPhase
  episode: ArenaSnapshot
  policies: Readonly<Record<string, CollectorStrategy>>
  replayIndex: number
  replayLength: number
  error: string | null
}

export class ArenaSession {
  #course: ArenaCourse
  #motion: ArenaMotion
  #runner: ArenaRunner
  #policies: Record<string, CollectorStrategy> = { champion: 'safe', rival: 'weather' }
  #view: ArenaSessionView
  #review: ArenaRecording | null = null
  #returnPhase: 'paused' | 'finished' = 'paused'
  #listeners = new Set<() => void>()
  #disposed = false

  constructor(course: ArenaCourse, motion: ArenaMotion) {
    this.#course = structuredClone(course)
    this.#motion = motion
    this.#runner = new ArenaRunner(this.#course.scenario, this.#policies, motion)
    this.#view = this.#initialView()
  }

  #initialView(): ArenaSessionView {
    return { phase: 'ready', episode: this.#runner.snapshot(), policies: { ...this.#policies }, replayIndex: 0, replayLength: 0, error: null }
  }

  #assertActive() {
    if (this.#disposed) throw new Error('Arena session is disposed')
  }

  #publish(update: Partial<ArenaSessionView>) {
    this.#view = { ...this.#view, ...update }
    for (const listener of this.#listeners) listener()
  }

  getSnapshot = () => this.#view

  subscribe = (listener: () => void) => {
    this.#assertActive()
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  selectPolicy(agentId: string, strategy: CollectorStrategy) {
    this.#assertActive()
    if (this.#view.phase !== 'ready') throw new Error('Policy selection is locked until the episode is reset')
    if (!this.#course.scenario.entrants.some(entrant => entrant.id === agentId)) throw new Error('Unknown entrant')
    const policies = { ...this.#policies, [agentId]: strategy }
    const runner = new ArenaRunner(this.#course.scenario, policies, this.#motion)
    this.#policies = policies
    this.#runner = runner
    this.#publish(this.#initialView())
  }

  start() {
    this.#assertActive()
    if (this.#view.phase !== 'ready' && this.#view.phase !== 'paused') throw new Error('Reset the episode before starting another run')
    this.#publish({ phase: 'running' })
  }

  pause() {
    this.#assertActive()
    if (this.#view.phase === 'running') this.#publish({ phase: 'paused' })
  }

  advanceMicroseconds(elapsedUs: number) {
    this.#assertActive()
    if (this.#view.phase !== 'running') return
    try {
      const ticks = this.#runner.advanceMicroseconds(elapsedUs, 8)
      if (ticks === 0) return
      const episode = this.#runner.snapshot()
      this.#publish({ episode, phase: episode.status === 'finished' ? 'finished' : 'running' })
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Simulation failed')
    }
  }

  fail(message: string) {
    this.#assertActive()
    this.#publish({ phase: 'error', error: message })
  }

  reset() {
    this.#assertActive()
    this.#runner.reset()
    this.#review = null
    this.#returnPhase = 'paused'
    this.#publish(this.#initialView())
  }

  review() {
    this.#assertActive()
    if (this.#view.phase !== 'paused' && this.#view.phase !== 'finished') throw new Error('Pause or finish the run before reviewing it')
    this.#returnPhase = this.#view.phase
    this.#review = this.#runner.recording()
    this.#publish({ phase: 'review', episode: structuredClone(this.#review.checkpoints[0].state), replayIndex: 0, replayLength: this.#review.checkpoints.length })
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
    this.#review = null
    this.#publish({ phase: this.#returnPhase, episode: this.#runner.snapshot(), replayIndex: 0, replayLength: 0 })
  }

  recording() {
    this.#assertActive()
    return this.#runner.recording()
  }

  dispose() {
    if (this.#disposed) return
    this.#disposed = true
    this.#listeners.clear()
    this.#motion.dispose()
  }
}
