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
  state: AudioContextState = 'running'
  currentTime = 0
  destination = {}
  oscillators: FakeOscillator[] = []
  createOscillator() { const osc = new FakeOscillator(); this.oscillators.push(osc); return osc }
  createGain() { return new FakeGain() }
  resume = vi.fn(async () => { this.state = 'running' })
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
