import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createWorldSurface } from '../worldSurface'
import { ArenaPhysics, initializeArenaPhysics } from '../arenaPhysics'
import { ArenaEpisode, DEFAULT_RUSH_RULES, type ArenaAction, type ArenaScenario } from '../arenaEpisode'
import { ArenaRunner, type EntrantPolicyOption } from '../arenaPolicy'
import { buildRushCourse, RUSH_WAVE_TICKS } from '../arenaCourse'
import { isEvaluationScenario } from '../arenaScenarios'
import { replayArenaEpisode } from '../arenaReplay'

function rushScenario(overrides: Partial<ArenaScenario> = {}): ArenaScenario {
  return {
    id: 'rush-fixture',
    worldVersion: 'fixture-v1',
    split: 'practice',
    seed: 12,
    durationTicks: 200,
    nodes: [
      { id: 'west', position: [-4, 0, 0] },
      { id: 'east', position: [4, 0, 0] },
      { id: 'field', position: [0, 0, 0] },
    ],
    edges: [
      { id: 'west-field', from: 'west', to: 'field', travelTicks: 20, floodable: false },
      { id: 'east-field', from: 'east', to: 'field', travelTicks: 20, floodable: false },
      { id: 'west-east', from: 'west', to: 'east', travelTicks: 120, floodable: false },
    ],
    entrants: [
      { id: 'champion', baseNode: 'west', policyVersion: 'safe-v1' },
      { id: 'rival', baseNode: 'east', policyVersion: 'greedy-v1' },
    ],
    resources: [{ id: 'core-a', nodeId: 'west', value: 2 }],
    floods: [],
    rush: { ...DEFAULT_RUSH_RULES },
    ...overrides,
  }
}

type Plan = Record<number, { champion?: ArenaAction; rival?: ArenaAction }>

/** Drive an episode with scripted actions keyed by decision tick. */
function play(episode: ArenaEpisode, plan: Plan, untilTick: number) {
  while (episode.tick < untilTick) {
    const tick = episode.tick
    const step = plan[tick]
    const requests = step
      ? (['champion', 'rival'] as const).flatMap(agentId => (step[agentId] ? [{ agentId, tick, action: step[agentId] }] : []))
      : []
    episode.step(requests)
  }
}

const headOn: Plan = {
  0: { champion: { type: 'collect', resourceId: 'core-a' } },
  5: { champion: { type: 'move', edgeId: 'west-field' }, rival: { type: 'move', edgeId: 'east-field' } },
}

describe('Rush: timed cores', () => {
  it('hides and rejects a core until its spawn tick, then announces it', () => {
    const scenario = rushScenario({ resources: [{ id: 'core-a', nodeId: 'west', value: 1, spawnTick: 10 }] })
    const episode = new ArenaEpisode(scenario)
    expect(episode.observe('champion').resources).toHaveLength(0)
    const early = episode.step([{ agentId: 'champion', tick: 0, action: { type: 'collect', resourceId: 'core-a' } }])
    expect(early[0]).toMatchObject({ accepted: false, reason: 'resource-unavailable' })
    play(episode, {}, 10)
    expect(episode.peek().events).toEqual([{ type: 'core_spawn', tick: 10, resourceId: 'core-a', nodeId: 'west', value: 1 }])
    expect(episode.observe('champion', { forceDecision: true }).resources.map(r => r.id)).toEqual(['core-a'])
    const late = episode.step([{ agentId: 'champion', tick: 10, action: { type: 'collect', resourceId: 'core-a' } }])
    expect(late[0]).toMatchObject({ accepted: true })
  })

  it('rejects spawn ticks outside the match', () => {
    expect(() => new ArenaEpisode(rushScenario({ resources: [{ id: 'c', nodeId: 'west', value: 1, spawnTick: 200 }] }))).toThrow('resources')
  })
})

describe('Rush: authoritative bump', () => {
  it('makes the heavier rover lose, steals one unit, and staggers the loser', () => {
    const episode = new ArenaEpisode(rushScenario())
    play(episode, headOn, 40)
    const bumps = episode.peek().events!.filter(event => event.type === 'bump')
    expect(bumps).toHaveLength(1)
    expect(bumps[0]).toMatchObject({ winnerId: 'rival', loserId: 'champion', stolen: 1 })
    const state = episode.snapshot()
    const champion = state.agents.find(agent => agent.id === 'champion')!
    const rival = state.agents.find(agent => agent.id === 'rival')!
    expect(champion.cargo).toBe(1)
    expect(rival.cargo).toBe(1)
    expect(champion.staggeredUntilTick).toBeGreaterThan(bumps[0].tick)
  })

  it('stamps a bump with the tick of the snapshot that first contains it', () => {
    const episode = new ArenaEpisode(rushScenario())
    let seen: number | null = null
    while (episode.tick < 40 && seen === null) {
      play(episode, headOn, episode.tick + 1)
      if (episode.peek().events!.some(event => event.type === 'bump')) seen = episode.tick
    }
    const bump = episode.peek().events!.find(event => event.type === 'bump')!
    expect(bump.tick).toBe(seen)
  })

  it('bumps only once per cooldown window', () => {
    const episode = new ArenaEpisode(rushScenario())
    play(episode, headOn, 60)
    expect(episode.peek().events!.filter(event => event.type === 'bump').length).toBe(1)
  })

  it('does nothing when rush rules are absent (Haul stays contact-free)', () => {
    const episode = new ArenaEpisode(rushScenario({ rush: undefined }))
    play(episode, headOn, 40)
    expect(episode.snapshot().events).toBeUndefined()
    expect(episode.snapshot().agents.find(agent => agent.id === 'champion')!.cargo).toBe(2)
  })

  it('is deterministic and survives recording checkpoints', () => {
    const run = () => {
      const episode = new ArenaEpisode(rushScenario())
      play(episode, headOn, 80)
      return episode
    }
    const a = run()
    const b = run()
    expect(a.peek().events).toEqual(b.peek().events)
    const last = a.recording().checkpoints.at(-1)!.state
    expect(last.events).toEqual(a.peek().events)
  })

  it('validates rush rules', () => {
    expect(() => new ArenaEpisode(rushScenario({ rush: { ...DEFAULT_RUSH_RULES, contactRadiusM: 0 } }))).toThrow('rush rules')
    expect(() => new ArenaEpisode(rushScenario({ rush: { ...DEFAULT_RUSH_RULES, bumpCooldownTicks: 0 } }))).toThrow('rush rules')
  })
})

