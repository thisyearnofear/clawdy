import * as THREE from 'three'
import {
  RUSH_CORE_STATION,
  TEMPLATE_CONNECTIONS,
  TEMPLATE_STATIONS,
  buildArenaCourse,
  buildRushCourse,
  groundPoint,
  type ArenaCourse,
} from './arenaCourse'
import { ArenaPhysics, initializeArenaPhysics } from './arenaPhysics'
import { disposeArenaTerrain } from './arenaTerrain'
import { createWorldSurface } from './worldSurface'

/**
 * Prompt-to-world generation — the AI Builder Hackathon Track F/G shared seam.
 *
 * ── FROZEN CONTRACT (docs/AI_BUILDER_HACKATHON.md §Shared contract) ──────────
 * The `WorldSpec` interface below is the only symbol tracks F, G and H share.
 * It was frozen in the plan before work started: the LLM emits *parameters
 * only* — never coordinates, vertices, edges or geometry — and the resolver
 * owns every number that reaches the mesh. Do not edit this section without a
 * plan amendment; all three devs compile against it verbatim.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── TRACK F IMPLEMENTATION (Dev 1) ───────────────────────────────────────────
 * Everything below `generateWorld` is Dev 1's deliverable: the TS port of the
 * heightfield (ground_height / is_road / skirt walls), the displaced
 * `THREE.BufferGeometry` (grid ≤ 200×200, flat-shaded low-poly), and the
 * playability certificate ladder (as described → grade the refused points →
 * step the relief down until it certifies → return null so the loader falls
 * back to the pinned authored course). The function signature is part of the
 * contract so Track G's loader can be built and tested before the
 * implementation lands.
 */

export interface WorldSpec {
  landform: 'basin' | 'canyon' | 'plateau' | 'dune-field' | 'salt-flat'
  /** Ridge: corridor x-position and relief it rises to. */
  ridge: { x: number; height: number } // x 5.5–8.5, height 0.2–1.6
  /** Drainage channels carved off the valley route. */
  channels: { count: number; spacing: number; depth: number } // 0–6, 1.5–4, 0.02–0.2
  rim: { height: number; steepness: number } // 0–2.2, 1–4
  waterlineOffset: number // -0.2 – +0.35 over the authored baseline
  palette: 'sandstone' | 'basalt' | 'slate' | 'oxide' | 'gypsum'
  rockDensity: number // 0–1, drives ArenaProps scatter
  scenarioName: string // sanitized, ≤40 chars
}

export const WORLD_LANDFORMS = ['basin', 'canyon', 'plateau', 'dune-field', 'salt-flat'] as const
export const WORLD_PALETTES = ['sandstone', 'basalt', 'slate', 'oxide', 'gypsum'] as const

/**
 * The machine-checked playability proof emitted per generated world. This is
 * the receipt the UI renders ("19/19 stations grounded · 18/18 routes
 * cleared") — never claim the world is playable without one attached.
 */
export interface WorldgenCertificate {
  stationsGrounded: number
  stationsTotal: number
  routesCleared: number
  routesTotal: number
  /** Scene repairs the failure ladder applied (e.g. flattened pads). */
  repairsApplied: number
  /** SHA-256 over `canonicalWorldSpecJson(spec)` — same digest the worldId uses. */
  worldDigest: string
  msElapsed: number
}

/**
 * Canonical JSON for the digest: fixed key order, no whitespace, so the same
 * spec always hashes to the same worldId on any platform. Digest = SHA-256 of
 * this string → worldId is 'generated-' + digest.slice(0, 8).
 */
export function canonicalWorldSpecJson(spec: WorldSpec): string {
  return JSON.stringify({
    landform: spec.landform,
    ridge: { x: spec.ridge.x, height: spec.ridge.height },
    channels: { count: spec.channels.count, spacing: spec.channels.spacing, depth: spec.channels.depth },
    rim: { height: spec.rim.height, steepness: spec.rim.steepness },
    waterlineOffset: spec.waterlineOffset,
    palette: spec.palette,
    rockDensity: spec.rockDensity,
    scenarioName: spec.scenarioName,
  })
}

export async function worldSpecDigest(spec: WorldSpec): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalWorldSpecJson(spec)))
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

/** 'generated-' + first 8 hex chars of the spec digest — the world's stable id. */
export function generatedWorldId(digest: string): string {
  return `generated-${digest.slice(0, 8)}`
}

/**
 * What a successful generation hands to `loadGeneratedCourse`. The bundle
 * deliberately mirrors `loadArenaCourse`'s shape (plus the renderable scene
 * and the certificate) so the live scene, session and workbench treat it as a
 * drop-in course. The scenario must be stamped `split: 'practice'` — a
 * generated world is an opt-in practice surface and can never become a scored
 * match. `dispose` frees the physics world, the scene's geometry/materials and
 * any internal resources; it must be safe to call twice.
 *
 * One `scene` feeds both collider extraction (`createWorldSurface` bakes
 * `matrixWorld` into the collider) and the renderer, so mesh vertices must be
 * world-space with identity transforms. Name the terrain mesh `Terrain*` and
 * give it UVs if you want the palette-tinted detail texture applied; rock
 * meshes named `Rock*` cast shadows.
 */
