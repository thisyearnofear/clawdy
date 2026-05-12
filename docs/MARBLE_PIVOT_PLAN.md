# Clawdy Marble Pivot Plan

## Objective

Pivot `Clawdy` into a World Labs Marble / Spark submission by turning the existing live 3D arena into a playable Marble-generated world, while preserving the strongest current differentiators:

- autonomous AI rivals
- vehicle physics
- weather-as-gameplay
- visible agent decisions
- onchain economy hooks where they support the demo

The target submission is not "a pretty splat viewer." It is a browser-playable agent game inside a generated, spatially consistent 3D world.

## Core Principles

These principles are binding for this pivot.

### Enhancement First

Prefer enhancing the existing `CloudScene` / `Experience` / physics loop over creating a parallel prototype. Marble should become the world layer beneath the current game loop, not a second app.

### Consolidation

Delete or merge redundant terrain, environment, and asset paths once Marble coverage replaces them. Do not leave old procedural systems sitting beside Marble if they no longer affect gameplay or visual quality.

### Prevent Bloat

Every new dependency, component, and asset must have a clear role in one of these outcomes:

- render a Marble world
- make that world playable
- preserve the current agent/vehicle/weather loop
- improve demo clarity or performance

If a change does not support one of those outcomes, it waits.

### DRY

Keep Marble world metadata, asset URLs, collider URLs, bounds, spawn zones, and feature flags in one source of truth. Components should consume resolved world config, not hardcode paths.

### Clean

Separate concerns explicitly:

- Marble asset/config resolution
- Spark rendering
- collider loading
- gameplay spawning
- agent observation
- UI/demo copy

### Modular

The Marble layer should be composable and testable. The existing procedural terrain must remain the fallback until a Marble scene and collider are present.

### Performant

Default to adaptive loading:

- small `.spz` first
- `.rad` only for large worlds
- lazy renderer loading
- stable fallback while assets stream
- keep existing adaptive DPR and frame limiting

### Organized

Use predictable domain-driven locations:

- `services/marbleWorld.ts` for resolved Marble world metadata
- `components/environment/*` for scene integration
- `public/marble/*` for local exported assets when committed
- `docs/*` for submission, demo, and operating notes

## Submission Positioning

### One-Sentence Pitch

`Clawdy` turns Marble-generated worlds into live playable arenas where autonomous AI rivals drive, forage, and manipulate weather inside a persistent 3D splat environment.

### Judge-Facing Story

1. Marble generates the arena from text/image/video inputs.
2. Spark renders the exported splat in the browser.
3. A collider mesh makes the generated world physically playable.
4. Clawdy's existing vehicles, agents, weather, and economy run inside that world.
5. The demo proves the world is not just viewed; it is played.

## Current Fit

### Strong Existing Assets

- Next.js app with a real playable 3D scene
- React Three Fiber and Three.js already in place
- Rapier physics already in place
- vehicle control and pooled vehicle rendering
- AI opponents that observe world state
- weather systems that affect handling and visibility
- HUD, terminal, and demo surfaces

### Gaps For Marble

- no Marble-generated world asset
- no Spark renderer dependency/integration
- no `.spz`, `.rad`, or `.ply` asset path
- no collider mesh for generated worlds
- no Marble-specific README/submission copy
- current world is still procedural terrain/cloud-first

## Architecture Target

```text
Marble export
  ├─ splat: .spz first, .rad for very large worlds
  └─ collider: .glb mesh or authored collider volumes

services/marbleWorld.ts
  ├─ feature flag
  ├─ world asset URLs
  ├─ collider asset URL
  ├─ gameplay bounds
  └─ spawn zones

components/environment/CloudScene.tsx
  └─ keeps Canvas, DPR, overlays, HUD, and app shell

components/environment/Experience.tsx
  ├─ loads Marble world layer when configured
  ├─ keeps vehicles, agents, weather, and collection loop
  └─ falls back to procedural terrain when Marble is unavailable

components/environment/MarbleWorldLayer.tsx
  ├─ owns Spark rendering
  └─ does not own gameplay logic

components/environment/MarbleCollider.tsx
  └─ owns collider mesh loading for Rapier
```

## Execution Plan

### Phase 0: Decision Record And Config Footing

Goal: make the pivot explicit and create a single source of truth before renderer work.

Deliverables:

- this document
- shared Marble world config service
- env-gated Marble enablement
- documented asset placement

Acceptance criteria:

- the app can resolve whether Marble is enabled
- all future Marble components consume one config object
- existing procedural arena remains unchanged when Marble is disabled

### Phase 1: Marble Asset Ingestion

Goal: bring in one playable Marble export.

Deliverables:

- exported `.spz` under `public/marble/`
- exported or authored collider `.glb`
- world bounds and spawn zones derived from the scene
- README notes for replacing the world asset

Acceptance criteria:

- committed paths are stable
- no component hardcodes asset URLs
- asset sizes are reasonable for a hackathon demo

### Phase 2: Spark Renderer Integration

Goal: render the Marble splat inside the existing scene.

Deliverables:

- Spark dependency installed
- `MarbleWorldLayer` renders configured `.spz`
- lazy loading so non-Marble fallback still works
- visual loading/failure state in existing UI surfaces

Acceptance criteria:

- the splat renders in the current Canvas
- procedural visual terrain can be hidden when Marble is active
- FPS remains acceptable on desktop

### Phase 3: Playable Collider Integration

Goal: make the generated world physically playable.

Deliverables:

- Rapier collider mesh or simplified collider volumes
- vehicles can drive, collide, and recover
- spawn zones avoid stuck starts
- gameplay bounds reflect the Marble world

Acceptance criteria:

- player vehicle can traverse the demo route
- AI vehicles can target and reach assets
- collection loop still works

### Phase 4: Gameplay Consolidation

Goal: remove redundant world systems after the Marble layer is stable.

Audit candidates:

- procedural terrain visual rendering
- spherical terrain toggle/demo labels
- duplicated sky/fog/environment behavior
- vegetation that clashes with the Marble world
- cloud visuals that obscure splat readability

Acceptance criteria:

- any removed system has a Marble-era replacement or no longer supports the demo
- no dead flags or unused components remain
- the scene graph is easier to explain than before

### Phase 5: Submission Packaging

Goal: make the Marble usage obvious to judges in under 30 seconds.

Deliverables:

- README reframed for World Labs Marble
- demo script updated around Marble world generation and gameplay
- submission checklist updated for Marble/Spark assets
- short video route through the generated world

Acceptance criteria:

- judge can see Marble output immediately
- judge can see the world is playable
- judge can see the AI agents respond inside that world

## First Implementation Slice

Start with Phase 0:

1. Add `services/marbleWorld.ts`.
2. Resolve one `MarbleWorldConfig` from env and defaults.
3. Add a disabled-by-default feature flag.
4. Wire `Experience` to consume the config while keeping current behavior unchanged.
5. Defer Spark dependency and asset loading until a real `.spz` export exists.

This keeps the codebase aligned with the pivot without introducing a fake renderer or parallel demo.

## Open Decisions

- Which Marble input should define the arena: text-only, reference image, multi-image, or video?
- Should the first export be compact `.spz` or large-world `.rad`?
- Will colliders come from Marble mesh export or the Splat Collider Builder?
- Which procedural systems should remain as gameplay overlays after Marble is live?
- Should onchain proof remain prominent or move to secondary/demo bonus framing?
