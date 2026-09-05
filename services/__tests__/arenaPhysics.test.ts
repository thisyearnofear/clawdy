import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ArenaPhysics, initializeArenaPhysics } from '../arenaPhysics'
import { createWorldSurface } from '../worldSurface'
import { ArenaEpisode, ARENA_RULES, type ArenaScenario } from '../arenaEpisode'
import { ArenaRunner } from '../arenaPolicy'
import { replayArenaEpisode } from '../arenaReplay'

beforeAll(initializeArenaPhysics)

function fixture(wall = false) {
  const root = new THREE.Group()
  const ground = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 12))
  ground.position.y = -0.1
  root.add(ground)
  if (wall) {
    const obstacle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 8))
    obstacle.position.y = 1.5
    root.add(obstacle)
  }
  const surface = createWorldSurface(root)
  const data = surface.colliderData()
  surface.dispose()
  const scenario: ArenaScenario = {
    id: 'physics-fixture', worldVersion: 'fixture-v1', split: 'practice', seed: 4, durationTicks: 300,
    nodes: [{ id: 'west', position: [-2, 0, 0] }, { id: 'east', position: [2, 0, 0] }],
    edges: [{ id: 'road', from: 'west', to: 'east', travelTicks: 40, floodable: true }],
    entrants: [{ id: 'champion', baseNode: 'west', policyVersion: 'test' }, { id: 'rival', baseNode: 'east', policyVersion: 'test' }],
    resources: [{ id: 'core', nodeId: 'east', value: 1 }], floods: [],
  }
  return { data, scenario }
}

describe('shared Rapier rover controller', () => {
  it('grounds a rover and sweeps against walls instead of teleporting through them', () => {
    const { data } = fixture(true)
    const physics = new ArenaPhysics(data)
    try {
      physics.reset([{ id: 'rover', position: [-2, 0, 0] }])
      let [pose] = physics.step([{ id: 'rover', position: [2, 0, 0] }], ARENA_RULES.stepMs / 1000)
      for (let i = 0; i < 3; i++) {
        [pose] = physics.step([{ id: 'rover', position: [2, 0, 0] }], ARENA_RULES.stepMs / 1000)
      }
      expect(pose.position[0]).toBeLessThan(-0.2)
      expect(pose.position[1]).toBeCloseTo(0, 1)
      expect(pose.grounded).toBe(true)
      expect(physics.canStand([0, 0, 0])).toBe(false)
    } finally {
      physics.dispose()
    }
  })

  it('does not award arrival or collection when a collider blocks the route', () => {
    const { data, scenario } = fixture(true)
    const physics = new ArenaPhysics(data)
    try {
      const episode = new ArenaEpisode(scenario, physics)
      episode.step([{ agentId: 'champion', tick: 0, action: { type: 'move', edgeId: 'road' } }])
      for (let tick = 1; tick < 150; tick++) episode.step()
      const champion = episode.observe('champion').self
      expect(champion.nodeId).toBe('west')
      expect(champion.cargo).toBe(0)
      expect(champion.recoveries).toBe(1)
      expect(champion.blockedEdges).toContain('road')
      expect(episode.observe('champion').availableActions).not.toContainEqual({ type: 'move', edgeId: 'road' })
    } finally {
      physics.dispose()
    }
  })

  it('uses one physical authority for live execution, replay, and reset', () => {
    const { data, scenario } = fixture()
    const physics = new ArenaPhysics(data)
    const replayPhysics = new ArenaPhysics(data)
    try {
      const runner = new ArenaRunner(scenario, { champion: 'safe', rival: 'greedy' }, physics)
      runner.advanceTicks(300)
      expect(runner.snapshot().status).toBe('finished')
      expect(runner.snapshot().agents.some(agent => agent.banked > 0)).toBe(true)
      const replay = runner.recording()
      expect(() => replayArenaEpisode(replay)).toThrow('controller')
      expect(replayArenaEpisode(replay, replayPhysics).divergedAt).toBeNull()
      const first = runner.snapshot()
      runner.reset()
      runner.advanceTicks(300)
      expect(runner.snapshot()).toEqual(first)
    } finally {
      physics.dispose()
      replayPhysics.dispose()
    }
  })

  it('rejects impossible spawns and operations after disposal', () => {
    const { data } = fixture(true)
    const physics = new ArenaPhysics(data)
    expect(() => physics.reset([{ id: 'rover', position: [0, 0, 0] }])).toThrow('Spawn overlaps')
    physics.dispose()
    physics.dispose()
    expect(() => physics.sample([0, 5, 0])).toThrow('disposed')
  })
})
