import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArenaSound } from '../arenaSound'
import type { ArenaSession } from '../arenaSession'

class FakeOscillator {
  type: OscillatorType = 'sine'
  frequency = { value: 0 }
  connect = vi.fn().mockReturnThis()
  disconnect = vi.fn()
  onended: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
}

class FakeGain {
  gain = {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  }
  connect = vi.fn().mockReturnThis()
  disconnect = vi.fn()
}

class FakeAudioContext {
  static initialState: AudioContextState = 'running'
  static resumeImpl: ((ctx: FakeAudioContext) => Promise<void>) | null = null
  static failCreateGain = false
  state: AudioContextState = FakeAudioContext.initialState
  currentTime = 0
  destination = {}
  oscillators: FakeOscillator[] = []
  createOscillator() { const osc = new FakeOscillator(); this.oscillators.push(osc); return osc }
  createGain() {
    if (FakeAudioContext.failCreateGain) throw new Error('no gain')
    return new FakeGain()
  }
  resume = vi.fn(() => (
    FakeAudioContext.resumeImpl
      ? FakeAudioContext.resumeImpl(this)
      : Promise.resolve().then(() => { this.state = 'running' })
  ))
  suspend = vi.fn(async () => { this.state = 'suspended' })
  close = vi.fn(async () => { this.state = 'closed' })
}

let contexts: FakeAudioContext[] = []

type Listener = (event: never) => void

function stubSession(phase: string) {
  const listeners = new Map<string, Set<Listener>>()
  const session = {
    getSnapshot: () => ({ phase }),
    on: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
      return () => listeners.get(type)?.delete(listener)
    },
    off: (type: string, listener: Listener) => { listeners.get(type)?.delete(listener) },
    emit: (type: string, event: unknown) => {
      for (const listener of listeners.get(type) ?? []) listener(event as never)
    },
  }
  return session as unknown as ArenaSession & { emit: (type: string, event: unknown) => void }
}

const actionEvent = (overrides: Record<string, unknown> = {}) => ({
  matchId: 'm1',
  agentId: 'champion',
  tick: 10,
  action: { type: 'collect', resourceId: 'core-1' },
  accepted: true,
  ...overrides,
})

const tickEvent = (tick: number, flooded: boolean, matchId = 'm1') => ({
  matchId,
  tick,
  episode: { weather: { flooded }, agents: [] },
})

