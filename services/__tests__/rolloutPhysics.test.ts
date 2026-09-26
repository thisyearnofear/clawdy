import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createWorldSurface } from '../worldSurface'
import { ArenaPhysics, initializeArenaPhysics } from '../arenaPhysics'
import {
  ARENA_RULES,
  ArenaEpisode,
  rolloutOutcomeDelta,
  type ArenaAction,
  type ArenaObservation,
  type ArenaScenario,
} from '../arenaEpisode'
import { collectorPolicy } from '../arenaPolicy'
import { applyCourseMode, buildArenaCourse, type ArenaCourse } from '../arenaCourse'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'

let course: ArenaCourse
let collider: { vertices: Float32Array; indices: Uint32Array }

beforeAll(async () => {
  await initializeArenaPhysics()
  const bytes = new Uint8Array(await readFile(resolve(process.cwd(), 'public/terrain/sandstone-basin.glb')))
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '')
  const surface = createWorldSurface(gltf.scene)
  collider = surface.colliderData()
  surface.dispose()
  const probe = new ArenaPhysics(collider)
  try {
    course = buildArenaCourse(probe)
  } finally {
    probe.dispose()
  }
})

const safe = (obs: ArenaObservation): ArenaAction => collectorPolicy(obs, 'safe')
const greedy = (obs: ArenaObservation): ArenaAction => collectorPolicy(obs, 'greedy')

function drive(episode: ArenaEpisode, untilTick: number) {
  while (!episode.finished && episode.tick < untilTick) {
    const tick = episode.tick
    if (tick % ARENA_RULES.decisionEveryTicks !== 0) {
      episode.step()
      continue
    }
    episode.step([
      { agentId: 'champion', tick, action: safe(episode.observe('champion')) },
      { agentId: 'rival', tick, action: greedy(episode.observe('rival')) },
    ])
  }
}

describe('physics-aware consequence rollouts', () => {
  it('a physics branch restored from a snapshot reproduces the uninterrupted run', () => {
    const scenario: ArenaScenario = applyCourseMode(course, 'practice').scenario
    const branchTick = 300
    const until = 480

    const referenceMotion = new ArenaPhysics(collider)
    const branchMotion = new ArenaPhysics(collider)
    try {
      const reference = new ArenaEpisode(scenario, referenceMotion)
      drive(reference, until)

      const walked = new ArenaEpisode(scenario, branchMotion)
      drive(walked, branchTick)
      const snap = walked.snapshot()

      const branch = new ArenaEpisode(scenario, branchMotion)
      branch.restoreSnapshot(snap)
      drive(branch, until)

      const ref = reference.snapshot()
      const restored = branch.snapshot()
      expect(restored.tick).toBe(ref.tick)
      for (const id of ['champion', 'rival']) {
        const a = ref.agents.find(agent => agent.id === id)!
        const b = restored.agents.find(agent => agent.id === id)!
        expect(b.banked).toBe(a.banked)
        expect(b.cargo).toBe(a.cargo)
        expect(b.energy).toBe(a.energy)
        expect(b.recoveries).toBe(a.recoveries)
        expect(b.nodeId).toBe(a.nodeId)
        expect(b.position).toEqual(a.position)
      }
    } finally {
      referenceMotion.dispose()
      branchMotion.dispose()
    }
  })

  it('physics-aware rolloutOutcomeDelta is deterministic across fresh colliders', () => {
    const scenario: ArenaScenario = applyCourseMode(course, 'practice').scenario
    const walkMotion = new ArenaPhysics(collider)
    try {
      const walk = new ArenaEpisode(scenario, walkMotion)
      // Advance to a decision state that actually offers a junction (≥2
      // move edges); mid-transit states offer none.
      let obs = walk.observe('champion')
      let moves = obs.availableActions.filter(a => a.type === 'move')
      while (moves.length < 2 && walk.tick < 600 && !walk.finished) {
        drive(walk, walk.tick + ARENA_RULES.decisionEveryTicks)
        obs = walk.observe('champion')
        moves = obs.availableActions.filter(a => a.type === 'move')
      }
      expect(moves.length).toBeGreaterThanOrEqual(2)
      const snap = walk.snapshot()

      const deltas: number[] = []
      for (let i = 0; i < 2; i++) {
        const motion = new ArenaPhysics(collider)
        try {
          deltas.push(rolloutOutcomeDelta(scenario, snap, moves[0], moves[1], safe, greedy, 120, motion))
        } finally {
          motion.dispose()
        }
      }
      expect(deltas[0]).toBe(deltas[1])
      expect(Number.isFinite(deltas[0])).toBe(true)
    } finally {
      walkMotion.dispose()
    }
  })

  it('route-only restoreSnapshot is unchanged when no motion adapter exists', () => {
    const scenario = PRACTICE_SCENARIOS[0]
    const episode = new ArenaEpisode(scenario)
    drive(episode, 120)
    const snap = episode.snapshot()

    const branch = new ArenaEpisode(scenario)
    branch.restoreSnapshot(snap)
    drive(branch, 240)
    drive(episode, 240)

    const a = episode.snapshot().agents.find(agent => agent.id === 'champion')!
    const b = branch.snapshot().agents.find(agent => agent.id === 'champion')!
    expect(b.banked).toBe(a.banked)
    expect(b.position).toEqual(a.position)
  })
})
