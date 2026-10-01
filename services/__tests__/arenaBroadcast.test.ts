import { describe, expect, it } from 'vitest'
import type { ArenaAgentState, ArenaSnapshot } from '../arenaEpisode'
import type { CinematicShot } from '../arenaCinematic'
import {
  BROADCAST_TRIGGER_PRIORITIES,
  buildBroadcastIntent,
  broadcastTriggersBetween,
  triggerFromShot,
} from '../arenaBroadcast'

function makeAgent(id: string, over: Partial<ArenaAgentState> = {}): ArenaAgentState {
  return {
    id,
    baseNode: 'base',
    policyVersion: 'test-v1',
    nodeId: 'base',
    position: [0, 0, 0],
    transit: null,
    energy: 100,
    cargo: 0,
    banked: 0,
    cooldownUntilTick: 0,
    staggeredUntilTick: 0,
    lastOutcome: null,
    visitedNodes: [],
    knownResources: [],
    grounded: true,
    rotation: [0, 0, 0, 1],
    blockedTicks: 0,
    blockedEdges: [],
    recoveries: 0,
    ...over,
  }
}

function makeSnapshot(over: Partial<ArenaSnapshot> = {}): ArenaSnapshot {
  return {
    rulesVersion: 'test-rules',
    controllerVersion: 'test-controller',
    tick: 10,
    status: 'running',
    winner: null,
    agents: [makeAgent('champion'), makeAgent('rival')],
    resources: [{ id: 'core-0', nodeId: 'field', value: 1, collectedBy: null }],
    weather: { flooded: false, drainedUntilTick: 0 },
    ...over,
  }
}

describe('buildBroadcastIntent', () => {
  it('opens with the full style anchor on the initial build', () => {
    const intent = buildBroadcastIntent(
      { kind: 'establish', agentId: null, reason: 'match opens', priority: BROADCAST_TRIGGER_PRIORITIES.establish },
      makeSnapshot(),
      1000,
    )
    const { prompt, audioPrompt } = intent.build(true)
    expect(prompt).toContain('sandstone basin')
    expect(prompt).toContain('one continuous take')
    expect(prompt).not.toContain('The same unbroken scene continues')
    expect(audioPrompt).toContain('no spoken instructions')
  })

  it('emits a scene-preserving delta on non-initial builds', () => {
    const intent = buildBroadcastIntent(
      { kind: 'flood', agentId: null, reason: 'flood begins at tick 40', priority: BROADCAST_TRIGGER_PRIORITIES.flood },
      makeSnapshot({ weather: { flooded: true, drainedUntilTick: 0 } }),
      1000,
    )
    const { prompt } = intent.build(false)
    expect(prompt.startsWith('The same unbroken scene continues.')).toBe(true)
    expect(prompt).not.toContain('sandstone basin arena,')
  })

  it('names the finish winner only from the recorded winner field', () => {
    const winner = buildBroadcastIntent(
      { kind: 'finish', agentId: 'champion', reason: 'match ends, winner: champion', priority: 95 },
      makeSnapshot({ status: 'finished', winner: 'champion' }),
      0,
    ).build(true)
    expect(winner.prompt).toContain('champion rover')
    const draw = buildBroadcastIntent(
      { kind: 'finish', agentId: null, reason: 'match ends, winner: draw', priority: 95 },
      makeSnapshot({ status: 'finished', winner: null }),
      0,
    ).build(true)
    expect(draw.prompt).toContain('dead heat')
    expect(draw.prompt).not.toContain('winning tally')
  })

  it('states the banked tally that the snapshot records', () => {
    const intent = buildBroadcastIntent(
      { kind: 'bank', agentId: 'rival', reason: 'rival banked 2 at tick 90', priority: 80 },
      makeSnapshot({ agents: [makeAgent('champion'), makeAgent('rival', { banked: 2 })] }),
      0,
    )
    const { prompt } = intent.build(false)
    expect(prompt).toContain('rival hauler')
    expect(prompt).toContain('tally now reads 2')
  })
})

describe('broadcastTriggersBetween', () => {
  it('produces nothing when nothing changed', () => {
    const prev = makeSnapshot()
    const curr = makeSnapshot({ tick: 11 })
    expect(broadcastTriggersBetween(prev, curr)).toEqual([])
  })

  it('detects flood onset, collects, banks, recoveries, and finish', () => {
    const prev = makeSnapshot()
    const curr = makeSnapshot({
      tick: 50,
      status: 'finished',
      winner: 'rival',
      weather: { flooded: true, drainedUntilTick: 0 },
      agents: [
        makeAgent('champion', { recoveries: 1 }),
        makeAgent('rival', { banked: 3 }),
      ],
      resources: [{ id: 'core-0', nodeId: 'field', value: 1, collectedBy: 'rival' }],
    })
    const kinds = broadcastTriggersBetween(prev, curr).map(trigger => trigger.kind).sort()
    expect(kinds).toEqual(['bank', 'collect', 'finish', 'flood', 'recovery'])
  })

  it('ignores already-collected resources and unchanged tallies', () => {
    const prev = makeSnapshot({
      weather: { flooded: true, drainedUntilTick: 0 },
      resources: [{ id: 'core-0', nodeId: 'field', value: 1, collectedBy: 'champion' }],
    })
    const curr = makeSnapshot({
      tick: 11,
      weather: { flooded: true, drainedUntilTick: 0 },
      resources: [{ id: 'core-0', nodeId: 'field', value: 1, collectedBy: 'champion' }],
    })
    expect(broadcastTriggersBetween(prev, curr)).toEqual([])
  })
})

describe('triggerFromShot', () => {
  it('carries the shot kind, focus, and recorded reason', () => {
    const shot: CinematicShot = { kind: 'recovery', fromIndex: 4, toIndex: 18, agentId: 'champion', reason: 'champion recovered at tick 12' }
    const trigger = triggerFromShot(shot)
    expect(trigger).toMatchObject({
      kind: 'recovery',
      agentId: 'champion',
      reason: 'champion recovered at tick 12',
      priority: BROADCAST_TRIGGER_PRIORITIES.recovery,
    })
  })
})

describe('live trigger detection', () => {
  const base = {
    tick: 10, status: 'running', winner: null,
    weather: { flooded: false },
    agents: [{ id: 'champion', banked: 0, recoveries: 0 }],
    resources: [{ id: 'core-1', collectedBy: null }],
  }
  it('emits one trigger per transitioned fact and none when nothing changed', async () => {
    const { broadcastTriggersBetween } = await import('../arenaBroadcast')
    const prev = base as unknown as ArenaSnapshot
    expect(broadcastTriggersBetween(prev, prev)).toEqual([])
    const next = {
      ...base, tick: 11, status: 'finished', winner: 'champion',
      weather: { flooded: true },
      agents: [{ id: 'champion', banked: 2, recoveries: 0 }],
      resources: [{ id: 'core-1', collectedBy: 'champion' }],
    } as unknown as ArenaSnapshot
    const kinds = broadcastTriggersBetween(prev, next).map(t => t.kind).sort()
    expect(kinds).toEqual(['bank', 'collect', 'finish', 'flood'])
  })
})
