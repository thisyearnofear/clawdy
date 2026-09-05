import { describe, expect, it, vi } from 'vitest'
import { ArenaEpisode, ARENA_RULES, type ArenaScenario, type ArenaRequest } from '../arenaEpisode'
import { ArenaRunner, collectorPolicy, runArenaEpisode } from '../arenaPolicy'
import { replayArenaEpisode } from '../arenaReplay'

function scenario(): ArenaScenario {
  return {
    id: 'test-course',
    worldVersion: 'fixture-v1',
    split: 'practice',
    seed: 12,
    durationTicks: 200,
    nodes: [
      { id: 'west', position: [-4, 0, 0] },
      { id: 'east', position: [4, 0, 0] },
      { id: 'ridge', position: [0, 3, 4] },
      { id: 'field', position: [0, 0, 0] },
    ],
    edges: [
      { id: 'west-low', from: 'west', to: 'field', travelTicks: 5, floodable: true },
      { id: 'east-low', from: 'east', to: 'field', travelTicks: 5, floodable: true },
      { id: 'west-high', from: 'west', to: 'ridge', travelTicks: 7, floodable: false },
      { id: 'east-high', from: 'east', to: 'ridge', travelTicks: 7, floodable: false },
      { id: 'ridge-field', from: 'ridge', to: 'field', travelTicks: 7, floodable: false },
    ],
    entrants: [
      { id: 'champion', baseNode: 'west', policyVersion: 'safe-v1' },
      { id: 'rival', baseNode: 'east', policyVersion: 'greedy-v1' },
    ],
    resources: Array.from({ length: 6 }, (_, index) => ({ id: `core-${index}`, nodeId: 'field', value: 1 })),
    floods: [{ startTick: 0, endTick: 100 }],
  }
}

function command(episode: ArenaEpisode, action: unknown, agentId = 'champion'): ArenaRequest {
  return { agentId, tick: episode.snapshot().tick, action }
}

function advanceTo(episode: ArenaEpisode, tick: number) {
  while (episode.snapshot().tick < tick) episode.step()
}

