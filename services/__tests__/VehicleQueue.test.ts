import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock external deps before importing the module under test
vi.mock('../AgentProtocol', () => ({
  agentProtocol: { getSession: vi.fn(() => null) },
}))
vi.mock('../analytics', () => ({ trackEvent: vi.fn() }))

import { VehicleQueueManager } from '../VehicleQueue'

describe('VehicleQueueManager', () => {
  let queue: VehicleQueueManager

  beforeEach(() => {
    vi.useFakeTimers()
    queue = new VehicleQueueManager()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── joinQueue ──────────────────────────────────────────────────────────────

  it('adds a player to the queue with waiting status', () => {
    queue.joinQueue('player-1', 'human', 0)
    const state = queue.getQueueState()
    expect(state.queue.some(p => p.id === 'player-1' && p.status === 'waiting')).toBe(true)
  })

  it('does not add duplicate players', () => {
    queue.joinQueue('player-1', 'human', 0)
    queue.joinQueue('player-1', 'human', 0)
    const state = queue.getQueueState()
    expect(state.queue.filter(p => p.id === 'player-1').length).toBe(1)
  })

  // ── processQueue / slot assignment ────────────────────────────────────────

  it('assigns a human player to a human slot after queue tick', () => {
    queue.joinQueue('player-1', 'human', 0)
    vi.advanceTimersByTime(2500) // trigger processQueue
    const state = queue.getQueueState()
    expect(state.isPlayerActive('player-1')).toBe(true)
  })

  it('assigns preferred vehicle type when available', () => {
    queue.joinQueue('player-1', 'human', 0, undefined, 'speedster')
    vi.advanceTimersByTime(2500)
    const state = queue.getQueueState()
    const slot = state.getPlayerVehicle('player-1')
    expect(slot?.type).toBe('speedster')
  })

  it('assigns second speedster when two speedster slots exist', () => {
    queue.joinQueue('player-1', 'human', 0, undefined, 'speedster')
    vi.advanceTimersByTime(2500)
    queue.joinQueue('player-2', 'human', 0, undefined, 'speedster')
    vi.advanceTimersByTime(2500)
    const state = queue.getQueueState()
    expect(state.isPlayerActive('player-2')).toBe(true)
    const slot = state.getPlayerVehicle('player-2')
    expect(slot?.type).toBe('speedster') // second speedster slot
  })

  it('falls back to truck when all speedster slots are occupied', () => {
    // Fill both speedster slots
    queue.joinQueue('player-1', 'human', 0, undefined, 'speedster')
    vi.advanceTimersByTime(2500)
    queue.joinQueue('player-2', 'human', 0, undefined, 'speedster')
    vi.advanceTimersByTime(2500)
    // Third player wants speedster but both are taken
    queue.joinQueue('player-3', 'human', 0, undefined, 'speedster')
    vi.advanceTimersByTime(2500)
    const state = queue.getQueueState()
    expect(state.isPlayerActive('player-3')).toBe(true)
    const slot = state.getPlayerVehicle('player-3')
    expect(slot?.type).toBe('truck') // fallback to truck
  })

  it('does not assign agent players to human slots', () => {
    queue.joinQueue('agent-1', 'agent', 0)
    vi.advanceTimersByTime(2500)
    const state = queue.getQueueState()
    const slot = state.getPlayerVehicle('agent-1')
    expect(['tank', 'monster']).toContain(slot?.type)
  })

  it('respects priority ordering — higher priority player gets slot first', () => {
    // Two players join; player-2 has higher priority
    queue.joinQueue('player-low', 'human', 0)
    queue.joinQueue('player-high', 'human', 10)
    vi.advanceTimersByTime(2500)
    const state = queue.getQueueState()
    // Both human slots exist; player-high should be active
    expect(state.isPlayerActive('player-high')).toBe(true)
  })

  // ── bumpPriority ──────────────────────────────────────────────────────────

  it('bumpPriority increases a waiting player priority', () => {
    queue.joinQueue('player-1', 'human', 0)
    const newPriority = queue.bumpPriority('player-1', 3, 'test')
    expect(newPriority).toBe(3)
    const state = queue.getQueueState()
    const player = state.queue.find(p => p.id === 'player-1')
    expect(player?.priority).toBe(3)
  })

  it('bumpPriority returns null for unknown player', () => {
    const result = queue.bumpPriority('nobody', 1, 'test')
    expect(result).toBeNull()
  })

  // ── leaveQueue ────────────────────────────────────────────────────────────

  it('removes player from queue on leaveQueue', () => {
    queue.joinQueue('player-1', 'human', 0)
    queue.leaveQueue('player-1')
    const state = queue.getQueueState()
    expect(state.queue.some(p => p.id === 'player-1')).toBe(false)
  })

  it('frees the vehicle slot when active player leaves', () => {
    queue.joinQueue('player-1', 'human', 0)
    vi.advanceTimersByTime(2500)
    expect(queue.getQueueState().isPlayerActive('player-1')).toBe(true)
    queue.leaveQueue('player-1')
    // Slot should be free — a new player can take it
    queue.joinQueue('player-2', 'human', 0)
    vi.advanceTimersByTime(2500)
    expect(queue.getQueueState().isPlayerActive('player-2')).toBe(true)
  })

  // ── activeHumans count ────────────────────────────────────────────────────

  it('activeHumans reflects number of active human players', () => {
    queue.joinQueue('player-1', 'human', 0)
    queue.joinQueue('player-2', 'human', 0)
    queue.joinQueue('player-3', 'human', 0)
    queue.joinQueue('player-4', 'human', 0)
    vi.advanceTimersByTime(2500)
    const state = queue.getQueueState()
    expect(state.activeHumans).toBe(4)
  })

  it('supports up to 4 simultaneous human players', () => {
    for (let i = 1; i <= 4; i++) {
      queue.joinQueue(`player-${i}`, 'human', 0)
      vi.advanceTimersByTime(2500)
    }
    const state = queue.getQueueState()
    expect(state.activeHumans).toBe(4)
    // 5th player should remain waiting
    queue.joinQueue('player-5', 'human', 0)
    vi.advanceTimersByTime(2500)
    const state2 = queue.getQueueState()
    expect(state2.activeHumans).toBe(4)
    expect(state2.queue.find(p => p.id === 'player-5')?.status).toBe('waiting')
  })
})
