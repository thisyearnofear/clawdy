import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { TEMPLATE_CONNECTIONS, TEMPLATE_STATIONS } from '../arenaCourse'
import { initializeArenaPhysics } from '../arenaPhysics'
import { isEvaluationScenario } from '../arenaScenarios'
import { WORLD_PRESETS } from '../arenaWorldIntent'
import {
  AUTHORED_RELIEF_PLAN,
  WORLD_LANDFORMS,
  WORLD_PALETTES,
  WORLDGEN_BOUNDS,
  WORLDGEN_STEP,
  certifyGeneration,
  generateWorld,
  generatedWorldId,
  isRoadAt,
  planHeight,
  retreatPlan,
  worldHeightAt,
  worldSpecDigest,
  type WorldSpec,
} from '../arenaWorldgen'

/**
 * Track F. The claim under test is narrow and load-bearing: terrain generated
 * from plain language is *playable*, proved by the same sim gates the authored
 * course uses — not asserted by a pretty mesh.
 */

const BASIN: WorldSpec = {
  landform: 'basin',
  ridge: { x: 7.2, height: 0.9 },
  channels: { count: 3, spacing: 2.5, depth: 0.1 },
  rim: { height: 1.2, steepness: 2.4 },
  waterlineOffset: 0,
  palette: 'sandstone',
  rockDensity: 0.5,
  scenarioName: 'Fidelity Basin',
}

/**
 * Sampled from `ground_height` and `is_road` as shipped in
 * `scripts/build-arena-terrain.py` — the Blender baker that produced the
 * pinned GLB, which is not modified by this track. Rows are [x, z, height,
 * isRoad], compared against the authored relief plan, i.e. the TS port
 * against the Python original it must match.
 */
const PYTHON_GROUND_HEIGHT_FIXTURE: readonly (readonly [number, number, number, number])[] = [
  [2.9834, -1.1252, 0.120000, 0], [13.7794, 14.2774, 1.950321, 0], [11.5477, 4.4478, 1.020820, 0],
  [0.6003, 3.1615, 0.929143, 0], [1.5735, 3.1809, 0.355420, 0], [7.9072, 8.9308, 0.798732, 0],
  [15.9392, 3.8539, 2.395410, 0], [8.8681, 14.4379, 1.002439, 1], [13.2505, 0.2392, 1.754038, 0],
  [8.2943, 7.9127, 0.902471, 1], [1.1146, 20.602, 1.405567, 0], [1.1267, 14.7632, 0.731347, 0],
  [-1.6755, 21.9002, 1.245493, 0], [15.686, -4.5709, 2.325647, 0], [0.7021, 15.0737, 1.025361, 0],
  [15.8269, 12.2718, 2.182298, 0], [6.529, 19.2248, 1.094976, 0], [-1.2312, 9.2902, 1.506932, 0],
  [6.3686, -3.649, 1.418390, 0], [12.5446, 16.4748, 1.293774, 0], [-2.396, 1.6063, 1.261812, 0],
  [-0.0901, 0.1184, 1.258089, 0], [13.1207, 2.5079, 1.580525, 0], [-1.5715, -4.6291, 1.488606, 0],
  [14.8354, 10.6121, 2.395813, 0], [13.6045, 2.8003, 1.872780, 0], [14.5617, -0.497, 2.143719, 0],
  [1.9795, 11.7598, 0.205608, 0], [4.6985, -1.22, 0.120000, 0], [10.8713, -0.6211, 1.020000, 0],
  [-2.6904, 1.7539, 1.246985, 0], [12.9659, 3.015, 1.523623, 0], [0.7077, 8.7932, 1.001691, 0],
  [9.8142, -4.3679, 2.245331, 0], [-2.7949, 12.8966, 1.262998, 0], [16.3618, -3.6073, 2.407073, 0],
  [-1.7374, 17.0394, 1.519966, 0], [-2.6212, 20.8049, 1.115704, 0], [7.4602, -1.6498, 0.665075, 0],
  [8.3239, 5.3635, 0.909388, 0], [-2.3274, 18.5821, 1.430862, 0], [8.1721, 0.5219, 0.872248, 1],
  [1.5545, 14.0926, 0.446262, 0], [13.3377, 6.4777, 1.884641, 0], [-2.3501, 9.5406, 1.438470, 0],
  [12.8011, 15.0836, 1.453688, 0], [1.4399, 0.7991, 0.520165, 0], [3.4353, -3.7984, 0.991612, 0],
  [8.9396, 13.1752, 1.009054, 0], [5.4708, 10.3183, 0.131815, 1], [13.2136, 15.9118, 1.613961, 0],
  [16.1491, 13.0946, 2.023003, 0], [15.4379, 14.7418, 2.026950, 0], [9.1621, 8.9147, 1.019759, 0],
  [8.4011, 0.4967, 0.926637, 1], [5.6463, 18.6615, 0.614463, 0], [0.7389, 8.011, 0.999862, 0],
  [1.671, 8.9879, 0.348869, 0], [-1.4951, 2.8518, 1.519730, 0], [10.7513, 10.4126, 1.020000, 0],
  [4, 0, 0.119886, 1], [4, 1.5, 0.042022, 1], [4, 4, 0.119772, 1],
  [4, 6.5, 0.042022, 1], [4, 10, 0.042022, 1], [4, 13, 0.109941, 1],
  [4, 16, 0.109941, 1], [10, 0, 1.020000, 1], [10, 1.5, 1.020000, 1],
  [10, 4, 1.020000, 1], [10, 6.5, 1.020000, 1], [10, 10, 1.020000, 1],
  [10, 13, 1.020000, 1], [10, 16, 1.020000, 1], [7, 2, 0.502725, 1],
  [7, 4, 0.502725, 1], [7, 6, 0.502725, 1], [7, 8, 0.502725, 1],
  [7, 10, 0.502725, 1], [7, 13.5, 0.502725, 1], [2.5, -1.5, 0.120000, 0],
  [11.5, 17.5, 1.020000, 0], [2.5, 17.5, 0.120000, 0], [11.5, -1.5, 1.020000, 0],
  [7.2, 7.2, 0.570000, 0], [5.2, 9.2, 0.119843, 0], [9.2, 5.2, 1.020000, 0],
]