describe('Season 0 episode authority', () => {
  it('starts with detached, equal-budget entrants and no automatic timers', () => {
    const episode = new ArenaEpisode(scenario())
    const snapshot = episode.snapshot()
    expect(snapshot.tick).toBe(0)
    expect(snapshot.status).toBe('running')
    expect(snapshot.agents.map(agent => agent.energy)).toEqual([ARENA_RULES.initialEnergy, ARENA_RULES.initialEnergy])
    snapshot.agents[0].energy = 999
    expect(episode.snapshot().agents[0].energy).toBe(ARENA_RULES.initialEnergy)
  })

  it('does not expose future weather, the seed, other policy versions, or mutable state to a policy', () => {
    const episode = new ArenaEpisode(scenario())
    const observation = episode.observe('champion')
    expect(observation).not.toHaveProperty('seed')
    expect(observation).not.toHaveProperty('floods')
    expect(observation.rivals[0]).not.toHaveProperty('policyVersion')
    observation.self.energy = 999
    observation.nodes[0].position[0] = 999
    expect(episode.observe('champion').self.energy).toBe(ARENA_RULES.initialEnergy)
    expect(episode.observe('champion').nodes[0].position[0]).toBe(-4)
    expect(() => episode.observe('intruder')).toThrow('Unknown entrant')
  })

  it('copies the scenario so outside mutation cannot alter a running match', () => {
    const input = scenario()
    const episode = new ArenaEpisode(input)
    input.floods.length = 0
    input.resources[0].value = 1000
    expect(episode.observe('champion').weather.flooded).toBe(true)
    expect(episode.observe('champion').resources[0].value).toBe(1)
  })

  it('advances only through explicit fixed ticks and terminates at the deadline', () => {
    const episode = new ArenaEpisode(scenario())
    advanceTo(episode, 200)
    expect(episode.snapshot()).toMatchObject({ tick: 200, status: 'finished', winner: null })
    expect(episode.observe('champion').remainingTicks).toBe(0)
    const end = episode.snapshot()
    expect(() => episode.step([command(episode, { type: 'drain' })])).toThrow('finished')
    expect(episode.snapshot()).toEqual(end)
  })

  it('rejects stale commands, unknown actors, duplicates, and off-cadence commands without spending', () => {
    const episode = new ArenaEpisode(scenario())
    const result = episode.step([
      { agentId: 'champion', tick: -1, action: { type: 'drain' } },
      command(episode, { type: 'drain' }, 'intruder'),
    ])
    expect(result.map(item => item.reason)).toEqual(['stale-tick', 'unknown-entrant'])
    expect(episode.step([command(episode, { type: 'drain' })])[0].reason).toBe('not-decision-tick')
    advanceTo(episode, ARENA_RULES.decisionEveryTicks)
    const duplicate = command(episode, { type: 'drain' })
    expect(episode.step([duplicate, duplicate]).map(item => item.reason)).toEqual(['duplicate-request', 'duplicate-request'])
    expect(episode.observe('champion').self.energy).toBe(ARENA_RULES.initialEnergy)
  })

  it.each([null, {}, { type: 'teleport' }, { type: 'move', edgeId: 42 }, { type: 'drain', agentId: 'rival' }])(
    'rejects malformed or extra-field actions: %j', action => {
      const episode = new ArenaEpisode(scenario())
      expect(episode.step([command(episode, action)])[0].reason).toBe('invalid-action')
    },
  )

  it('rejects movement along an edge not connected to the entrant', () => {
    const episode = new ArenaEpisode(scenario())
    expect(episode.step([command(episode, { type: 'move', edgeId: 'east-low' })])[0].reason).toBe('unreachable-edge')
    expect(episode.observe('champion').self.nodeId).toBe('west')
  })

  it('cannot collect a remote resource or bank empty cargo', () => {
    const episode = new ArenaEpisode(scenario())
    expect(episode.step([command(episode, { type: 'collect', resourceId: 'core-0' })])[0].reason).toBe('unreachable-resource')
    advanceTo(episode, ARENA_RULES.decisionEveryTicks)
    expect(episode.step([command(episode, { type: 'bank' })])[0].reason).toBe('nothing-to-bank')
  })

  it('makes flooded routes slower and the high route physically distinct in the reference controller', () => {
    const wet = new ArenaEpisode(scenario())
    wet.step([command(wet, { type: 'move', edgeId: 'west-low' })])
    advanceTo(wet, 5)
    expect(wet.observe('champion').self.transit).not.toBeNull()
    advanceTo(wet, 20)
    expect(wet.observe('champion').self.nodeId).toBe('field')
    expect(wet.observe('champion').self.transit).toBeNull()

    const high = new ArenaEpisode(scenario())
    high.step([command(high, { type: 'move', edgeId: 'west-high' })])
    advanceTo(high, 7)
    expect(high.observe('champion').self.position).toEqual([0, 3, 4])
  })

  it('charges a drain once, affects both competitors, and expires on simulation time', () => {
    const episode = new ArenaEpisode(scenario())
    expect(episode.step([command(episode, { type: 'drain' })])[0].accepted).toBe(true)
    expect(episode.observe('champion').self.energy).toBe(ARENA_RULES.initialEnergy - ARENA_RULES.drainCost)
    expect(episode.observe('rival').weather.flooded).toBe(false)
    advanceTo(episode, ARENA_RULES.decisionEveryTicks)
    expect(episode.step([command(episode, { type: 'drain' })])[0].accepted).toBe(false)
    advanceTo(episode, ARENA_RULES.drainTicks)
    expect(episode.observe('rival').weather.flooded).toBe(true)
    advanceTo(episode, 100)
    expect(episode.observe('rival').weather.flooded).toBe(false)
  })

  it('collects once, banks only at home, and scores banked value rather than cargo', () => {
    const input = scenario()
    input.floods = []
    const episode = new ArenaEpisode(input)
    episode.step([command(episode, { type: 'move', edgeId: 'west-low' })])
    advanceTo(episode, 5)
    expect(episode.step([command(episode, { type: 'collect', resourceId: 'core-0' })])[0].accepted).toBe(true)
    expect(episode.observe('champion').self).toMatchObject({ cargo: 1, banked: 0 })
    advanceTo(episode, 10)
    expect(episode.step([command(episode, { type: 'bank' })])[0].reason).toBe('not-at-base')
    advanceTo(episode, 15)
    expect(episode.step([command(episode, { type: 'collect', resourceId: 'core-0' })])[0].reason).toBe('resource-unavailable')
    advanceTo(episode, 20)
    episode.step([command(episode, { type: 'move', edgeId: 'west-low' })])
    advanceTo(episode, 25)
    episode.step([command(episode, { type: 'bank' })])
    expect(episode.observe('champion').self).toMatchObject({ cargo: 0, banked: 1 })
    advanceTo(episode, 200)
    expect(episode.snapshot().winner).toBe('champion')
  })

  it('resolves a contested pickup independently of request array ordering', () => {
    const input = scenario()
    input.floods = []
    const first = new ArenaEpisode(input)
    const second = new ArenaEpisode(input)
    for (const episode of [first, second]) {
      episode.step([
        command(episode, { type: 'move', edgeId: 'west-low' }),
        command(episode, { type: 'move', edgeId: 'east-low' }, 'rival'),
      ])
      advanceTo(episode, 5)
    }
    const requests = [
      command(first, { type: 'collect', resourceId: 'core-0' }),
      command(first, { type: 'collect', resourceId: 'core-0' }, 'rival'),
    ]
    first.step(requests)
    second.step([...requests].reverse())
    expect(first.snapshot()).toEqual(second.snapshot())
    expect(first.snapshot().agents.reduce((sum, agent) => sum + agent.cargo, 0)).toBe(1)
  })

  it('resets all timers, resources, cargo, command feedback, and replay history', () => {
    const episode = new ArenaEpisode(scenario())
    const initial = episode.snapshot()
    episode.step([command(episode, { type: 'drain' })])
    advanceTo(episode, 80)
    episode.reset()
    expect(episode.snapshot()).toEqual(initial)
    expect(episode.recording().batches).toEqual([])
    expect(episode.recording().checkpoints).toHaveLength(1)
  })

  it.each([
    (input: ArenaScenario) => { input.nodes[0].position[0] = NaN },
    (input: ArenaScenario) => { input.edges[0].travelTicks = 0 },
    (input: ArenaScenario) => { input.edges[0].to = 'missing' },
    (input: ArenaScenario) => { input.edges.push({ ...input.edges[0] }) },
    (input: ArenaScenario) => { input.entrants[1].id = input.entrants[0].id },
    (input: ArenaScenario) => { input.resources[0].value = -1 },
    (input: ArenaScenario) => { input.floods[0].endTick = 0 },
    (input: ArenaScenario) => { input.durationTicks = Infinity },
    (input: ArenaScenario) => { input.edges = [] },
  ])('rejects invalid scenarios before starting', mutate => {
    const input = scenario()
    mutate(input)
    expect(() => new ArenaEpisode(input)).toThrow()
  })
})

