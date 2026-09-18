import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createWorldSurface } from '../worldSurface'
import { ArenaPhysics, initializeArenaPhysics } from '../arenaPhysics'
import { ArenaEpisode } from '../arenaEpisode'
import { ArenaRunner } from '../arenaPolicy'
import { replayArenaEpisode } from '../arenaReplay'
import { ARENA_WORLD, applyCourseMode, buildArenaCourse, loadArenaCourse } from '../arenaCourse'

let bytes: Uint8Array<ArrayBuffer>
let collider: { vertices: Float32Array; indices: Uint32Array }

beforeAll(async () => {
  await initializeArenaPhysics()
  bytes = new Uint8Array(await readFile(resolve(process.cwd(), 'public/terrain/sandstone-basin.glb')))
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '')
  const surface = createWorldSurface(gltf.scene)
  collider = surface.colliderData()
  surface.dispose()
})
afterEach(() => vi.unstubAllGlobals())

describe('versioned Sandstone Basin course', () => {
  it('pins the course to the committed terrain and grounds its nodes and paths', () => {
    expect(ARENA_WORLD.terrainUrl).toBe(ARENA_WORLD.colliderUrl)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ARENA_WORLD.colliderSha256)
    const physics = new ArenaPhysics(collider)
    try {
      const course = buildArenaCourse(physics)
      expect(course.config.terrain.url).toBe(ARENA_WORLD.terrainUrl)
      expect(course.config.terrain.sha256).toBe(ARENA_WORLD.colliderSha256)
      expect(course.scenario.worldVersion).toBe(ARENA_WORLD.version)
      expect(course.scenario.nodes).toHaveLength(13)
      expect(course.scenario.edges).toHaveLength(26)
      expect(course.scenario.edges.filter(edge => edge.floodable)).toHaveLength(10)
      const ridge = course.scenario.nodes.find(node => node.id === 'ridge-center')!.position
      const valley = course.scenario.nodes.find(node => node.id === 'valley-center')!.position
      expect(ridge[1] - valley[1]).toBeGreaterThanOrEqual(0.8)
      expect(course.floodZones).toHaveLength(2)
      for (const zone of course.floodZones) expect(zone.size).toEqual([1.35, 2.4])
      for (const node of course.scenario.nodes) expect(physics.canStand(node.position)).toBe(true)
      for (const edge of course.scenario.edges) {
        expect(edge.path!.length).toBeGreaterThan(2)
        expect(edge.path![0]).toEqual(course.scenario.nodes.find(node => node.id === edge.from)!.position)
        expect(edge.path!.at(-1)).toEqual(course.scenario.nodes.find(node => node.id === edge.to)!.position)
        for (const point of edge.path!) {
          const sample = physics.sample([point[0], point[1] + 1, point[2]], 4)
          expect(sample, `${edge.id} ungrounded sample`).not.toBeNull()
          expect(Math.abs(sample!.point[1] - point[1]), `${edge.id} sample drop`).toBeLessThan(1e-4)
          expect(sample!.normal[1], `${edge.id} steep sample`).toBeGreaterThanOrEqual(0.7)
        }
      }
    } finally {
      physics.dispose()
    }
  })

  it('physically traverses every authored edge in both directions without a recovery', () => {
    const physics = new ArenaPhysics(collider)
    try {
      const { scenario } = buildArenaCourse(physics)
      for (const edge of scenario.edges) {
        for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]]) {
          const episode = new ArenaEpisode({
            ...scenario,
            floods: [],
            entrants: scenario.entrants.map(entrant => ({ ...entrant, baseNode: entrant.id === 'champion' ? from : entrant.baseNode })),
          }, physics)
          episode.step([{ agentId: 'champion', tick: 0, action: { type: 'move', edgeId: edge.id } }])
          for (let tick = 1; tick < edge.travelTicks + 80; tick++) episode.step()
          const champion = episode.observe('champion').self
          expect(champion.nodeId, `${edge.id}: ${from} to ${to}`).toBe(to)
          expect(champion.recoveries, `${edge.id}: unexpected recovery`).toBe(0)
          expect(champion.grounded).toBe(true)
        }
      }
    } finally {
      physics.dispose()
    }
  }, 30000)

  it('completes and replays the actual world with the same physics and rules', () => {
    const physics = new ArenaPhysics(collider)
    const replayPhysics = new ArenaPhysics(collider)
    try {
      const { scenario } = buildArenaCourse(physics)
      const runner = new ArenaRunner(scenario, { champion: 'safe', rival: 'greedy' }, physics)
      runner.advanceTicks(scenario.durationTicks)
      const final = runner.snapshot()
      expect(final.status).toBe('finished')
      expect(final.agents.every(agent => agent.banked > 0)).toBe(true)
      expect(final.agents.every(agent => agent.recoveries === 0)).toBe(true)
      expect(replayArenaEpisode(runner.recording(), replayPhysics).divergedAt).toBeNull()
    } finally {
      physics.dispose()
      replayPhysics.dispose()
    }
  }, 30000)

  it('loads the pinned course and disposes its physics without any browser', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)))
    const loaded = await loadArenaCourse()
    expect(loaded.course.config.terrain.url).toBe('/terrain/sandstone-basin.glb')
    expect(loaded.course.scenario.worldVersion).toBe(ARENA_WORLD.version)
    loaded.dispose()
    expect(() => loaded.physics.sample([0, 10, 0])).toThrow('disposed')
  })

  it('rejects a changed collider rather than playing on a mismatched world', async () => {
    const changed = bytes.slice()
    changed[changed.length - 1] ^= 1
    vi.stubGlobal('fetch', vi.fn(async () => new Response(changed)))
    await expect(loadArenaCourse()).rejects.toThrow('hash')
  })

  it('rejects network failures and an already-cancelled load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
    await expect(loadArenaCourse()).rejects.toThrow('503')
    const abort = new AbortController()
    abort.abort()
    await expect(loadArenaCourse(abort.signal)).rejects.toThrow()
  })

  it('completes and replays both practice and compete modes on the sandstone terrain', () => {
    const physics = new ArenaPhysics(collider)
    const replayPhysics = new ArenaPhysics(collider)
    try {
      const practice = buildArenaCourse(physics)
      for (const mode of ['practice', 'compete'] as const) {
        const { scenario } = applyCourseMode(practice, mode)
        expect(scenario.id).toBe(`sandstone-${mode}-01`)
        const runner = new ArenaRunner(scenario, { champion: 'safe', rival: 'greedy' }, physics)
        runner.advanceTicks(scenario.durationTicks)
        const final = runner.snapshot()
        expect(final.status, mode).toBe('finished')
        expect(final.agents.every(agent => agent.banked > 0), mode).toBe(true)
        expect(final.agents.every(agent => agent.recoveries === 0), mode).toBe(true)
        expect(replayArenaEpisode(runner.recording(), replayPhysics).divergedAt, mode).toBeNull()
      }
    } finally {
      physics.dispose()
      replayPhysics.dispose()
    }
  }, 60000)

  it('keeps the grounded world and only changes floods and cores in compete mode', () => {
    const physics = new ArenaPhysics(collider)
    try {
      const practice = buildArenaCourse(physics)
      const compete = applyCourseMode(practice, 'compete')
      const restored = applyCourseMode(compete, 'practice')
      expect(compete.scenario.id).toBe('sandstone-compete-01')
      expect(compete.scenario.split).toBe('evaluation')
      expect(compete.scenario.nodes).toEqual(practice.scenario.nodes)
      expect(compete.scenario.edges.map(edge => edge.id)).toEqual(practice.scenario.edges.map(edge => edge.id))
      expect(compete.scenario.resources.map(resource => resource.nodeId)).not.toEqual(practice.scenario.resources.map(resource => resource.nodeId))
      expect(restored.scenario.id).toBe('sandstone-practice-01')
      expect(restored.scenario.split).toBe('practice')
      expect(restored.scenario.floods).toEqual(practice.scenario.floods)
    } finally {
      physics.dispose()
    }
  })
})