/** Adversarial, but every number is inside the frozen contract ranges. */
const STEEP_CANYON: WorldSpec = {
  ...BASIN,
  landform: 'canyon',
  ridge: { x: 5.5, height: 1.6 },
  channels: { count: 4, spacing: 2.0, depth: 0.16 },
  scenarioName: 'Ladder Canyon',
}

/**
 * Out of range on purpose: a hand-built spec that never passed
 * `sanitizeWorldSpec`. It exists to prove the contract's ranges are
 * load-bearing and that the refusal path refuses instead of throwing.
 */
const UNCERTIFIABLE: WorldSpec = {
  ...BASIN,
  landform: 'canyon',
  ridge: { x: 6.9, height: 9 },
  channels: { count: 6, spacing: 1.5, depth: 3 },
  scenarioName: 'Impossible Wall',
}

beforeAll(async () => {
  await initializeArenaPhysics()
})

/**
 * Interior terrain vertices of a generated world, as `[x, y, z]` triples that
 * can be compared point-for-point against `worldHeightAt`. The boundary ring,
 * skirt walls and cap fan share grid coordinates but are not terrain height, so
 * they are outside the footprint margin.
 */
function meshSurface(scene: THREE.Object3D): [number, number, number][] {
  const mesh = scene.getObjectByName('Terrain') as THREE.Mesh
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const { minX, maxX, minZ, maxZ } = WORLDGEN_BOUNDS
  const onGrid = (value: number) => Math.abs(value - Math.round(value / WORLDGEN_STEP) * WORLDGEN_STEP) < 1e-4
  const out: [number, number, number][] = []
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (!onGrid(x) || !onGrid(z) || y < -0.5) continue
    if (x <= minX + WORLDGEN_STEP || x >= maxX - WORLDGEN_STEP) continue
    if (z <= minZ + WORLDGEN_STEP || z >= maxZ - WORLDGEN_STEP) continue
    out.push([x, y, z])
  }
  return out
}