describe('baseline execution and replay', () => {
  it('produces identical outcomes and recordings across different frame groupings', () => {
    const smooth = new ArenaRunner(scenario(), { champion: 'safe', rival: 'greedy' })
    const uneven = new ArenaRunner(scenario(), { champion: 'safe', rival: 'greedy' })
    for (let index = 0; index < 1000; index++) smooth.advanceMicroseconds(10000)
    for (const elapsed of [17000, 23000, 110000, 9850000]) uneven.advanceMicroseconds(elapsed)
    expect(uneven.snapshot()).toEqual(smooth.snapshot())
    expect(uneven.recording()).toEqual(smooth.recording())
    expect(smooth.snapshot().status).toBe('finished')
  })

  it('retains partial steps and clears accumulated time on reset', () => {
    const runner = new ArenaRunner(scenario(), { champion: 'safe', rival: 'greedy' })
    expect(runner.advanceMicroseconds(25000)).toBe(0)
    expect(runner.interpolation).toBe(0.5)
    expect(runner.advanceMicroseconds(25000)).toBe(1)
    expect(runner.snapshot().tick).toBe(1)
    runner.advanceMicroseconds(25000)
    runner.reset()
    expect(runner.snapshot().tick).toBe(0)
    expect(runner.interpolation).toBe(0)
  })

  it('pins baseline selection for a match and safely bounds long elapsed periods', () => {
    const policies = { champion: 'safe' as const, rival: 'greedy' as 'safe' | 'greedy' }
    const runner = new ArenaRunner(scenario(), policies)
    policies.rival = 'safe'
    runner.advanceMicroseconds(Number.MAX_SAFE_INTEGER)
    expect(runner.snapshot().tick).toBe(200)
    expect(runner.snapshot().agents.find(agent => agent.id === 'rival')?.policyVersion).toBe('baseline.greedy.v2')
    expect(runner.advanceMicroseconds(50000)).toBe(0)
    expect(() => runner.advanceMicroseconds(NaN)).toThrow()
    expect(() => runner.advanceMicroseconds(-1)).toThrow()
    expect(() => runner.advanceMicroseconds(0.5)).toThrow()
  })

  it('chooses a safe route in a flood without giving the policy the future weather schedule', () => {
    const episode = new ArenaEpisode(scenario())
    expect(collectorPolicy(episode.observe('champion'), 'safe')).toEqual({ type: 'move', edgeId: 'west-high' })
    expect(collectorPolicy(episode.observe('champion'), 'greedy')).toEqual({ type: 'move', edgeId: 'west-low' })
  })

  it('runs complete autonomous episodes without clocks, browsers, or unseeded randomness', () => {
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('wall clock') })
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('unseeded') })
    try {
      const result = runArenaEpisode(scenario(), { champion: 'safe', rival: 'greedy' })
      expect(result.final.status).toBe('finished')
      expect(result.final.agents.reduce((sum, agent) => sum + agent.banked, 0)).toBeGreaterThan(0)
      expect(result.replay.batches.length).toBeGreaterThan(0)
    } finally {
      now.mockRestore()
      random.mockRestore()
    }
  })

  it('replays accepted and rejected decisions with matching checkpoints', () => {
    const episode = new ArenaEpisode(scenario())
    episode.step([command(episode, { type: 'move', edgeId: 'missing' })])
    advanceTo(episode, 15)
    episode.step([command(episode, { type: 'drain' })])
    advanceTo(episode, 70)
    const replay = JSON.parse(JSON.stringify(episode.recording()))
    const result = replayArenaEpisode(replay)
    expect(result.divergedAt).toBeNull()
    expect(result.final).toEqual(episode.snapshot())
  })

  it('reports changed state and command transcripts rather than claiming a matching replay', () => {
    const run = runArenaEpisode(scenario(), { champion: 'safe', rival: 'greedy' })
    const changedSnapshot = structuredClone(run.replay)
    changedSnapshot.checkpoints[1].state.agents[0].energy += 1
    expect(replayArenaEpisode(changedSnapshot).divergedAt).toBe(changedSnapshot.checkpoints[1].state.tick)
    const changedAction = structuredClone(run.replay)
    changedAction.batches[0].requests[0].action = { type: 'wait' }
    expect(replayArenaEpisode(changedAction).divergedAt).not.toBeNull()
  })

  it('rejects incompatible versions and incomplete checkpoints', () => {
    const replay = new ArenaEpisode(scenario()).recording()
    expect(() => replayArenaEpisode({ ...replay, rulesVersion: 'different' })).toThrow('version')
    expect(() => replayArenaEpisode({ ...replay, checkpoints: [] })).toThrow('checkpoints')
  })
})
