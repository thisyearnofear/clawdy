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

class FakeBufferSource {
  buffer: unknown = null
  loop = false
  connect = vi.fn().mockReturnThis()
  disconnect = vi.fn()
  onended: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
}

class FakeAudioContext {
  static initialState: AudioContextState = 'running'
  static resumeImpl: ((ctx: FakeAudioContext) => Promise<void>) | null = null
  static failCreateGain = false
  static failDecode: string[] = []
  static decodeImpl: ((data: ArrayBuffer) => Promise<unknown>) | null = null
  state: AudioContextState = FakeAudioContext.initialState
  currentTime = 0
  destination = {}
  oscillators: FakeOscillator[] = []
  bufferSources: FakeBufferSource[] = []
  createOscillator() { const osc = new FakeOscillator(); this.oscillators.push(osc); return osc }
  createBufferSource() { const source = new FakeBufferSource(); this.bufferSources.push(source); return source }
  decodeAudioData(data: ArrayBuffer) {
    if (FakeAudioContext.decodeImpl) return FakeAudioContext.decodeImpl(data)
    const label = new TextDecoder().decode(data)
    if (FakeAudioContext.failDecode.includes(label)) return Promise.reject(new Error('decode failed'))
    return Promise.resolve({ label })
  }
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

function stubFetch(handlers: Record<string, 'ok' | 'fail' | 'never'> = {}) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const mode = handlers[url] ?? 'ok'
    if (mode === 'never') return new Promise<Response>(() => { })
    if (mode === 'fail') return Promise.resolve({ ok: false, status: 404 } as Response)
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url).buffer as ArrayBuffer),
    } as Response)
  }))
  return calls
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

type Listener = (event: never) => void

