import type * as THREE from 'three'
import type { ArenaCourse } from './arenaCourse'
import type { ArenaPhysics } from './arenaPhysics'

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
 * playability certificate ladder (flatten a pad → retry at reduced relief →
 * return null so the loader falls back to the pinned authored course). The
 * function signature is part of the contract so Track G's loader can be built
 * and tested before the implementation lands.
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

/**
 * Track F entry point called by `loadGeneratedCourse` (services/arenaCourse.ts).
 * Builds the scene for `spec`, extracts the collider through the existing
 * surface/physics/course machinery, certifies the result, and runs the repair
 * ladder. Returns null only when every rung failed — the loader then falls
 * back to the pinned authored course with an honest report.
 *
 * STUB: throws until Dev 1's Track F implementation lands. Kept inside the
 * contract so Track G compiles and its fallback path is testable today.
 */
export async function generateWorld(spec: WorldSpec, signal?: AbortSignal): Promise<GeneratedWorld | null> {
  void spec
  void signal
  throw new Error('arenaWorldgen.generateWorld: Track F implementation has not landed yet')
}
