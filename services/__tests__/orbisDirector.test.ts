import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BroadcastIntent } from '../arenaBroadcast'
import { OrbisDirector, type OrbisDirectorEvent, type OrbisTransport } from '../orbisDirector'

function makeIntent(kind: string, priority: number, createdAt = 0): BroadcastIntent {
  return {
    reason: `${kind} fact`,
    kind: kind as BroadcastIntent['kind'],
    priority,
    createdAt,
    build: (initial) => ({
      prompt: initial ? `ANCHOR + ${kind}` : `delta ${kind}`,
      audioPrompt: `audio ${kind}`,
    }),
  }
}

function makeTransport() {
  const prompts: string[] = []
  const audioPrompts: string[] = []
  const transport: OrbisTransport = {
    setPrompt: (prompt) => { prompts.push(prompt) },
    setAudioPrompt: (prompt) => { audioPrompts.push(prompt) },
  }
  return { transport, prompts, audioPrompts }
}

describe('OrbisDirector', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('holds prompts until a transport attaches, then dispatches the queued intent', async () => {
    const director = new OrbisDirector({ now: () => 0 })
    const { transport, prompts } = makeTransport()
    director.enqueue(makeIntent('establish', 60))
    await vi.advanceTimersByTimeAsync(0)
    expect(prompts).toEqual([]) // no transport yet — intent stays parked

    director.setTransport(transport)
    await vi.advanceTimersByTimeAsync(0)
    expect(prompts).toEqual(['ANCHOR + establish'])
    director.dispose()
  })

  it('opens with the initial build once, then deltas', async () => {
    const director = new OrbisDirector({ now: () => Date.now(), minDispatchIntervalMs: 1000 })
    const { transport, prompts, audioPrompts } = makeTransport()
    director.setTransport(transport)
    director.enqueue(makeIntent('establish', 60))
    await vi.advanceTimersByTimeAsync(0)
    director.enqueue(makeIntent('collect', 70))
    await vi.advanceTimersByTimeAsync(2000)
    expect(prompts).toEqual(['ANCHOR + establish', 'delta collect'])
    expect(audioPrompts).toEqual(['audio establish', 'audio collect'])
    director.dispose()
  })

  it('coalesces a pending slot to the highest-priority intent', async () => {
    const director = new OrbisDirector({ minDispatchIntervalMs: 60_000 })
    const { transport, prompts } = makeTransport()
    director.setTransport(transport)
    // First dispatch goes out immediately (no rate limit yet).
    director.enqueue(makeIntent('establish', 60))
    await vi.advanceTimersByTimeAsync(0)
    // These both land inside the rate-limit window; only the winner ships.
    director.enqueue(makeIntent('follow', 10))
    director.enqueue(makeIntent('recovery', 100))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(prompts).toEqual(['ANCHOR + establish', 'delta recovery'])
    director.dispose()
  })

  it('emits queued/dispatched/failed lifecycle events', async () => {
    const director = new OrbisDirector()
    const events: OrbisDirectorEvent[] = []
    director.onEvent(event => events.push(event))
    director.setTransport({ setPrompt: () => Promise.reject(new Error('nope')) })
    director.enqueue(makeIntent('flood', 90))
    await vi.advanceTimersByTimeAsync(0)
    expect(events.map(event => event.type)).toEqual(['queued', 'failed'])
    expect(director.hasDispatched()).toBe(false)
    director.dispose()
  })

  it('drops pending prompts when disabled', async () => {
    const director = new OrbisDirector({ minDispatchIntervalMs: 60_000 })
    const { transport, prompts } = makeTransport()
    director.setTransport(transport)
    director.enqueue(makeIntent('establish', 60))
    await vi.advanceTimersByTimeAsync(0)
    director.enqueue(makeIntent('bank', 80))
    director.setEnabled(false)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(prompts).toEqual(['ANCHOR + establish'])
    expect(director.getPendingIntent()).toBeNull()
    director.dispose()
  })
})