function stubSession(phase: string, episodeTick = 0, matchId = 'm1') {
  const listeners = new Map<string, Set<Listener>>()
  const view: { phase: string; episode: { tick: number } } = { phase, episode: { tick: episodeTick } }
  const session = {
    matchId,
    view,
    getSnapshot: () => view,
    on: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
      return () => listeners.get(type)?.delete(listener)
    },
    off: (type: string, listener: Listener) => { listeners.get(type)?.delete(listener) },
    emit: (type: string, event: unknown) => {
      if (type === 'phase') view.phase = (event as { current: string }).current
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
    FakeAudioContext.failDecode = []
    FakeAudioContext.decodeImpl = null
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('unexpected fetch'))))
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

  it('fetches no samples before an explicit gesture, then loads them after unlock', async () => {
    const calls = stubFetch()
    const sound = new ArenaSound()
    const session = stubSession('running')
    sound.attach(session)
    session.emit('action_result', actionEvent())
    expect(calls).toHaveLength(0)
    expect(contexts).toHaveLength(0)
    sound.unlock()
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(url => url.startsWith('/assets/kenney/sci-fi-sounds/'))).toBe(true)
    await flush()
    sound.dispose()
  })

  it('uses decoded sample sources for mapped cues once loaded', async () => {
    stubFetch()
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    await flush()
    session.emit('action_result', actionEvent())
    expect(context.bufferSources).toHaveLength(1)
    expect(context.bufferSources[0].loop).toBe(false)
    expect(context.oscillators).toHaveLength(0)
    sound.dispose()
    expect(context.bufferSources[0].stop).toHaveBeenCalled()
  })

  it('falls back to synth tones on fetch failure without marking unavailable', async () => {
    const onUnavailable = vi.fn()
    const calls = stubFetch({ '/assets/kenney/sci-fi-sounds/collect.wav': 'fail' })
    const sound = new ArenaSound(onUnavailable)
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    await flush()
    session.emit('action_result', actionEvent())
    expect(context.bufferSources).toHaveLength(0)
    expect(context.oscillators).toHaveLength(1)
    expect(context.oscillators[0].frequency.value).toBe(660)
    expect(calls).toContain('/assets/kenney/sci-fi-sounds/collect.wav')
    expect(onUnavailable).not.toHaveBeenCalled()
    sound.dispose()
  })

  it('falls back to synth tones on decode rejection without marking unavailable', async () => {
    const onUnavailable = vi.fn()
    stubFetch()
    FakeAudioContext.failDecode = ['/assets/kenney/sci-fi-sounds/collect.wav']
    const sound = new ArenaSound(onUnavailable)
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    await flush()
    session.emit('action_result', actionEvent())
    expect(context.bufferSources).toHaveLength(0)
    expect(context.oscillators).toHaveLength(1)
    expect(onUnavailable).not.toHaveBeenCalled()
    sound.dispose()
  })

  it('a sample decode resolving after mute starts no source', async () => {
    stubFetch()
    const resolvers: ((buffer: unknown) => void)[] = []
    FakeAudioContext.decodeImpl = () => new Promise(resolve => { resolvers.push(resolve) })
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    await flush()
    expect(resolvers.length).toBeGreaterThan(0)
    sound.setEnabled(false)
    for (const resolveDecode of resolvers) resolveDecode({ label: 'late' })
    await flush()
    session.emit('action_result', actionEvent())
    expect(context.bufferSources).toHaveLength(0)
    expect(context.oscillators).toHaveLength(0)
    sound.dispose()
  })

  it('a sample decode resolving after dispose starts no source', async () => {
    stubFetch()
    const resolvers: ((buffer: unknown) => void)[] = []
    FakeAudioContext.decodeImpl = () => new Promise(resolve => { resolvers.push(resolve) })
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    await flush()
    expect(resolvers.length).toBeGreaterThan(0)
    sound.dispose()
    for (const resolveDecode of resolvers) resolveDecode({ label: 'late' })
    await flush()
    session.emit('action_result', actionEvent())
    expect(context.bufferSources).toHaveLength(0)
    expect(context.oscillators).toHaveLength(0)
  })

  it('starts the motor only while the champion moves, and stops it on stationary, stagger, phase and dispose', async () => {
    stubFetch()
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    await flush()
    const tickWith = (tick: number, transit: unknown, staggeredUntilTick = 0, matchId = 'm1') => ({
      matchId,
      tick,
      episode: {
        weather: { flooded: false },
        agents: [{ id: 'champion', recoveries: 0, transit, staggeredUntilTick }],
      },
    })
    session.emit('tick', tickWith(10, null))
    expect(context.bufferSources).toHaveLength(0)
    session.emit('tick', tickWith(11, { edgeId: 'e1', to: 'n2' }))
    expect(context.bufferSources).toHaveLength(1)
    expect(context.bufferSources[0].loop).toBe(true)
    session.emit('tick', tickWith(12, { edgeId: 'e1', to: 'n2' }))
    expect(context.bufferSources).toHaveLength(1)
    session.emit('tick', tickWith(13, { edgeId: 'e1', to: 'n2' }, 20))
    expect(context.bufferSources[0].stop).toHaveBeenCalled()
    session.emit('tick', tickWith(14, { edgeId: 'e1', to: 'n2' }))
    expect(context.bufferSources).toHaveLength(2)
    session.emit('tick', tickWith(15, null))
    expect(context.bufferSources[1].stop).toHaveBeenCalled()
    session.emit('tick', tickWith(16, { edgeId: 'e1', to: 'n2' }))
    expect(context.bufferSources).toHaveLength(3)
    session.emit('phase', { matchId: 'm1', previous: 'running', current: 'paused' })
    expect(context.bufferSources[2].stop).toHaveBeenCalled()
    session.emit('phase', { matchId: 'm1', previous: 'paused', current: 'running' })
    session.emit('tick', tickWith(17, { edgeId: 'e1', to: 'n2' }))
    expect(context.bufferSources).toHaveLength(4)
    session.emit('tick', tickWith(0, null, 0, 'm2'))
    expect(context.bufferSources[3].stop).toHaveBeenCalled()
    session.emit('tick', tickWith(1, { edgeId: 'e1', to: 'n2' }, 0, 'm2'))
    expect(context.bufferSources).toHaveLength(5)
    sound.dispose()
    expect(context.bufferSources[4].stop).toHaveBeenCalled()
  })

  it('stops sampled one-shot tails on phase change and on suspend, not only on mute', async () => {
    stubFetch()
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    await flush()
    session.emit('action_result', actionEvent())
    expect(context.bufferSources).toHaveLength(1)
    session.emit('phase', { matchId: 'm1', previous: 'running', current: 'paused' })
    expect(context.bufferSources[0].stop).toHaveBeenCalled()
    session.emit('phase', { matchId: 'm1', previous: 'paused', current: 'running' })
    session.emit('action_result', actionEvent({ tick: 20 }))
    expect(context.bufferSources).toHaveLength(2)
    sound.suspend()
    expect(context.bufferSources[1].stop).toHaveBeenCalled()
    sound.dispose()
  })

  it('plays bumps only inside the processed tick window, batched and deduped per match', async () => {
    stubFetch()
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    await flush()
    const bump = (tick: number) => ({ type: 'bump', tick, winnerId: 'champion', loserId: 'rival' })
    const tickWith = (tick: number, events: unknown[] | undefined, matchId = 'm1') => ({
      matchId,
      tick,
      episode: {
        weather: { flooded: false },
        agents: [{ id: 'champion', recoveries: 0 }],
        ...(events === undefined ? {} : { events }),
      },
    })
    session.emit('tick', tickWith(50, [bump(40), bump(45), bump(51)]))
    expect(context.bufferSources).toHaveLength(2)
    session.emit('tick', tickWith(52, [bump(40), bump(51)]))
    expect(context.bufferSources).toHaveLength(3)
    session.emit('tick', tickWith(0, [bump(0)], 'm2'))
    session.emit('tick', tickWith(10, [bump(10)], 'm2'))
    expect(context.bufferSources).toHaveLength(4)
    expect(() => session.emit('tick', tickWith(60, undefined))).not.toThrow()
    expect(() => session.emit('tick', { matchId: 'm2', tick: 61, episode: { weather: { flooded: false }, agents: [] } })).not.toThrow()
    sound.dispose()
  })

  it('attaching mid-run ignores historical bumps instead of replaying them', async () => {
    stubFetch()
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running', 100, 'm1')
    sound.attach(session)
    await flush()
    const bump = { type: 'bump', tick: 20, winnerId: 'champion', loserId: 'rival' }
    session.emit('tick', {
      matchId: 'm1',
      tick: 100,
      episode: { weather: { flooded: false }, agents: [{ id: 'champion', recoveries: 0 }], events: [bump] },
    })
    expect(context.bufferSources).toHaveLength(0)
    session.emit('tick', {
      matchId: 'm1',
      tick: 101,
      episode: { weather: { flooded: false }, agents: [{ id: 'champion', recoveries: 0 }], events: [bump, { type: 'bump', tick: 101, winnerId: 'champion', loserId: 'rival' }] },
    })
    expect(context.bufferSources).toHaveLength(1)
    sound.dispose()
  })

  it('does not replay processed bumps when sound is re-enabled after a muted stretch', async () => {
    stubFetch()
    const sound = new ArenaSound()
    const session = stubSession('running')
    sound.attach(session)
    const bump = { type: 'bump', tick: 5, winnerId: 'champion', loserId: 'rival' }
    session.emit('tick', {
      matchId: 'm1',
      tick: 10,
      episode: { weather: { flooded: false }, agents: [{ id: 'champion', recoveries: 0 }], events: [bump] },
    })
    sound.setEnabled(true)
    const context = contexts[0]
    await flush()
    session.emit('tick', {
      matchId: 'm1',
      tick: 11,
      episode: { weather: { flooded: false }, agents: [{ id: 'champion', recoveries: 0 }], events: [bump] },
    })
    session.emit('tick', {
      matchId: 'm1',
      tick: 12,
      episode: { weather: { flooded: false }, agents: [{ id: 'champion', recoveries: 0 }], events: [bump, { type: 'bump', tick: 12, winnerId: 'champion', loserId: 'rival' }] },
    })
    expect(context.bufferSources).toHaveLength(1)
    sound.dispose()
  })

  it('caps concurrent one-shots for both samples and synth fallbacks, motor excluded', async () => {
    stubFetch()
    const sound = new ArenaSound()
    sound.setEnabled(true)
    const context = contexts[0]
    const session = stubSession('running')
    sound.attach(session)
    await flush()
    for (let tick = 0; tick < 13; tick++) {
      session.emit('action_result', actionEvent({ tick }))
    }
    expect(context.bufferSources).toHaveLength(13)
    expect(context.bufferSources[0].stop).toHaveBeenCalled()
    const bumpTick = { type: 'bump', tick: 30, winnerId: 'champion', loserId: 'rival' }
    session.emit('tick', {
      matchId: 'm1',
      tick: 31,
      episode: {
        weather: { flooded: false },
        agents: [{ id: 'champion', recoveries: 0, transit: { edgeId: 'e1' } }],
        events: [bumpTick],
      },
    })
    expect(context.bufferSources).toHaveLength(15)
    expect(context.bufferSources[1].stop).toHaveBeenCalled()
    context.bufferSources[2].onended?.()
    session.emit('action_result', actionEvent({ tick: 40 }))
    expect(context.bufferSources).toHaveLength(16)
    expect(context.bufferSources[3].stop).not.toHaveBeenCalled()
    FakeAudioContext.failDecode = Object.values<string>({
      a: '/assets/kenney/sci-fi-sounds/engine.wav',
      b: '/assets/kenney/sci-fi-sounds/collect.wav',
      c: '/assets/kenney/sci-fi-sounds/bank.wav',
      d: '/assets/kenney/sci-fi-sounds/drain.wav',
      e: '/assets/kenney/sci-fi-sounds/impact.wav',
    })
    const fallback = new ArenaSound()
    fallback.setEnabled(true)
    const fallbackContext = contexts[1]
    const fallbackSession = stubSession('running')
    fallback.attach(fallbackSession)
    await flush()
    for (let tick = 0; tick < 13; tick++) {
      fallbackSession.emit('action_result', actionEvent({ tick }))
    }
    expect(fallbackContext.oscillators).toHaveLength(13)
    expect(fallbackContext.oscillators[0].stop).toHaveBeenCalledTimes(2)
    expect(fallbackContext.oscillators[1].stop).toHaveBeenCalledTimes(1)
    sound.dispose()
    fallback.dispose()
  })
})