describe('ArenaSound', () => {
  beforeEach(() => {
    contexts = []
    FakeAudioContext.initialState = 'running'
    FakeAudioContext.resumeImpl = null
    FakeAudioContext.failCreateGain = false
    class Tracked extends FakeAudioContext {
      constructor() { super(); contexts.push(this) }
    }
    vi.stubGlobal('AudioContext', Tracked)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates no AudioContext before an explicit unlock gesture', () => {
    const sound = new ArenaSound()
    const session = stubSession('running')
    sound.attach(session)
    session.emit('action_result', actionEvent())
    expect(contexts).toHaveLength(0)
    sound.unlock()
    expect(contexts).toHaveLength(1)
    sound.dispose()
  })

  it('stays muted until enabled, even after unlock', () => {
    const sound = new ArenaSound()
    sound.unlock()
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    session.emit('action_result', actionEvent())
    expect(context.oscillators).toHaveLength(0)
    sound.setEnabled(true)
    session.emit('action_result', actionEvent({ tick: 20 }))
    expect(context.oscillators).toHaveLength(1)
    sound.dispose()
  })

  it('mute → suspend → resume stays silent and stops live voices', () => {
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    session.emit('action_result', actionEvent())
    expect(context.oscillators).toHaveLength(1)
    sound.setEnabled(false)
    expect(context.oscillators[0].stop).toHaveBeenCalled()
    expect(context.oscillators[0].disconnect).toHaveBeenCalled()
    sound.suspend()
    sound.resume()
    session.emit('action_result', actionEvent({ tick: 20 }))
    session.emit('tick', tickEvent(25, true))
    expect(context.oscillators).toHaveLength(1)
    sound.dispose()
  })

  it('plays a cue only for accepted collect/bank/drain outcomes', () => {
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    session.emit('action_result', actionEvent())
    session.emit('action_result', actionEvent({ action: { type: 'move', edgeId: 'ab' } }))
    session.emit('action_result', actionEvent({ action: { type: 'wait' }, accepted: false, tick: 15 }))
    session.emit('action_result', actionEvent({ action: { type: 'bank' }, tick: 20 }))
    session.emit('action_result', actionEvent({ action: { type: 'drain' }, tick: 25 }))
    expect(context.oscillators.map(osc => osc.frequency.value)).toEqual([660, 440, 220])
    sound.dispose()
  })

  it('dedupes identical match/tick/action cues', () => {
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    session.emit('action_result', actionEvent())
    session.emit('action_result', actionEvent())
    expect(context.oscillators).toHaveLength(1)
    sound.dispose()
  })

  it('resets dedupe and weather memory when a new match starts', () => {
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    session.emit('tick', tickEvent(5, false))
    session.emit('tick', tickEvent(10, true))
    session.emit('action_result', actionEvent())
    // New match: same tick/flood profile must replay cues, and starting on
    // flooded must NOT emit a flood-off or flood-on (no prior state).
    session.emit('tick', tickEvent(10, true, 'm2'))
    session.emit('action_result', actionEvent({ matchId: 'm2' }))
    expect(context.oscillators.map(osc => osc.frequency.value)).toEqual([180, 660, 660])
    sound.dispose()
  })

  it('stays silent outside live play (review, training, paused)', () => {
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('review')
    sound.attach(session)
    session.emit('action_result', actionEvent())
    session.emit('tick', tickEvent(10, true))
    session.emit('match_end', { matchId: 'm1', outcome: 'finished' })
    expect(context.oscillators).toHaveLength(0)
    sound.dispose()
  })

  it('sounds a flood transition once per flip and a finish cue only on finished outcome', () => {
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    session.emit('tick', tickEvent(5, false))
    session.emit('tick', tickEvent(10, true))
    session.emit('tick', tickEvent(10, true))
    session.emit('tick', tickEvent(15, false))
    session.emit('match_end', { matchId: 'm1', outcome: 'error' })
    session.emit('match_end', { matchId: 'm1', outcome: 'finished' })
    expect(context.oscillators.map(osc => osc.frequency.value)).toEqual([180, 300, 520])
    sound.dispose()
  })

  it('marks sound unavailable when an enabled resume rejects asynchronously', async () => {
    FakeAudioContext.initialState = 'suspended'
    FakeAudioContext.resumeImpl = () => new Promise((_, reject) => setTimeout(() => reject(new Error('denied')), 0))
    const onUnavailable = vi.fn()
    const sound = new ArenaSound(onUnavailable)
    const session = stubSession('running')
    sound.attach(session)
    expect(sound.setEnabled(true)).toBe(true)
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1))
    expect(sound.enabled).toBe(false)
    session.emit('action_result', actionEvent())
    expect(contexts[0].oscillators).toHaveLength(0)
    expect(sound.setEnabled(true)).toBe(false)
    expect(onUnavailable).toHaveBeenCalledTimes(1)
    sound.dispose()
  })

  it('a stale resume rejection after mute does not mark unavailable', async () => {
    FakeAudioContext.initialState = 'suspended'
    let rejectResume!: (error: Error) => void
    FakeAudioContext.resumeImpl = () => new Promise((_, rj) => { rejectResume = rj })
    const onUnavailable = vi.fn()
    const sound = new ArenaSound(onUnavailable)
    expect(sound.setEnabled(true)).toBe(true)
    sound.setEnabled(false)
    rejectResume(new Error('late rejection'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onUnavailable).not.toHaveBeenCalled()
    FakeAudioContext.resumeImpl = null
    expect(sound.setEnabled(true)).toBe(true)
    expect(sound.enabled).toBe(true)
    sound.dispose()
  })

  it('a stale resume rejection after dispose does not mark unavailable', async () => {
    FakeAudioContext.initialState = 'suspended'
    let rejectResume!: (error: Error) => void
    FakeAudioContext.resumeImpl = () => new Promise((_, rj) => { rejectResume = rj })
    const onUnavailable = vi.fn()
    const sound = new ArenaSound(onUnavailable)
    sound.setEnabled(true)
    sound.dispose()
    rejectResume(new Error('late rejection'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onUnavailable).not.toHaveBeenCalled()
  })

  it('reports unavailable once and returns false when construction fails, closing the partial context', () => {
    FakeAudioContext.failCreateGain = true
    const onUnavailable = vi.fn()
    const sound = new ArenaSound(onUnavailable)
    expect(sound.setEnabled(true)).toBe(false)
    expect(onUnavailable).toHaveBeenCalledTimes(1)
    expect(contexts[0].close).toHaveBeenCalled()
    expect(sound.setEnabled(true)).toBe(false)
    expect(onUnavailable).toHaveBeenCalledTimes(1)
    sound.dispose()
  })

  it('returns false and reports unavailable when resume throws synchronously', () => {
    FakeAudioContext.initialState = 'suspended'
    FakeAudioContext.resumeImpl = () => { throw new Error('blocked without gesture') }
    const onUnavailable = vi.fn()
    const sound = new ArenaSound(onUnavailable)
    expect(sound.setEnabled(true)).toBe(false)
    expect(onUnavailable).toHaveBeenCalledTimes(1)
    sound.dispose()
  })

  it('repeated setEnabled(true) shares one attempt: a delayed reject still reports unavailable once', async () => {
    FakeAudioContext.initialState = 'suspended'
    let rejectResume!: (error: Error) => void
    FakeAudioContext.resumeImpl = () => new Promise((_, rj) => { rejectResume = rj })
    const onUnavailable = vi.fn()
    const sound = new ArenaSound(onUnavailable)
    expect(sound.setEnabled(true)).toBe(true)
    expect(sound.setEnabled(true)).toBe(true)
    expect(contexts[0].resume).toHaveBeenCalledTimes(1)
    rejectResume(new Error('denied'))
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1))
    expect(sound.enabled).toBe(false)
    sound.dispose()
  })

  it('a rejection from a superseded enable attempt cannot invalidate the new in-flight resume', async () => {
    FakeAudioContext.initialState = 'suspended'
    const rejecters: ((error: Error) => void)[] = []
    const resolvers: (() => void)[] = []
    FakeAudioContext.resumeImpl = () => new Promise<void>((res, rj) => { resolvers.push(res); rejecters.push(rj) })
    const onUnavailable = vi.fn()
    const sound = new ArenaSound(onUnavailable)
    const session = stubSession('running')
    sound.attach(session)
    expect(sound.setEnabled(true)).toBe(true)
    sound.setEnabled(false)
    expect(sound.setEnabled(true)).toBe(true)
    expect(contexts[0].resume).toHaveBeenCalledTimes(2)
    rejecters[0](new Error('stale first attempt'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onUnavailable).not.toHaveBeenCalled()
    expect(sound.enabled).toBe(true)
    resolvers[1]()
    await new Promise(resolve => setTimeout(resolve, 0))
    contexts[0].state = 'running'
    session.emit('action_result', actionEvent())
    expect(contexts[0].oscillators).toHaveLength(1)
    sound.dispose()
  })

  it('dedupes an in-flight resume instead of issuing a second call', async () => {
    FakeAudioContext.initialState = 'suspended'
    FakeAudioContext.resumeImpl = () => new Promise(resolve => setTimeout(() => resolve(), 0))
    const sound = new ArenaSound()
    expect(sound.setEnabled(true)).toBe(true)
    const context = contexts[0]
    sound.resume()
    sound.resume()
    expect(context.resume).toHaveBeenCalledTimes(1)
    await new Promise(resolve => setTimeout(resolve, 0))
    sound.dispose()
  })

  it('disposes: closes the context, stops voices and drops listeners', () => {
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    session.emit('action_result', actionEvent())
    expect(context.oscillators).toHaveLength(1)
    sound.dispose()
    expect(context.close).toHaveBeenCalled()
    expect(context.oscillators[0].stop).toHaveBeenCalled()
    expect(context.oscillators[0].disconnect).toHaveBeenCalled()
    session.emit('action_result', actionEvent())
    expect(context.oscillators).toHaveLength(1)
    sound.dispose()
  })
})