describe('Rush arena on the grounded basin', () => {
  let collider: { vertices: Float32Array; indices: Uint32Array }
  beforeAll(async () => {
    await initializeArenaPhysics()
    const bytes = new Uint8Array(await readFile(resolve(process.cwd(), 'public/terrain/sandstone-basin.glb')))
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '')
    const surface = createWorldSurface(gltf.scene)
    collider = surface.colliderData()
    surface.dispose()
  })

  function shortestTicks(scenario: ArenaScenario, from: string, to: string): number {
    const dist = new Map<string, number>([[from, 0]])
    const done = new Set<string>()
    for (;;) {
      const current = [...dist].filter(([id]) => !done.has(id)).sort((a, b) => a[1] - b[1])[0]
      if (!current) throw new Error('unreachable')
      if (current[0] === to) return current[1]
      done.add(current[0])
      for (const edge of scenario.edges) {
        const next = edge.from === current[0] ? edge.to : edge.to === current[0] ? edge.from : null
        if (next && !done.has(next)) dist.set(next, Math.min(dist.get(next) ?? Infinity, current[1] + edge.travelTicks))
      }
    }
  }

  it('builds a valid, nearly symmetric contested centre', () => {
    const physics = new ArenaPhysics(collider)
    try {
      const course = buildRushCourse(physics)
      const { scenario } = course
      expect(scenario.id.startsWith('sandstone-rush-')).toBe(true)
      expect(isEvaluationScenario(scenario.id)).toBe(false)
      expect(scenario.nodes).toHaveLength(20)
      expect(scenario.edges).toHaveLength(38)
      expect(physics.canStand(scenario.nodes.find(node => node.id === 'arena-core')!.position)).toBe(true)
      expect(scenario.resources.filter(r => r.spawnTick !== undefined).map(r => r.spawnTick)).toEqual([...RUSH_WAVE_TICKS])
      const champion = shortestTicks(scenario, 'champion-base', 'arena-core')
      const rival = shortestTicks(scenario, 'rival-base', 'arena-core')
      expect(Math.abs(champion - rival) / Math.max(champion, rival)).toBeLessThan(0.1)
      expect(() => new ArenaEpisode(scenario)).not.toThrow()
    } finally {
      physics.dispose()
    }
  })

  it('records a complete contested match and replays every event and score', () => {
    const probe = new ArenaPhysics(collider)
    const scenario = buildRushCourse(probe).scenario
    probe.dispose()
    const runner = new ArenaRunner(scenario, { champion: 'poach', rival: 'poach' })
    runner.advanceTicks(scenario.durationTicks)
    const recording = runner.recording()
    const events = runner.snapshot().events ?? []
    expect(recording.finalTick).toBe(scenario.durationTicks)
    expect(events.filter(event => event.type === 'core_spawn').map(event => event.tick)).toEqual([...RUSH_WAVE_TICKS])
    expect(events.some(event => event.type === 'bump')).toBe(true)
    expect(recording.checkpoints.at(-1)?.state.events).toEqual(events)
    const replay = replayArenaEpisode(recording)
    expect(replay.divergedAt).toBeNull()
    expect(replay.final).toEqual(runner.snapshot())
  })

  it('agrees exactly between physics-backed and route-only matches, bumps included', () => {
    const probe = new ArenaPhysics(collider)
    let scenario: ArenaScenario
    try {
      scenario = buildRushCourse(probe).scenario
    } finally {
      probe.dispose()
    }
    const options: Record<string, EntrantPolicyOption> = { champion: 'greedy', rival: 'poach' }
    const routeOnly = new ArenaRunner(scenario, options)
    routeOnly.advanceTicks(scenario.durationTicks)
    const motion = new ArenaPhysics(collider)
    try {
      const physical = new ArenaRunner(scenario, options, motion)
      physical.advanceTicks(scenario.durationTicks)
      const strip = (snap: ReturnType<typeof routeOnly.snapshot>) => ({
        banked: snap.agents.map(agent => [agent.id, agent.banked]),
        events: snap.events,
        winner: snap.winner,
      })
      expect(strip(physical.snapshot())).toEqual(strip(routeOnly.snapshot()))
    } finally {
      motion.dispose()
    }
  })
})