export interface GeneratedWorld {
  scene: THREE.Group
  course: ArenaCourse
  rushCourse: ArenaCourse
  physics: ArenaPhysics
  createMotion: () => ArenaPhysics
  certificate: WorldgenCertificate
  dispose: () => void
}

export async function generateWorld(spec: WorldSpec, signal?: AbortSignal): Promise<GeneratedWorld | null> {
  return (await certifyGeneration(spec, signal)).world
}

type GenerationReport = {
  world: GeneratedWorld | null
  certificate: WorldgenCertificate | null
  failure: string | null
  /** The last rung's full census — what a receipt quotes when refusing. */
  audit: WorldAudit | null
}

/**
 * `generateWorld` plus the audit that justified its verdict, so a caller (or a
 * test) can see *why* a world was refused instead of only that it was. The
 * ladder's last rung is what makes an uncertifiable spec honest: `null` means
 * the loader must fall back to the authored course, never ship a broken arena.
 */
export async function certifyGeneration(spec: WorldSpec, signal?: AbortSignal): Promise<GenerationReport> {
  const started = Date.now()
  signal?.throwIfAborted()
  await initializeArenaPhysics()
  signal?.throwIfAborted()
  const digest = await worldSpecDigest(spec)
  const base = reliefPlanFor(spec)

  let repairPoints: PadPoint[] = []
  let lastAudit: WorldAudit | null = null

  for (const rung of CERTIFICATE_LADDER) {
    signal?.throwIfAborted()
    const plan = rung.relief === 1 ? base : retreatPlan(base, rung.relief)
    const attempt = buildAttempt(spec, plan, rung.grade ? repairPoints : [], signal)
    lastAudit = attempt.audit
    if (attempt.passes) {
      const certificate: WorldgenCertificate = {
        stationsGrounded: attempt.audit.stationsGrounded,
        stationsTotal: attempt.audit.stationsTotal,
        routesCleared: attempt.audit.routesCleared,
        routesTotal: attempt.audit.routesTotal,
        repairsApplied: attempt.padsApplied,
        worldDigest: digest,
        msElapsed: Date.now() - started,
      }
      try {
        const world = assembleWorld({ spec, digest, certificate, physics: attempt.physics, collider: attempt.collider, scene: attempt.scene })
        return { world, certificate, failure: null, audit: attempt.audit }
      } catch (error) {
        attempt.dispose()
        throw error
      }
    }
    // Repair targets for the next rung: every point the sim refused to
    // certify, whether a station it cannot carry or a route it cannot cross.
    repairPoints = attempt.audit.failures.map(failure => ({ x: failure.x, z: failure.z }))
    attempt.dispose()
  }

  const detail = describeAudit(lastAudit)
  console.warn(`[arenaWorldgen] refusing to certify '${spec.scenarioName}' (${digest.slice(0, 8)}): ${detail}`)
  return {
    world: null,
    certificate: null,
    failure: `generated terrain could not be certified: ${detail}`,
    audit: lastAudit,
  }
}

/** The heightfield footprint — grid lines every `WORLDGEN_STEP` metres. */
export const WORLDGEN_BOUNDS = Object.freeze({ minX: -3, maxX: 17, minZ: -6, maxZ: 22 })
/** Vertex spacing of the generated mesh; matches the authored baker. */
export const WORLDGEN_STEP = 0.25
const MAX_GRID_LINES = 200

/**
 * Every number the mesh is built from, resolved from a `WorldSpec`. The spec
 * says what the user asked for; the plan says what the terrain actually does,
 * so landform character is applied here and nowhere downstream.
 */
export interface ReliefPlan {
  baseY: number
  ridgeX: number
  ridgeHeight: number
  band: number
  channelX: number
  channelXSigma: number
  channelZSigma: number
  channelDepth: number
  channelCenters: readonly number[]
  rimHeight: number
  rimSteepness: number
  dune: number
  duneWavelength: number
  terrace: number
  waterlineOffset: number
}

/**
 * Landform character as multipliers on the spec's own amplitudes, never as
 * new degrees of freedom: a canyon takes the ridge and rim the user asked for
 * and pushes them further, a salt-flat flattens them. Values are chosen so the
 * tallest rim reachable by any contract-conforming spec stays under ~3.4 m and
 * still sits outside the play rectangle.
 */
interface LandformStyle {
  ridge: number
  rim: number
  channels: number
  dune: number
  duneWavelength: number
  terrace: number
}

