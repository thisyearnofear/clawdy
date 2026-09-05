import { describe, expect, it, vi } from 'vitest'
import { ArenaSession } from '../arenaSession'
import type { ArenaCourse } from '../arenaCourse'
import type { ArenaMotion } from '../arenaPhysics'

function setup() {
  const course: ArenaCourse = {
    config: { enabled: true, configured: true, id: 'fixture', name: 'Fixture', splat: null, collider: null, bounds: [5, 5, 5], spawnBounds: [5, 5, 5], spawnHeight: 1 },
    center: [0, 0, 0], floodZones: [],
    scenario: {
      id: 'session-fixture', worldVersion: 'fixture-v1', split: 'practice', seed: 1, durationTicks: 20,
      nodes: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [1, 0, 0] }],
      edges: [{ id: 'road', from: 'a', to: 'b', travelTicks: 5, floodable: false }],
      entrants: [{ id: 'champion', baseNode: 'a', policyVersion: 'test' }, { id: 'rival', baseNode: 'b', policyVersion: 'test' }],
      resources: [{ id: 'core', nodeId: 'b', value: 1 }], floods: [],
    },
  }
  const motion: ArenaMotion = {
    version: 'test-motion-v1', reset: vi.fn(), recover: vi.fn(), dispose: vi.fn(),
    step: targets => targets.map(target => ({ ...target, grounded: true })),
  }
  const session = new ArenaSession(course, motion)
  return { session, motion }
}

describe('application episode session', () => {
  it('waits for start, freezes policy selection while active, and pauses without consuming time', () => {
    const { session } = setup()
    session.advanceMicroseconds(500000)
    expect(session.getSnapshot().episode.tick).toBe(0)
    session.selectPolicy('champion', 'weather')
    session.start()
    expect(() => session.selectPolicy('champion', 'greedy')).toThrow('locked')
    session.advanceMicroseconds(250000)
    expect(session.getSnapshot().episode.tick).toBe(5)
    session.pause()
    session.advanceMicroseconds(500000)
    expect(session.getSnapshot().episode.tick).toBe(5)
    session.start()
    session.advanceMicroseconds(250000)
    expect(session.getSnapshot().episode.tick).toBe(10)
    session.dispose()
  })

  it('bounds per-frame work without discarding accumulated time', () => {
    const { session } = setup()
    session.start()
    session.advanceMicroseconds(1000000)
    expect(session.getSnapshot().episode.tick).toBe(8)
    session.advanceMicroseconds(0)
    expect(session.getSnapshot().episode.tick).toBe(16)
    session.advanceMicroseconds(0)
    expect(session.getSnapshot().phase).toBe('finished')
    expect(session.getSnapshot().episode.tick).toBe(20)
    session.dispose()
  })

  it('reviews recorded frames without advancing the live authority and resets cleanly', () => {
    const { session } = setup()
    session.start()
    session.advanceMicroseconds(250000)
    expect(() => session.review()).toThrow('Pause')
    session.pause()
    const paused = session.getSnapshot().episode
    session.review()
    expect(session.getSnapshot().phase).toBe('review')
    expect(session.getSnapshot().episode.tick).toBe(0)
    session.seek(1)
    expect(session.getSnapshot().episode).toEqual(paused)
    session.advanceMicroseconds(500000)
    expect(session.getSnapshot().episode).toEqual(paused)
    expect(() => session.seek(999)).toThrow()
    session.returnToRun()
    expect(session.getSnapshot().phase).toBe('paused')
    expect(session.getSnapshot().episode).toEqual(paused)
    session.reset()
    expect(session.getSnapshot()).toMatchObject({ phase: 'ready', replayLength: 0, replayIndex: 0, error: null })
    expect(session.getSnapshot().episode.tick).toBe(0)
    session.dispose()
  })

  it('reports a simulation failure and releases owned physics once', () => {
    const { session, motion } = setup()
    motion.step = () => { throw new Error('physics failed') }
    session.start()
    session.advanceMicroseconds(50000)
    expect(session.getSnapshot()).toMatchObject({ phase: 'error', error: 'physics failed' })
    session.dispose()
    session.dispose()
    expect(motion.dispose).toHaveBeenCalledTimes(1)
    expect(() => session.start()).toThrow('disposed')
  })

  it('notifies subscribers only on changes and permits unsubscribing', () => {
    const { session } = setup()
    const notify = vi.fn()
    const initial = session.getSnapshot()
    const unsubscribe = session.subscribe(notify)
    session.advanceMicroseconds(100)
    expect(session.getSnapshot()).toBe(initial)
    expect(notify).not.toHaveBeenCalled()
    session.start()
    expect(notify).toHaveBeenCalledTimes(1)
    unsubscribe()
    session.pause()
    expect(notify).toHaveBeenCalledTimes(1)
    session.dispose()
  })

  it('provides frame-level observations during replay review mode', () => {
    const { session } = setup()
    session.start()
    session.advanceMicroseconds(250000)
    session.pause()
    session.review()

    const reviewObs = session.reviewObservation('champion')
    expect(reviewObs).not.toBeNull()
    expect(reviewObs?.schemaVersion).toBe('arena-observation-v1')
    expect(reviewObs?.self.id).toBe('champion')
    expect(reviewObs?.availableActions.length).toBeGreaterThan(0)

    // session.observe also routes to the reviewed frame snapshot
    const currentObs = session.observe('champion')
    expect(currentObs.tick).toBe(session.getSnapshot().episode.tick)

    session.returnToRun()
    expect(session.reviewObservation('champion')).toBeNull()
    session.dispose()
  })
})
