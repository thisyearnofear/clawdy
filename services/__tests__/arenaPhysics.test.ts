import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ArenaPhysics, initializeArenaPhysics, ROVER_PHYSICS } from '../arenaPhysics'
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
    nodes: [{ id: 'west', position: [-2, 0, 0] }, { id: 'east', position: [2, 0, 0] }, { id: 'north', position: [-2, 0, 2] }],
    edges: [
      { id: 'road', from: 'west', to: 'east', travelTicks: 40, floodable: true },
      { id: 'road2', from: 'west', to: 'north', travelTicks: 40, floodable: false },
    ],
    entrants: [{ id: 'champion', baseNode: 'west', policyVersion: 'test' }, { id: 'rival', baseNode: 'east', policyVersion: 'test' }],
    resources: [{ id: 'core', nodeId: 'east', value: 1 }, { id: 'core2', nodeId: 'north', value: 1 }], floods: [],
  }
  return { data, scenario }
}

/** Yaw of the committed quaternion's forward axis, robust to pitch/roll. */
function poseYaw(rotation: [number, number, number, number]): number {
  const [x, y, z, w] = rotation
  const fx = 2 * (x * z + w * y)
  const fz = 1 - 2 * (x * x + y * y)
  return Math.atan2(fx, fz)
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

describe('shared Rapier rover controller', () => {
  it('rate-limits committed chassis yaw instead of snapping to the target', () => {
    const { data } = fixture()
    const physics = new ArenaPhysics(data)
    try {
      physics.reset([{ id: 'rover', position: [-2, 0, 0] }])
      const dt = ARENA_RULES.stepMs / 1000
      physics.step([{ id: 'rover', position: [2, 0, 0] }], dt)
      let [pose] = physics.step([{ id: 'rover', position: [2, 0, 0] }], dt)
      // Reverse the target — v1 committed an instant ~180° flip here.
      const maxTurn = ROVER_PHYSICS.turnRate * dt
      for (let i = 0; i < 15; i++) {
        const prevYaw = poseYaw(pose.rotation)
        ;[pose] = physics.step([{ id: 'rover', position: [-5.5, 0, 0] }], dt)
        const flip = Math.abs(wrapAngle(poseYaw(pose.rotation) - prevYaw))
        expect(flip).toBeLessThanOrEqual(maxTurn + 1e-6)
      }
      // The slew converged: still en route, now facing the travel heading.
      expect(pose.position[0]).toBeGreaterThan(-5.5)
      const heading = Math.atan2(-5.5 - pose.position[0], 0 - pose.position[2])
      expect(Math.abs(wrapAngle(poseYaw(pose.rotation) - heading))).toBeLessThan(0.15)
    } finally {
      physics.dispose()
    }
  })

  it('holds chassis yaw inside the deadzone while still reaching the target', () => {
    const { data } = fixture()
    const physics = new ArenaPhysics(data)
    try {
      physics.reset([{ id: 'rover', position: [-2, 0, 0] }])
      const dt = ARENA_RULES.stepMs / 1000
      // Target 6cm away in +x: inside yawDeadzone, outside arrivalDistance.
      const [creep] = physics.step([{ id: 'rover', position: [-1.94, 0, 0] }], dt)
      expect(creep.position[0]).toBeGreaterThan(-2)
      expect(Math.abs(wrapAngle(poseYaw(creep.rotation)))).toBeLessThan(1e-6)
    } finally {
      physics.dispose()
    }
  })

  it('replays v1 recordings under v2 with rotation normalized, but still reports positional divergence', () => {
    const { data, scenario } = fixture()
    const physics = new ArenaPhysics(data)
    const replayPhysics = new ArenaPhysics(data)
    try {
      const runner = new ArenaRunner(scenario, { champion: 'safe', rival: 'greedy' }, physics)
      runner.advanceTicks(300)
      const recording = structuredClone(runner.recording())
      expect(recording.controllerVersion).toBe(ROVER_PHYSICS.version)

      // A recording written by the v1 controller (positions identical by
      // construction; rotations committed the old instant-snap values).
      const v1 = structuredClone(recording)
      v1.controllerVersion = 'rapier-kinematic-terrain-0.19.2.v1'
      for (const checkpoint of v1.checkpoints) {
        for (const agent of checkpoint.state.agents) agent.rotation = [0, 0, 0, 1]
      }
      expect(replayArenaEpisode(v1, replayPhysics).divergedAt).toBeNull()

      // Rotation equivalence never hides positional divergence.
      const corrupted = structuredClone(v1)
      corrupted.checkpoints[2].state.agents[0].position[0] += 0.5
      expect(replayArenaEpisode(corrupted, replayPhysics).divergedAt).toBe(corrupted.checkpoints[2].state.tick)

      // Unknown controllers are still a hard mismatch.
      const bogus = structuredClone(recording)
      bogus.controllerVersion = 'rapier-kinematic-terrain-0.19.2.v0'
      expect(() => replayArenaEpisode(bogus, replayPhysics)).toThrow('controller-mismatch')
    } finally {
      physics.dispose()
      replayPhysics.dispose()
    }
  })

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