describe('heightfield port fidelity', () => {
  it('reproduces the Blender baker ground_height at every sampled point', () => {
    expect(PYTHON_GROUND_HEIGHT_FIXTURE.length).toBeGreaterThanOrEqual(80)
    for (const [x, z, height] of PYTHON_GROUND_HEIGHT_FIXTURE) {
      // Fixture heights are rounded to 6 decimals, so that is the comparison floor.
      expect(planHeight(AUTHORED_RELIEF_PLAN, x, z), `ground_height(${x}, ${z})`).toBeCloseTo(height, 5)
    }
  })

  it('reproduces the road grammar the baker paints corridors with', () => {
    for (const [x, z, , road] of PYTHON_GROUND_HEIGHT_FIXTURE) {
      expect(isRoadAt(x, z), `is_road(${x}, ${z})`).toBe(road === 1)
    }
  })

  it('keeps the authored ridge inside the relief the contract can ask for', () => {
    // The pin cannot be reached through a sanitized spec: its channel gap is
    // wider than `channels.spacing` allows. Generated terrain is new ground,
    // never a copy of the scored basin.
    expect(AUTHORED_RELIEF_PLAN.channelCenters).toContain(10.5)
    expect(BASIN.channels.spacing * (BASIN.channels.count - 1)).toBeLessThan(14.5 - 2.0)
  })

  it('carves channels below the floor and raises the rim outside the play rectangle', () => {
    const floor = worldHeightAt(BASIN, 4, 2)
    expect(worldHeightAt(BASIN, 4, 6)).toBeLessThan(floor + 0.6)
    expect(worldHeightAt({ ...BASIN, waterlineOffset: 0.35 }, 4, 6)).toBeGreaterThan(worldHeightAt(BASIN, 4, 6))
    // Rim sits outside the play rectangle; the ridge shoulder inside it.
    expect(worldHeightAt(BASIN, 1.5, 8)).toBeGreaterThan(worldHeightAt(BASIN, 2.6, 8))
    expect(planHeight(retreatPlan(AUTHORED_RELIEF_PLAN), 16, 8)).toBeLessThan(planHeight(AUTHORED_RELIEF_PLAN, 16, 8))
  })
})

async function generate(spec: WorldSpec) {
  const world = await generateWorld(spec)
  if (!world) throw new Error(`expected a certified world for '${spec.scenarioName}'`)
  return world
}

describe('generated mesh agrees with the analytic field', () => {
  it('exposes one world-space terrain mesh with detail-map UVs', async () => {
    const world = await generate(BASIN)
    try {
      const meshes: THREE.Mesh[] = []
      world.scene.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object) })
      expect(meshes).toHaveLength(1)
      const terrain = meshes[0]
      expect(terrain.name).toBe('Terrain')
      expect(terrain.matrix.equals(new THREE.Matrix4().identity())).toBe(true)
      const geometry = terrain.geometry as THREE.BufferGeometry
      expect(geometry.getAttribute('uv')).toBeDefined()
      expect(geometry.getAttribute('color')).toBeDefined()
      expect(geometry.getIndex()!.count % 3).toBe(0)
      // The footprint is the authored baker's, so stations can never fall off
      // the edge of a generated mesh.
      const position = geometry.getAttribute('position')
      let minX = Infinity
      let maxX = -Infinity
      for (let index = 0; index < position.count; index++) {
        minX = Math.min(minX, position.getX(index))
        maxX = Math.max(maxX, position.getX(index))
      }
      expect([minX, maxX]).toEqual([WORLDGEN_BOUNDS.minX, WORLDGEN_BOUNDS.maxX])
    } finally {
      world.dispose()
    }
  })

  it('collides where the heightfield says the ground is', async () => {
    const world = await generate(BASIN)
    try {
      for (const station of TEMPLATE_STATIONS) {
        const sample = world.physics.sample([station.x, 8, station.z], 12)
        expect(sample, `surface at ${station.x}, ${station.z}`).not.toBeNull()
        // Float32 vertices plane-cut a curved surface on a 0.25 m grid, so the
        // collider sits within a couple of centimetres of the analytic field.
        expect(Math.abs(sample!.point[1] - worldHeightAt(BASIN, station.x, station.z)),
          `height at ${station.x}, ${station.z}`).toBeLessThan(0.02)
      }
      expect(WORLDGEN_STEP).toBe(0.25)
    } finally {
      world.dispose()
    }
  })
})