const LANDFORM_STYLES: Record<WorldSpec['landform'], LandformStyle> = {
  basin: { ridge: 1.0, rim: 1.0, channels: 1.0, dune: 0, duneWavelength: 0, terrace: 0 },
  canyon: { ridge: 1.5, rim: 1.55, channels: 1.7, dune: 0, duneWavelength: 0, terrace: 0 },
  plateau: { ridge: 0.6, rim: 1.8, channels: 0.35, dune: 0.02, duneWavelength: 26, terrace: 0.5 },
  'dune-field': { ridge: 0.45, rim: 0.7, channels: 0.2, dune: 0.17, duneWavelength: 9, terrace: 0 },
  'salt-flat': { ridge: 0.22, rim: 0.9, channels: 0.3, dune: 0.04, duneWavelength: 16, terrace: 0 },
}

/**
 * The shape grammar. Station and route positions are fixed (they come from
 * `TEMPLATE_STATIONS`), so a generated world is always a course the existing
 * policies, trainers and matches can drive — only the ground under it moves.
 */
const TEMPLATE = Object.freeze({
  baseY: 0.12,
  /** Authored ridge spans x 5.2–9.2, i.e. `ridge.x` ± this band. */
  ridgeBand: 2.0,
  /** Channels drain along the valley corridor, whatever the ridge does. */
  channelX: 4.0,
  channelFirstZ: 2.0,
  /** Play rectangle: the rim rises outside it, so routes never cross a wall. */
  playMinX: 2.5,
  playMaxX: 11.5,
  playMinZ: -1.5,
  playMaxZ: 17.5,
  rimBias: 0.85,
  rimWave: 0.15,
  rimWaveX: 0.7,
  rimWaveZ: 0.9,
  skirtBottom: -1.2,
  /** How far above the floor the waterline offset stops biting. */
  waterWindow: 0.6,
  // Road grammar, ported from `is_road`: two corridors plus cross-bars.
  roadCorridorX: Object.freeze([4.0, 10.0]),
  roadCorridorHalf: 0.7,
  roadCorridorMinZ: -0.5,
  roadCorridorMaxZ: 16.5,
  roadCrossMinX: 3.5,
  roadCrossMaxX: 10.5,
  roadCrossHalf: 0.55,
  roadCrossEvery: 2.0,
  roadCrossCount: 9,
  // Certificate ladder.
  padRadius: 1.5,
  padInnerRadius: 0.2,
  padWeight: 0.5,
  padIterations: 22,
  maxRepairPoints: 24,
  reliefRetreat: 0.55,
  terracePull: 0.3,
  variantEvery: 7,
})

/**
 * The certificate ladder, least override first: the world exactly as
 * described, then the same relief with its refused points graded, then the
 * relief stepped down one notch at a time — each step keeps as much of what the
 * user asked for as the sim will certify — and only when every rung is refused
 * does the loader fall back to the authored basin.
 */
const CERTIFICATE_LADDER = Object.freeze([
  { relief: 1, grade: false },
  { relief: 1, grade: true },
  { relief: 0.78, grade: true },
  { relief: 0.55, grade: true },
  { relief: 0.34, grade: true },
])

/**
 * The authored basin's relief, expressed in the same plan shape a spec
 * resolves to: a verbatim port of `ground_height` in
 * `scripts/build-arena-terrain.py`, and what the port-fidelity test compares
 * `planHeight` against. The contract's own ranges cannot express it exactly
 * (`channels.spacing` tops out below the authored 4.17 m gap), which is the
 * point — a generated world is new terrain, never a copy of the scored basin.
 */
export const AUTHORED_RELIEF_PLAN: ReliefPlan = Object.freeze({
  baseY: TEMPLATE.baseY,
  ridgeX: 7.2,
  ridgeHeight: 0.9,
  band: TEMPLATE.ridgeBand,
  channelX: TEMPLATE.channelX,
  channelXSigma: 0.8,
  channelZSigma: 1.25,
  channelDepth: 0.08,
  channelCenters: Object.freeze([2.0, 6.0, 10.5, 14.5]),
  rimHeight: 1.4,
  rimSteepness: 3.0,
  dune: 0,
  duneWavelength: 0,
  terrace: 0,
  waterlineOffset: 0,
})