describe('playability certificate', () => {
  it('certifies every landform and every palette with no refusals', async () => {
    for (const landform of WORLD_LANDFORMS) {
      const world = await generate({ ...BASIN, landform, scenarioName: `${landform} probe` })
      try {
        expect(world.certificate.stationsGrounded, landform).toBe(world.certificate.stationsTotal)
        expect(world.certificate.routesCleared, landform).toBe(world.certificate.routesTotal)
        expect(world.certificate.repairsApplied, landform).toBeLessThanOrEqual(24)
      } finally {
        world.dispose()
      }
    }
    for (const palette of WORLD_PALETTES) {
      const world = await generate({ ...BASIN, palette, scenarioName: `${palette} probe` })
      try {
        expect(world.certificate.stationsGrounded).toBe(world.certificate.stationsTotal)
        expect(world.certificate.routesCleared).toBe(world.certificate.routesTotal)
      } finally {
        world.dispose()
      }
    }
  }, 120000)

  it('counts the gates it actually applied', async () => {
    const world = await generate(BASIN)
    try {
      // 19 template stations + the rush core + 3 flood-zone probes, and every
      // template connection plus the two rush links into the core.
      expect(world.certificate.stationsTotal).toBe(23)
      expect(world.certificate.routesTotal).toBe(TEMPLATE_CONNECTIONS.length + 2)
      expect(world.certificate.worldDigest).toBe(await worldSpecDigest(BASIN))
      expect(world.certificate.msElapsed).toBeGreaterThanOrEqual(0)
    } finally {
      world.dispose()
    }
  })

  it('ships the three preset worlds as certified courses', async () => {
    for (const preset of WORLD_PRESETS) {
      const world = await generate(preset.spec)
      try {
        expect(world.certificate.stationsGrounded, preset.description).toBe(world.certificate.stationsTotal)
        expect(world.certificate.routesCleared, preset.description).toBe(world.certificate.routesTotal)
      } finally {
        world.dispose()
      }
    }
  }, 120000)

  it('stamps practice-only provenance that the eval gate cannot mistake for a scored layout', async () => {
    const world = await generate({ ...BASIN, landform: 'salt-flat', palette: 'oxide' })
    try {
      const digest = await worldSpecDigest({ ...BASIN, landform: 'salt-flat', palette: 'oxide' })
      const worldId = generatedWorldId(digest)
      for (const course of [world.course, world.rushCourse]) {
        expect(course.scenario.split).toBe('practice')
        expect(course.scenario.worldVersion).toBe(worldId)
        expect(course.config.id).toBe(worldId)
        expect(course.config.terrain.url).toBe(`generated:${worldId}`)
        expect(course.config.terrain.sha256).toBe(digest)
        expect(course.generated?.certificate).toBe(world.certificate)
        expect(isEvaluationScenario(course.scenario.id)).toBe(false)
        expect(course.scenario.id.startsWith('generated-')).toBe(true)
      }
      expect(world.rushCourse.scenario.id).not.toBe(world.course.scenario.id)
      // The rover physics version is pinned by the eval gate; generating a
      // world must not quietly change how a chassis drives.
      expect(world.physics.version).toMatch(/^rapier-kinematic-terrain/)
    } finally {
      world.dispose()
    }
  })
})

describe('repair ladder', () => {
  it('grades a crossing instead of refusing a steep-but-narrow canyon', async () => {
    const raw = planHeight({ ...AUTHORED_RELIEF_PLAN, ridgeX: STEEP_CANYON.ridge.x, ridgeHeight: STEEP_CANYON.ridge.height * 1.5 }, 7, 2)
    expect(Number.isFinite(raw)).toBe(true)

    const report = await certifyGeneration(STEEP_CANYON)
    expect(report.world, 'ladder should have certified the spec').not.toBeNull()
    try {
      expect(report.certificate!.repairsApplied).toBeGreaterThan(0)
      expect(report.certificate!.stationsGrounded).toBe(report.certificate!.stationsTotal)
      expect(report.certificate!.routesCleared).toBe(report.certificate!.routesTotal)
      expect(report.audit!.failures).toEqual([])
    } finally {
      report.world!.dispose()
    }
  }, 120000)

  it('repairs the refused patch only — the world keeps the relief that was asked for', async () => {
    // The soft spot this guards: a repair that flattens a disc of ground, or
    // retreats the whole planet, certifies perfectly and looks nothing like the
    // description. Measure the shipped mesh against the analytic relief the
    // spec asked for and hold the repair to the neighbourhood it was told to fix.
    const report = await certifyGeneration(STEEP_CANYON)
    expect(report.world).not.toBeNull()
    try {
      const surface = meshSurface(report.world!.scene)
      let moved = 0
      let deepest = 0
      for (const [x, y, z] of surface) {
        const delta = Math.abs(y - worldHeightAt(STEEP_CANYON, x, z))
        if (delta > 1e-6) moved++
        if (delta > deepest) deepest = delta
      }
      expect(surface.length).toBeGreaterThan(6000)
      expect(moved / surface.length, 'repair should touch a neighbourhood, not the map').toBeLessThan(0.15)
      expect(deepest, 'no vertex should sink or rise more than a step of grading').toBeLessThan(0.6)
    } finally {
      report.world!.dispose()
    }
  }, 120000)

  it('steps the relief down only as far as the sim insists', async () => {
    // The most demanding corner of the contract: a full-height canyon ridge,
    // the tallest and steepest rim and the maximum channel load. It cannot
    // certify as described, so the ladder must override it — the promise is
    // that the override is *minimal*, not that the world gets flattened to
    // whatever the sim likes. Before the ladder stepped, this corner lost
    // almost half its relief; it must keep the bulk of it.
    const spec: WorldSpec = {
      ...BASIN,
      landform: 'canyon',
      ridge: { x: 5.5, height: 1.6 },
      channels: { count: 6, spacing: 4, depth: 0.2 },
      rim: { height: 2.2, steepness: 4 },
      waterlineOffset: -0.2,
      scenarioName: 'Overwhelming Canyon',
    }
    const report = await certifyGeneration(spec)
    expect(report.world).not.toBeNull()
    try {
      const surface = meshSurface(report.world!.scene)
      let askedHigh = -Infinity
      let madeHigh = -Infinity
      let deepest = 0
      for (const [x, y, z] of surface) {
        const asked = worldHeightAt(spec, x, z)
        if (asked > askedHigh) askedHigh = asked
        if (y > madeHigh) madeHigh = y
        deepest = Math.max(deepest, Math.abs(y - asked))
      }
      expect(madeHigh / askedHigh, 'the crest the user described should survive').toBeGreaterThan(0.7)
      expect(deepest, 'the override stays bounded').toBeLessThan(1.6)
      expect(report.certificate!.repairsApplied).toBeGreaterThan(0)
    } finally {
      report.world!.dispose()
    }
  }, 120000)

  it('refuses with measurements, not an exception, when no rung can certify', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const report = await certifyGeneration(UNCERTIFIABLE)
      expect(report.world).toBeNull()
      expect(await generateWorld(UNCERTIFIABLE)).toBeNull()
      expect(report.audit).not.toBeNull()
      expect(report.audit!.failures.length).toBeGreaterThan(0)
      expect(report.failure).toContain('stations grounded')
      expect(report.failure).toContain('routes cleared')
      const refusal = report.audit!.failures[0]
      expect([refusal.kind, Number.isFinite(refusal.x), Number.isFinite(refusal.z)])
        .toEqual([expect.stringMatching(/^(station|route)$/), true, true])
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('refusing to certify'))
    } finally {
      warn.mockRestore()
    }
  }, 120000)
})

describe('determinism and lifetime', () => {
  it('builds the same world from the same spec', async () => {
    const first = await generate(STEEP_CANYON)
    const second = await generate(STEEP_CANYON)
    try {
      expect(second.certificate.worldDigest).toBe(first.certificate.worldDigest)
      expect(second.certificate.repairsApplied).toBe(first.certificate.repairsApplied)
      expect(second.certificate.stationsGrounded).toBe(first.certificate.stationsGrounded)
      expect(second.course.scenario.nodes.map(node => node.position)).toEqual(first.course.scenario.nodes.map(node => node.position))
      expect(second.course.scenario.edges.map(edge => edge.travelTicks)).toEqual(first.course.scenario.edges.map(edge => edge.travelTicks))
      expect(second.course.config.id).toBe(first.course.config.id)
    } finally {
      first.dispose()
      second.dispose()
    }
  }, 120000)

  it('frees exactly what it built, twice if asked', async () => {
    const world = await generate(BASIN)
    const motion = world.createMotion()
    expect(motion.canStand(world.course.scenario.nodes[0].position)).toBe(true)
    world.dispose()
    expect(() => world.dispose()).not.toThrow()
    expect(() => motion.sample([4, 8, 0], 12)).not.toThrow()
    motion.dispose()
    expect(() => world.physics.sample([4, 8, 0], 12)).toThrow('disposed')
  })

  it('never starts work it has been told to abandon', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(certifyGeneration(BASIN, controller.signal)).rejects.toThrow()
    await expect(generateWorld(BASIN, controller.signal)).rejects.toThrow()
  })
})