function smoothstep(a: number, b: number, value: number): number {
  const t = b === a ? (value < b ? 0 : 1) : Math.min(1, Math.max(0, (value - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Same relief shape, less of it — what a retreat rung hands the mesh builder. */
export function retreatPlan(plan: ReliefPlan, factor: number = TEMPLATE.reliefRetreat): ReliefPlan {
  return {
    ...plan,
    ridgeHeight: plan.ridgeHeight * factor,
    channelDepth: plan.channelDepth * factor,
    rimHeight: plan.rimHeight * factor,
    dune: plan.dune * factor,
  }
}

export function reliefPlanFor(spec: WorldSpec): ReliefPlan {
  const style = LANDFORM_STYLES[spec.landform]
  const channelCenters = Array.from(
    { length: spec.channels.count },
    (_, index) => TEMPLATE.channelFirstZ + index * spec.channels.spacing,
  )
  return {
    baseY: TEMPLATE.baseY,
    ridgeX: spec.ridge.x,
    ridgeHeight: spec.ridge.height * style.ridge,
    band: TEMPLATE.ridgeBand,
    channelX: TEMPLATE.channelX,
    channelXSigma: 0.8,
    channelZSigma: 1.25,
    channelDepth: spec.channels.depth * style.channels,
    channelCenters,
    rimHeight: spec.rim.height * style.rim,
    rimSteepness: spec.rim.steepness,
    dune: style.dune,
    duneWavelength: style.duneWavelength,
    terrace: style.terrace,
    waterlineOffset: spec.waterlineOffset,
  }
}

/**
 * The pure heightfield: `ground_height` from the shipped Blender baker, with
 * every amplitude taken from the plan instead of hard-coded. No pads and no
 * mesh knowledge — the same function answers a height query and builds a
 * triangle soup, which is what makes the port testable at all.
 */
export function planHeight(plan: ReliefPlan, x: number, z: number): number {
  let h = plan.baseY
  h += plan.ridgeHeight * smoothstep(plan.ridgeX - plan.band, plan.ridgeX + plan.band, x)
  for (const center of plan.channelCenters) {
    h -= plan.channelDepth * Math.exp(
      -(((x - plan.channelX) / plan.channelXSigma) ** 4) - (((z - center) / plan.channelZSigma) ** 4),
    )
  }
  const outside = Math.max(
    TEMPLATE.playMinX - x,
    x - TEMPLATE.playMaxX,
    TEMPLATE.playMinZ - z,
    z - TEMPLATE.playMaxZ,
    0,
  )
  h += plan.rimHeight * smoothstep(0, plan.rimSteepness, outside) *
    (TEMPLATE.rimBias + TEMPLATE.rimWave * Math.sin(TEMPLATE.rimWaveX * x + TEMPLATE.rimWaveZ * z))
  if (plan.dune > 0 && plan.duneWavelength > 0) {
    const k = (Math.PI * 2) / plan.duneWavelength
    h += plan.dune * Math.sin(k * x) * Math.cos(k * z)
  }
  // The waterline lifts or drops the low ground only, so a positive offset
  // floods the channels flat and a negative one leaves them cut deeper.
  const dry = h
  h += plan.waterlineOffset * (1 - smoothstep(plan.baseY, plan.baseY + TEMPLATE.waterWindow, dry))
  if (plan.terrace > 0) {
    h += (Math.round(h / plan.terrace) * plan.terrace - h) * TEMPLATE.terracePull
  }
  return h
}

/** Height at a point for a spec — the readout a receipt or overlay can quote. */
export function worldHeightAt(spec: WorldSpec, x: number, z: number): number {
  return planHeight(reliefPlanFor(spec), x, z)
}

/** Port of `is_road`: graded corridors and cross-bars, where the eye reads a route. */
export function isRoadAt(x: number, z: number): boolean {
  if (x >= TEMPLATE.roadCrossMinX && x <= TEMPLATE.roadCrossMaxX) {
    for (let index = 0; index < TEMPLATE.roadCrossCount; index++) {
      if (Math.abs(z - index * TEMPLATE.roadCrossEvery) < TEMPLATE.roadCrossHalf) return true
    }
  }
  if (z < TEMPLATE.roadCorridorMinZ || z > TEMPLATE.roadCorridorMaxZ) return false
  return TEMPLATE.roadCorridorX.some(corridorX => Math.abs(x - corridorX) < TEMPLATE.roadCorridorHalf)
}

type HeightGrid = { nx: number; nz: number; xs: Float64Array; zs: Float64Array; heights: Float64Array }

function gridVertex(index: number, nx: number): [number, number] {
  return [index % nx, Math.floor(index / nx)]
}

function buildGrid(plan: ReliefPlan): HeightGrid {
  const nx = (WORLDGEN_BOUNDS.maxX - WORLDGEN_BOUNDS.minX) / WORLDGEN_STEP + 1
  const nz = (WORLDGEN_BOUNDS.maxZ - WORLDGEN_BOUNDS.minZ) / WORLDGEN_STEP + 1
  if (!Number.isInteger(nx) || !Number.isInteger(nz) || nx > MAX_GRID_LINES || nz > MAX_GRID_LINES) {
    throw new Error('Worldgen grid exceeds the mesh budget')
  }
  const xs = Float64Array.from({ length: nx }, (_, index) => WORLDGEN_BOUNDS.minX + index * WORLDGEN_STEP)
  const zs = Float64Array.from({ length: nz }, (_, index) => WORLDGEN_BOUNDS.minZ + index * WORLDGEN_STEP)
  const heights = new Float64Array(nx * nz)
  for (let row = 0; row < nz; row++) {
    for (let column = 0; column < nx; column++) {
      heights[row * nx + column] = planHeight(plan, xs[column], zs[row])
    }
  }
  return { nx, nz, xs, zs, heights }
}

type PadPoint = { x: number; z: number }

/**
 * Repair weight per vertex: 1 at a refused point, easing to 0 across the pad's
 * outer apron. Distance-based, so the pad shape never depends on which
 * station failed or in what order.
 */
function padWeights(grid: HeightGrid, pads: readonly PadPoint[]): Float64Array | null {
  const { nx, nz, xs, zs } = grid
  const weights = new Float64Array(nx * nz)
  let any = false
  const outer = TEMPLATE.padRadius
  const inner = outer * TEMPLATE.padInnerRadius
  for (const pad of pads.slice(0, TEMPLATE.maxRepairPoints)) {
    const iMin = nearestColumn(xs, pad.x - outer)
    const iMax = nearestColumn(xs, pad.x + outer)
    const jMin = nearestColumn(zs, pad.z - outer)
    const jMax = nearestColumn(zs, pad.z + outer)
    for (let row = jMin; row <= jMax; row++) {
      for (let column = iMin; column <= iMax; column++) {
        const distance = Math.hypot(xs[column] - pad.x, zs[row] - pad.z)
        const weight = 1 - smoothstep(inner, outer, distance)
        const index = row * nx + column
        if (weight > weights[index]) {
          weights[index] = weight
          any = true
        }
      }
    }
  }
  return any ? weights : null
}

function nearestColumn(axis: Float64Array, value: number): number {
  const raw = (value - axis[0]) / WORLDGEN_STEP
  return Math.max(0, Math.min(axis.length - 1, Math.round(raw)))
}

/**
 * Flatten where the sim refused to stand or cross: a weighted Laplacian
 * relaxation over the grid, in a fixed scan order so the same spec always
 * repairs into the same mesh. Smoothing cannot invent a cliff, which is what
 * makes it safe to retry instead of clamping heights by hand.
 */
function relaxGrid(grid: HeightGrid, weights: Float64Array): void {
  const { nx, nz, heights } = grid
  for (let iteration = 0; iteration < TEMPLATE.padIterations; iteration++) {
    for (let row = 0; row < nz; row++) {
      for (let column = 0; column < nx; column++) {
        const index = row * nx + column
        const weight = weights[index]
        if (weight <= 0) continue
        const west = column > 0 ? index - 1 : index
        const east = column < nx - 1 ? index + 1 : index
        const north = row > 0 ? index - nx : index
        const south = row < nz - 1 ? index + nx : index
        const average = (heights[west] + heights[east] + heights[north] + heights[south]) / 4
        heights[index] += (average - heights[index]) * weight * TEMPLATE.padWeight
      }
    }
  }
}

type Rgb = [number, number, number]

/** Terrain ramps per palette; the sky/fog side of a palette lives in `arenaWorldIntent`. */
const WORLD_TERRAIN_COLORS: Record<WorldSpec['palette'], { floor: string; slope: string; crest: string; road: string; rock: string }> = {
  sandstone: { floor: '#a9835b', slope: '#c8a176', crest: '#e2d0ad', road: '#8d7250', rock: '#6f5a41' },
  basalt: { floor: '#3c434f', slope: '#5a6372', crest: '#8d98a7', road: '#4a515a', rock: '#262b33' },
  slate: { floor: '#59646f', slope: '#7d8996', crest: '#b0bbc7', road: '#6a7481', rock: '#3d4650' },
  oxide: { floor: '#8a4a2c', slope: '#b96b3c', crest: '#e2a76b', road: '#96552f', rock: '#5e331d' },
  gypsum: { floor: '#b6a68e', slope: '#d8cbb6', crest: '#f3ede2', road: '#c0b098', rock: '#8f8271' },
}

function hexRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function mixRgb(from: Rgb, to: Rgb, t: number): Rgb {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]
}

function terrainColor(palette: WorldSpec['palette'], height: number, floor: number, crest: number, x: number, z: number, variant: boolean, slope: number): Rgb {
  const ramp = WORLD_TERRAIN_COLORS[palette]
  const t = Math.min(1, Math.max(0, (height - floor) / Math.max(1e-6, crest - floor)))
  const split = 0.45
  const base = t < split
    ? mixRgb(hexRgb(ramp.floor), hexRgb(ramp.slope), t / split)
    : mixRgb(hexRgb(ramp.slope), hexRgb(ramp.crest), (t - split) / (1 - split))
  // Steep ground is exposed rock, not the same paint as a gentle hill at the
  // same height — without this a canyon reads as smooth clay. Drivable ground
  // stays under ~1.0 gradient (the certificate's slope gate), so the blend
  // lands on walls and crests the rover never stands on.
  const rockT = Math.min(1, Math.max(0, (slope - 0.5) / 0.6)) * 0.8
  const rocky = rockT > 0 ? mixRgb(base, hexRgb(ramp.rock), rockT) : base
  const tinted = isRoadAt(x, z) ? mixRgb(rocky, hexRgb(ramp.road), 0.75) : rocky
  return variant ? tinted.map(value => value * 0.92) as Rgb : tinted
}

/**
 * Displaced grid plus the closed skirt that makes it a solid collider: the
 * authored baker's wall-and-cap construction, so a rover driven off the mesh
 * edge meets a wall instead of an open edge a trimesh ray can escape through.
 */
function buildWorldGeometry(palette: WorldSpec['palette'], grid: HeightGrid): THREE.BufferGeometry {
  const { nx, nz, xs, zs, heights } = grid
  const surfaceCount = nx * nz
  let floor = Infinity
  let crest = -Infinity
  for (const height of heights) {
    if (height < floor) floor = height
    if (height > crest) crest = height
  }
  // The skirt adds one vertex per boundary vertex plus a cap centre, so the
  // arrays are sized for the closed shell up front and filled in one pass.
  const ringCount = 2 * (nx + nz) - 4
  const bottomStart = surfaceCount
  const centerIndex = bottomStart + ringCount
  const positions = new Float32Array((centerIndex + 1) * 3)
  const colors = new Float32Array((centerIndex + 1) * 3)
  const uvs = new Float32Array((centerIndex + 1) * 2)
  const spanX = WORLDGEN_BOUNDS.maxX - WORLDGEN_BOUNDS.minX
  const spanZ = WORLDGEN_BOUNDS.maxZ - WORLDGEN_BOUNDS.minZ
  for (let row = 0; row < nz; row++) {
    for (let column = 0; column < nx; column++) {
      const index = row * nx + column
      const height = heights[index]
      positions[index * 3] = xs[column]
      positions[index * 3 + 1] = height
      positions[index * 3 + 2] = zs[row]
      uvs[index * 2] = (xs[column] - WORLDGEN_BOUNDS.minX) / spanX
      uvs[index * 2 + 1] = (zs[row] - WORLDGEN_BOUNDS.minZ) / spanZ
      const variant = (column + row) % TEMPLATE.variantEvery === 0
      const west = heights[row * nx + Math.max(0, column - 1)]
      const east = heights[row * nx + Math.min(nx - 1, column + 1)]
      const north = heights[Math.max(0, row - 1) * nx + column]
      const south = heights[Math.min(nz - 1, row + 1) * nx + column]
      const dx = xs[Math.min(nx - 1, column + 1)] - xs[Math.max(0, column - 1)]
      const dz = zs[Math.min(nz - 1, row + 1)] - zs[Math.max(0, row - 1)]
      const slope = Math.hypot((east - west) / dx, (south - north) / dz)
      const color = terrainColor(palette, height, floor, crest, xs[column], zs[row], variant, slope)
      colors[index * 3] = color[0]
      colors[index * 3 + 1] = color[1]
      colors[index * 3 + 2] = color[2]
    }
  }

  // Boundary ring, walked counter-clockwise seen from above: the same vertex
  // order the authored skirt uses, so walls and cap wind consistently.
  const ring: number[] = []
  for (let column = 0; column < nx; column++) ring.push(column)
  for (let row = 1; row < nz; row++) ring.push((nx - 1) + row * nx)
  for (let column = nx - 2; column >= 0; column--) ring.push(column + (nz - 1) * nx)
  for (let row = nz - 2; row >= 1; row--) ring.push(row * nx)

  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6 + ring.length * 9)
  let cursor = 0
  for (let row = 0; row < nz - 1; row++) {
    for (let column = 0; column < nx - 1; column++) {
      const west = row * nx + column
      const north = (row + 1) * nx + column
      const east = west + 1
      const corner = north + 1
      indices[cursor++] = west
      indices[cursor++] = north
      indices[cursor++] = east
      indices[cursor++] = east
      indices[cursor++] = north
      indices[cursor++] = corner
    }
  }

  const floorRgb = hexRgb(WORLD_TERRAIN_COLORS[palette].floor)
  ring.forEach((vertex, offset) => {
    const [column, row] = gridVertex(vertex, nx)
    const target = bottomStart + offset
    positions[target * 3] = xs[column]
    positions[target * 3 + 1] = TEMPLATE.skirtBottom
    positions[target * 3 + 2] = zs[row]
    colors.set(floorRgb, target * 3)
    uvs[target * 2] = (xs[column] - WORLDGEN_BOUNDS.minX) / spanX
    uvs[target * 2 + 1] = (zs[row] - WORLDGEN_BOUNDS.minZ) / spanZ
  })
  positions[centerIndex * 3] = (WORLDGEN_BOUNDS.minX + WORLDGEN_BOUNDS.maxX) / 2
  positions[centerIndex * 3 + 1] = TEMPLATE.skirtBottom
  positions[centerIndex * 3 + 2] = (WORLDGEN_BOUNDS.minZ + WORLDGEN_BOUNDS.maxZ) / 2
  colors.set(floorRgb, centerIndex * 3)

  for (let offset = 0; offset < ring.length; offset++) {
    const next = (offset + 1) % ring.length
    const topA = ring[offset]
    const topB = ring[next]
    const botA = bottomStart + offset
    const botB = bottomStart + next
    indices[cursor++] = topA
    indices[cursor++] = botB
    indices[cursor++] = botA
    indices[cursor++] = topA
    indices[cursor++] = topB
    indices[cursor++] = botB
  }
  for (let offset = 0; offset < ring.length; offset++) {
    const next = (offset + 1) % ring.length
    indices[cursor++] = centerIndex
    indices[cursor++] = bottomStart + offset
    indices[cursor++] = bottomStart + next
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(indices.slice(0, cursor), 1))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * The renderable + collider bundle for one attempt: one mesh feeds both
 * `createWorldSurface` (which bakes `matrixWorld`, so vertices stay
 * world-space with an identity transform) and the renderer.
 */
function buildWorldScene(palette: WorldSpec['palette'], grid: HeightGrid): THREE.Group {
  const geometry = buildWorldGeometry(palette, grid)
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    // Smooth normals + the detail/bump maps applied in prepareTerrainScene read
    // as eroded ground; flat shading made every generated world look faceted.
    flatShading: false,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'Terrain'
  const scene = new THREE.Group()
  scene.name = `GeneratedWorld-${palette}`
  scene.add(mesh)
  return scene
}

type WorldFailure = { kind: 'station' | 'route'; x: number; z: number; reason: string }
/** The `floodZones` stations `buildArenaCourse` grounds at x = 4. */
const FLOOD_PROBE_Z = [2, 6, 13]
export type WorldAudit = {
  stationsGrounded: number
  stationsTotal: number
  routesCleared: number
  routesTotal: number
  failures: WorldFailure[]
}

/**
 * Everything the sim must accept before a world counts as playable: each
 * station and flood probe must carry a chassis, and each route must be walkable
 * end to end. These are the same gates `buildArenaCourse` applies — it throws
 * on the first one — run here as a census so the certificate can report the
 * whole picture and hand the ladder its repair targets.
 */
function auditWorld(physics: ArenaPhysics): WorldAudit {
  const failures: WorldFailure[] = []
  const stations = [...TEMPLATE_STATIONS, RUSH_CORE_STATION]
  const floodProbes = FLOOD_PROBE_Z.map(z => ({ id: `flood-${z}`, x: TEMPLATE.channelX, z }))
  let stationsGrounded = 0
  const stationsTotal = stations.length + floodProbes.length
  for (const station of [...stations, ...floodProbes]) {
    try {
      const point = groundPoint(physics, station.x, station.z)
      if (!physics.canStand(point)) {
        failures.push({ kind: 'station', x: station.x, z: station.z, reason: `${station.id} has no rover clearance` })
        continue
      }
      stationsGrounded += 1
    } catch (error) {
      failures.push({ kind: 'station', x: station.x, z: station.z, reason: `${station.id}: ${reasonOf(error)}` })
    }
  }

  const stationById = new Map<string, { x: number; z: number }>(stations.map(station => [station.id, station]))
  const routes = [
    ...TEMPLATE_CONNECTIONS.map(route => ({ id: route.id, from: route.from, to: route.to })),
    { id: 'rush-cs-core', from: 'cross-s', to: RUSH_CORE_STATION.id },
    { id: 'rush-s2-core', from: 'cross-s2', to: RUSH_CORE_STATION.id },
  ]
  let routesCleared = 0
  for (const route of routes) {
    const from = stationById.get(route.from)!
    const to = stationById.get(route.to)!
    const blocked = firstRefusedPoint(physics, from, to)
    if (blocked) failures.push({ kind: 'route', x: blocked[0], z: blocked[1], reason: `${route.id} is not walkable` })
    else routesCleared += 1
  }
  return { stationsGrounded, stationsTotal, routesCleared, routesTotal: routes.length, failures }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : 'surface query failed'
}

/**
 * Walk a route at the course's own 0.2 m sampling and report the first point
 * the surface refuses, or null when the whole line is walkable. Rapier-backed,
 * because `worldSurface.checkRouteGrounding` would ray the full triangle soup
 * per sample — ~60M triangle tests for this audit, versus ~1.6k BVH walks here.
 */
function firstRefusedPoint(physics: ArenaPhysics, from: { x: number; z: number }, to: { x: number; z: number }): [number, number] | null {
  const divisions = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.2))
  for (let step = 0; step <= divisions; step++) {
    const t = step / divisions
    const x = from.x + (to.x - from.x) * t
    const z = from.z + (to.z - from.z) * t
    try {
      groundPoint(physics, x, z)
    } catch {
      return [x, z]
    }
  }
  return null
}

function describeAudit(audit: WorldAudit | null): string {
  if (!audit) return 'no attempt was made'
  return `${audit.stationsGrounded}/${audit.stationsTotal} stations grounded, ` +
    `${audit.routesCleared}/${audit.routesTotal} routes cleared` +
    (audit.failures[0] ? ` (first refusal: ${audit.failures[0].reason})` : '')
}

type Attempt = {
  scene: THREE.Group
  collider: { vertices: Float32Array; indices: Uint32Array }
  physics: ArenaPhysics
  audit: WorldAudit
  passes: boolean
  /** Repair points that actually moved the mesh on this rung. */
  padsApplied: number
  /** Frees this attempt's GPU and physics resources; the caller keeps them on the winning rung. */
  dispose: () => void
}

/**
 * One rung of the ladder: mesh → collider → physics → audit. A failed attempt
 * owns everything it built and frees it in `dispose`; a passing one transfers
 * ownership to the world, which is why `dispose` is unconditional here and the
 * caller only reaches for it on the throw path.
 */
function buildAttempt(spec: WorldSpec, plan: ReliefPlan, pads: readonly PadPoint[], signal?: AbortSignal): Attempt {
  signal?.throwIfAborted()
  const grid = buildGrid(plan)
  const weights = pads.length ? padWeights(grid, pads) : null
  if (weights) relaxGrid(grid, weights)
  const padsApplied = weights ? Math.min(pads.length, TEMPLATE.maxRepairPoints) : 0
  const scene = buildWorldScene(spec.palette, grid)
  const surface = createWorldSurface(scene)
  let physics: ArenaPhysics | undefined
  try {
    const collider = surface.colliderData()
    physics = new ArenaPhysics(collider)
    const audit = auditWorld(physics)
    const passes = audit.stationsGrounded === audit.stationsTotal && audit.routesCleared === audit.routesTotal
    const owned = physics
    return {
      scene,
      collider,
      physics: owned,
      audit,
      passes,
      padsApplied,
      dispose: () => {
        owned.dispose()
        disposeArenaTerrain(scene)
      },
    }
  } catch (error) {
    physics?.dispose()
    disposeArenaTerrain(scene)
    throw error
  } finally {
    surface.dispose()
  }
}

function assembleWorld(input: {
  spec: WorldSpec
  digest: string
  certificate: WorldgenCertificate
  physics: ArenaPhysics
  collider: { vertices: Float32Array; indices: Uint32Array }
  scene: THREE.Group
}): GeneratedWorld {
  const { spec, digest, certificate, physics, collider, scene } = input
  const worldId = generatedWorldId(digest)
  const course = tagCourse(buildArenaCourse(physics), spec, digest, worldId, certificate, `${worldId}-practice`)
  const rushCourse = tagCourse(buildRushCourse(physics), spec, digest, worldId, certificate, `${worldId}-rush`)
  let disposed = false
  return {
    scene,
    course,
    rushCourse,
    physics,
    createMotion: () => new ArenaPhysics(collider),
    certificate,
    dispose: () => {
      if (disposed) return
      disposed = true
      physics.dispose()
      disposeArenaTerrain(scene)
    },
  }
}

/**
 * A generated world is practice-only, and its provenance is the spec digest.
 * Repairs are a pure function of that digest — same spec, same refusals, same
 * pads — except for sub-ulp transcendental differences between platforms,
 * which is exactly why the certificate is recomputed on every load instead of
 * trusted from the id. Mirrors `loadGeneratedCourse`'s stamping so a direct
 * caller and the loader hand out the same course.
 */
function tagCourse(
  course: ArenaCourse,
  spec: WorldSpec,
  digest: string,
  worldId: string,
  certificate: WorldgenCertificate,
  scenarioId: string,
): ArenaCourse {
  const seed = (Number.parseInt(digest.slice(8, 16), 16) >>> 0) || 1
  return {
    ...course,
    config: {
      id: worldId,
      name: spec.scenarioName,
      terrain: { url: `generated:${worldId}`, sha256: digest },
    },
    generated: { worldId, spec, certificate },
    scenario: {
      ...course.scenario,
      id: scenarioId,
      worldVersion: worldId,
      split: 'practice',
      seed,
    },
  }
}
