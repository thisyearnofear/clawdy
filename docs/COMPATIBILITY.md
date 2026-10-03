# Clawdy v1 Compatibility Policy

**Status: active.** This document is the binding versioning contract for Season 0 artifacts.
Any version bump is a deliberate, reviewed migration — see Rule 6.

The durable asset of this project is not any single world, rover, or checkpoint. It is
credible evidence that coaching caused learning: versioned rules + versioned world +
versioned policy + held-out proof + replay receipt. This policy keeps that chain intact
across a year of future work.

## 1. Version inventory

| Surface | Constant | Current value | Owner |
|---|---|---|---|
| Simulation rules | `ARENA_RULES.version` | `season-0.reference.3` | `services/arenaEpisode.ts` |
| Observation schema | observation `schemaVersion` | `arena-observation-v2` (v1 data still valid) | `services/arenaEpisode.ts` |
| Recording schema | recording `schemaVersion` | `arena-recording-v1` | `services/arenaEpisode.ts` |
| Motion controller | `ROVER_PHYSICS.version` / route fallback | `rapier-kinematic-terrain-0.19.2.v3` / `route-reference-v2` | `services/arenaPhysics.ts`, `services/arenaEpisode.ts` |
| Checkpoint | `POLICY_SCHEMA_VERSION` | `season-0.checkpoint.v3` (v1/v2 metadata-readable) | `services/policyModel.ts` |
| Encoder | `ENCODER_VERSION` / `OBSERVATION_FEATURE_DIM` | `season-0.encoder.v2` / 36 | `services/policyModel.ts` |
| World | `ARENA_WORLD.version` + `colliderSha256` | `sandstone-basin-course-2` + `7633067b2624fb476f36adfb14e1a13b1325c71143fbd4d5087cfaf209c993af` | `services/arenaCourse.ts` |
| Builder fixtures | abstract-graph `worldVersion` | `builder-abstract-v1` | `services/arenaScenarios.ts` |
| Baselines | entrant `policyVersion` literals | `baseline.safe.v2`, `reference.greedy.v2` | `services/arenaScenarios.ts` |

`services/__tests__/versions.test.ts` pins every value in this table. A bump is a
deliberate test edit, reviewed as a migration — never a drive-by string change.

## 2. Rules

**Rule 1 — New sim behavior requires a new rules version.** Any change to tick cadence
(50 ms), decision cadence (every 5 ticks), costs, flood mechanics, arrival/recovery
thresholds, entrant ordering, or termination bumps `season-0.reference.N`. The stored
`rulesVersion` on a recording selects its simulation; an old recording is never
reinterpreted under new rules. Recordings stay readable forever under their pinned
reader; execution requires the matching rules.

**Rule 2 — Schema, rules, and controller are three independent axes.** Recording
*schema* (field layout) may evolve without changing *rules* (behavior) and vice versa;
checkpoint schema is independent of both. Readers distinguish:

- `recording-schema-mismatch (got X, want Y)` — unknown field layout, refuse.
- `rules-mismatch (recording pinned A, runtime B)` — refuse execution; metadata
  inspection (spans, focus, reason) stays available.
- `controller-mismatch (got X, want Y)` — refuse physical replay; route-level
  review may still proceed where supported.

Never collapse these into one "incompatible" error and never silently truncate.

**Rule 3 — Additive observation fields are tolerated; semantic changes bump.**
Consumers (policies, coach UI, eval harness) ignore unknown observation fields;
producers never repurpose a field's meaning without a schema bump. The planned
fog/memory extension lands as additive fields under this rule.

**Rule 4 — Worlds are content-addressed, courses are versioned.** The terrain GLB's
SHA-256 is its identity (enforced by the loader; mismatches refuse with a hash
error). A geometry change always produces a new `ARENA_WORLD.version` plus fresh
grounding proof (every edge grounded both directions, zero recoveries). Node/edge ID
renames are breaking course changes even with identical geometry, because recordings
and coaching examples reference IDs.

**Rule 5 — Checkpoints carry full lineage; the freeze list is explicit.**
Every checkpoint records parent ID + parent weightsHash, dataset version + example
IDs, training config + seed, and architecture/observation/action/rules versions.
Frozen alongside any checkpoint release (see §3); the set bumps together or not at all.

**Rule 6 — Every bump ships migration notes.** A bump PR states what changed, why,
which prior versions remain readable vs executable, and what happens to in-flight
artifacts (localStorage checkpoints, exported JSON, saved recordings). No silent
invalidation. Product retirement alone never authorizes destroying user artifacts.

## 3. Season 0 freeze list (v1 canonical values)

Simulation (`ARENA_RULES`): `stepMs 50`, `decisionEveryTicks 5`, `maxDurationTicks 7200`,
`capacity 3`, `initialEnergy 12`, `moveCostPerTick 0.03`, `drainCost 2`, `drainTicks 50`,
`drainCooldownTicks 150`, `floodTravelMultiplier 4`, `maxBlockedTicks 40`,
`arrivalTolerance 0.07`, `groundingTolerance 0.25`. Course episodes run 1200 ticks.

Policy architecture: 36-dim encoder → 32 → 16 → 8-class head, Tanh hidden, softmax
output. Dims 0–31 are frozen v1 semantics; dims 32–35 are additive v2
(public rival banked, stale remembered value, hidden fraction, remembered
fraction). Action classes: `0 wait, 1 bank, 2 collect, 3 drain, 4 move-low (floodable),
5 move-high (dry), 6 move-resource, 7 move-home` (`classifyAction`, `policyModel.ts`).
Checkpoint v3 adds a linear edge-pointer head (`edgeHead`: EDGE_FEATURE_DIM=8
weights + 1 bias) that ranks same-class candidate roads by a *residual* over the
shared executor heuristic — zero-init ⇒ exact v2 ordering; heuristic −Infinity
traps stay absolute. Pinned by `versions.test.ts`.

Training configs by entry path (overrides recorded per checkpoint in `trainingConfig`):

| Path | epochs | learningRate | momentum | weightDecay | decay |
|---|---|---|---|---|---|
| `trainPolicyCheckpoint` defaults | 40 | 0.03 | 0.85 | 0.0001 | — |
| Builder CLI (`starter/train.ts`) | 500 | 0.01 | 0.9 | 0.0001 (default) | — |
| Distill/eval (`scripts/eval-holdout.ts` via `scripts/eval-lib.ts`) | 60 | 0.005 | 0.85 (default) | 0.0001 (default) | — |
| Browser coach panel (`ArenaScene`) | 60 | 0.008 | 0.85 (default) | 0.0001 (default) | ×0.5 from epoch 30 |

These configs are pinned by `versions.test.ts`. Changing any value changes measured
results (`docs/eval-holdout.json`, `starter/champion-checkpoint.json`) and therefore
requires re-running the affected path and re-recording its outputs in the same change.

**Execution location is not part of the checkpoint contract.** As of Oct 2, the browser
coach panel runs `trainPolicyCheckpoint` and `comparePracticeCheckpoints` inside
`services/trainingWorker.ts` rather than on the main thread. The config, the trainer, and
the episode authority are unchanged, and `npm run eval:gate` reproduces the pin
byte-for-byte across the same path — a worker must never produce a different checkpoint for
the same parent, examples, and config. Moving CPU work between threads is therefore not a
compatibility break; changing any pinned number above still is.

Promotion discipline: no checkpoint is promoted on the strength of one replay.
`npm run eval:gate` (CI-enforced) reproduces the pinned `docs/eval-gate.json` —
16 abstract matched legs (4 held-out scenarios × {safe, distilled} × {normal,
side-swapped}), 8 grounded legs (practice + compete × {safe, distilled} ×
{normal, side-swapped} on isolated physics over the pinned collider), and
16 family legs (4 generated layouts × {safe, distilled} × {normal, swapped}),
zero-recovery and all-finished hard floors, the harness-enforced claims block
(see `checkClaims` in `scripts/eval-gate.ts`: abstract per-leg parity within 1
of the safe teacher + identical champion-win set; physics no-collapse floor of
floor(safe/2) per leg — recomputed from raw match data every run, so the pin
can never weaken a claim), determinism via the distilled weightsHash, and the
`docs/regression-frames.json` corpus. A mismatch fails CI; re-pinning with
`--update` is a reviewed migration, never a silent reset. Product docs may only
claim what this block enforces — when a claim fails, the claim and the prose
come down, the numbers do not move up.

## 4. World namespaces

Two disjoint namespaces, never mixed:

- `sandstone-basin-course-N` — collider-grounded playable courses. Positions come
  from physics sampling on the pinned GLB. Recordings made here replay physically.
- `builder-abstract-v1` — abstract topology fixtures for headless training/eval
  (`PRACTICE_SCENARIOS`, `HELD_OUT_SCENARIOS`). Positions are illustrative; these
  scenarios never claim collider grounding and never replay against the terrain mesh.

`buildArenaCourse` asserts the world it grounds; builder fixtures assert nothing
about terrain. The distinction is load-bearing: abstract graphs train the policy,
grounded courses prove it.

**Visual twin.** `public/terrain/sandstone-basin-visual.glb` is a render-only copy
of the terrain with UVs (`ARENA_WORLD.visualUrl` / `visualSha256`). Physics, the
trainer worker, and `eval:gate` read only the collider GLB, so the twin sits
outside the pin: building or changing it never changes `colliderSha256`, the
world version, or `docs/eval-gate.json`. The renderer falls back to the collider
GLB while `visualSha256` is `null` or if the twin fails to load. Build with
`infra/blender/build-visual-terrain.sh` (Docker, Blender 4.2.3 pinned, no local
install; rebuilds are byte-identical) or `npm run terrain:build:visual` with a
local Blender, then paste the printed SHA into `ARENA_WORLD.visualSha256`;
`arenaVisualTerrain.test.ts` checks the hash and that the twin's geometry equals
the collider's. The renderer multiplies a procedural, tileable grain/bump texture
(`components/environment/terrainDetail.ts`) onto the twin's UVs.

## 5. Migration log

### v2 encoder + public scoreboard (observation v2 / encoder v2 / checkpoint v2)
- **What:** rival `banked` disclosed at all visibility levels (cargo/position stay
  fog-masked); encoder 32 → 36 dims with four additive memory/scoreboard
  features; checkpoint schema v1 → v2 (36-wide input layer).
- **Why:** the 32-dim encoder was saturated and rival-intent signal was nulled
  whenever the rival was hidden. Scoreboard publicity follows the generals
  precedent (scores public, positions fogged).
- **Readability:** v1 recordings still replay (observations are data, never
  re-encoded at replay). v1 checkpoints validate and show lineage/eval records
  but refuse execution (`checkpoint-execution-mismatch`) and fine-tuning.
  v1 training examples reload and re-train under v2 (observations re-encoded
  at train time). Stored v1 base never shadows the v2 base (id+schema match).
- **Measured effect:** abstract held-outs unchanged (safe 23, trained 11);
  grounded compete trained 6→5 normal / 0→4 swapped — side-bias partially
  reduced on the physical course. Frames 12/12. Full re-pin reviewed in
  `docs/eval-gate.json`.
- **User impact:** browser checkpoints minted under v1 become view-only; the
  refusal message names the upgrade path (re-train examples under v2).

### Oracle-routed consequence supervision (distill v2, Sep 23)

- **What:** the synthetic dataset (`scripts/eval-lib.ts`) is no longer
  single-teacher safe-distillation. Each practice tick is routed to the
  honest teacher — `weather` (drain while swimming flood water), `patience`
  (wait out floods with cargo aboard), `safe` (flood-aware routing/collect/
  bank) — via `routeOracle()` in `services/arenaPolicy.ts`. Every label is
  verified by a 120-tick counterfactual rollout
  (`rolloutOutcomeDelta()`, new `ArenaEpisode.restoreSnapshot()` branch
  primitive): oracle branch vs learner branch, safe continuation, greedy
  rival. Contradicted labels (delta < −0.25) are dropped — the outcome
  overrides the teacher. Kept labels train with consequence weights
  (1 + clamped delta, routine 1.0 → verified 3.0) through weighted
  cross-entropy (`sampleWeights` in `trainPolicyCheckpoint`).
- **Syllabus:** practice grows 3 → 6 boards (all `practice` split, held-out
  untouched): early-flood, long-flood, and contention (greedy rival starts
  mid-board) variants force the timing/contested states the base three never
  produce. Per-scenario emit budgets keep every board teaching.
- **Executor (same change):** `selectActionForClass()` ranks same-class moves
  by flood-aware cost + resource value + onward prospect (stale sightings
  discounted 0.2×) instead of first-legal — weights choose strategy, the
  shared cost map executes routing. Deterministic ties on edge id.
- **Why:** probed all practice boards — safe never waits at a station and
  never drains, so two of eight action classes had zero demonstration and
  drain timing was untrained fallback noise. Imitation of one router cannot
  teach timing; measured consequences can.
- **Config:** distill learningRate 0.02 → 0.005 (0.02 diverges on the
  95-example mixed set: loss 3.2, acc 18%; 0.005 converges: loss 0.02,
  acc 100%). Epochs/momentum/decay unchanged. Encoder (36-dim), 8-class
  head, sim rules, held-out split all frozen.
- **Measured effect:** abstract `safe 23 / trained 11 (−12)`; grounded
  practice trained `3→9 normal` (now beats safe head-to-head on the physical
  course); family-03 trained `3→6`; frames 12 → 23/23. Full re-pin reviewed
  in `docs/eval-gate.json` + `docs/regression-frames.json`. Honest status:
  the student still trails the teacher on abstract held-outs — timing
  transfers, junction targeting under contention does not yet. Next: junction
  contrast pairs (oracle-vs-base disagreement states are already mined in
  phase 2; executor stale-discount is the first half of the fix).

### Held-out oscillation + timing budget (Sep 24)

- **What:** timing-first syllabus pass (weather/patience/dry-move before safe
  routing fills the global cap); challenge boards get larger junction/timing
  mine budgets; executor redirects for bank-at-base, cargo anti-oscillation
  (no corridor hop that increases home distance when homeward is legal and no
  visible pickup remains), empty-bay class 4↔5 score arbitration; corridor
  prospect discounts non-visible ghosts harder (visible 1.0 / stale 0.05).
- **Why:** heldout-02 scored 0 via cargo=1 bouncing `cross-n`↔`ridge-n1` while
  `ridge-r1-rc` (home) sat unused — class-5 logits outranked class-7.
  Weather/patience labels lost a budget race to safe routing, so abstract
  floods under-trained.
- **Measured effect (gate pin `122f676a3d4f`, 169 examples):** grounded trained
  `29→33` (practice 10/8, compete 9/6; safe 36); abstract dual-side trained
  `20→36` (safe 44); heldout-02 normal `0→5`. Family still trails (43 vs 72).
- **Safe-trajectory shadow (compete normal):** on the path that banks 12,
  distilled legally disagrees only 5 times. One-step regret: skipping on-node
  collect at t20 is −3 (entire open-loop gap on that spine); post-bank ridge
  vs valley at t400 is 0 on the safe spine. Open-loop compete stays 9 because
  trained leaves the safe spine — later low-energy ridge stalls scrap
  `3+3+2+1`. Collect-first abstract labels flip t20 logits (class-2 ≫ class-6)
  but regress compete swapped (−1) and do not raise open-loop compete; flood
  barren→nearest executor patches raise compete toward 10 but drop practice
  normal to 7. Not pinned.
- **Next:** grounded-only disagreement mining that walks the *base* policy on
  practice-split physics (not the safe spine), prioritizing post-bank flood
  valley-vs-ridge contrasts that resemble compete t400 — no eval-split leak,
  no hard redirect that fights practice.

### Two-pass student mine attempt (Sep 24, same day)

- **What tried:** after phases 1–3b, train an interim checkpoint and walk it on
  `sandstone-practice-01` (student trajectory). Emit oracle corrections at
  empty-bay flooded pad junctions (`respectRolloutVeto` on `tryEmit`).
- **Finding:** the frozen base checkpoint banks 0 on practice, so it never
  reaches post-bank states. The interim student DOES reach them and surfaces
  the exact compete t400 contrast (`valley-cb-n1` preferred vs `base-cb-rn`
  original at champion-base). Route-only `rolloutOutcomeDelta` is &lt; −0.25 on
  that state — bypassing the veto (flooring delta to 0.5) regresses practice
  normal 10→7. With the veto respected, zero student labels survive.
- **Code:** `tryEmit(..., { respectRolloutVeto: true })` kept for future
  physics-aware consequence checks; default syllabus build does not run the
  interim walk (would double distill cost for zero emits).
- **Next:** physics-aware (or longer) consequence check for grounded student
  mines, or human-approved pad-flood contrasts — not another executor redirect.

### Practice-deep mine + hollow class-5 alias (Sep 24, evening)

- **What:** `practice-deep` board (compete-like floods/cores, practice split)
  for two-pass student mines at h=240 with `respectRolloutVeto`; valley-over-
  ridge only at `banked≥6`. Executor: hollow class-5→non-floodable class-6
  alias at flooded bank=3 pad; soft on-node collect when class-2 trails top
  by &lt;1.0; energy patience on barren pad hops with play/eval floor
  `remainingTicks&gt;400` (distill mines use 0 so weights match compete-12).
- **Physics finding:** physics-aware rollouts matched route-only on the pad
  contrast; longer horizons on practice-01 stay valley-negative. Deep board
  + boost (δ≥1.5) is what lets the student label survive.
- **Measured (gate pin `86f3dbeb3d2f`, 170 examples):** grounded trained
  **36** (practice **10**/8, compete **12**/6); abstract dual-side **36**.
  Family still trails (38 vs 72).
- **Next:** close family gap; human-coached training at scale.

### Executor symmetrization + checkpoint v3 residual edge head (Sep 25–26)

- **What (four linked moves under one reviewed arc):**
  1. **Symmetric executor rules** (`services/arenaControllerRules.ts`):
     auto-bank, on-node collect, no-retreat-hop and patience-when-gated now
     live in `applyControllerRules(obs, action)` — observation-derived
     predicates only — and run for the `safe`/`greedy` teachers AND the
     learned policy alike. Deleted: the student-only scenario-shaped
     redirects gated on `banked===3/≥6/≥9` constants, the hollow class-5→6
     alias, soft on-node collect margin, premature-home, pad-flood tie-break.
     The student gets no scaffolding the teacher doesn't.
  2. **Expert-iteration mining attempt** (phase 1d in `scripts/eval-lib.ts`):
     outcome-argmax labels over bounded candidate sets on practice walks.
     Broad class-level overrides poisoned held-out/family legs (measured
     2026-09-26: heldout-02 normal 5→0, family 58→50, grounded 27→22);
     re-scoped to edge-only same-class overrides under the v3 head, they
     still poisoned grounded physics (compete-01 normal 11→5, one pinned
     regression frame failed); a stricter +2.0 threshold was worse. Final
     state: `ARGMAX_TOTAL_CAP = 0` — the machinery and its measured history
     stay in-tree. Re-enablement requires a physics-aware rollout oracle,
     not a smarter threshold. The user-facing path was never affected:
     browser training remains 100% approve→cross-entropy.
  3. **Checkpoint v3** (`season-0.checkpoint.v3`): a linear edge-pointer
     head (`EDGE_FEATURE_DIM = 8` inference-time features per candidate
     road) that breaks the 8-class label ceiling by letting an approved
     `edgeId` actually train routing choice. **Deviation from plan:** the
     head scores a *residual* over the executor's v2 heuristic
     (`scoreMoveEdge/16 + w·f + b`) rather than the planned pure learned
     score — a random-init learned-from-scratch head degraded the base
     checkpoint that outcome-verification rollouts run on, shifting teacher
     labels (dataset 162→164, trained 38→21) before teaching anything.
     Zero-init residual ⇒ base provably equals v2 behavior; −Infinity
     heuristic traps stay absolute. Backbone, encoder, and class head are
     untouched; disclosed here as the architecture decision the HACKATHON
     Learning Contract delegates to experiment.
  4. **Browser coach path:** few-shot stability — 100 epochs @ 0.02 diverged
     on ~10-example lessons; the panel now trains 60 @ 0.008 with a
     deterministic ×0.5 decay from epoch 30 (plumbed through
     `trainingConfig`, the Convex payload validator, and `versions.test.ts`
     config pins, including the previously unpinned distill/builder/CLI
     configs). New review-frame feature: top-3 *outcome-verified*
     alternative actions (`services/coachingCandidates.ts`) ranked by the
     same dual-horizon `rolloutOutcomeDelta` the CI syllabus uses, computed
     on the real pre-decision replay snapshot, each row showing its measured
     delta; queueing one still requires explicit human approval.
- **Claim enforcement:** the gate now carries a harness-enforced claims
  block (see §3 promotion discipline). The literal "beats what it was never
  taught" claim is **softened to what is measured**: the bar "trained ≥
  safe per suite" (plan GO-3) was NOT met, and per plan we report it rather
  than re-pin downward.
- **Measured effect (distill `9c1e938a3d6b`, dataset `ds:6c34309c:162`):**
  abstract held-outs: trained 38 vs safe 40 dual-side, **8/8 legs within 1
  banked of the teacher, champion-win set identical (5 = 5, same legs)** —
  up from trained 19 vs 23-normal at the prior pin with 0 parity wins.
  Grounded physics: trained 27 vs safe 35 (compete normal 11 vs 12);
  family layouts: 55 vs 68 — every leg at or above the half-of-safe
  no-collapse floor. Edge-only decision divergence mass (WS1.0 analyzer):
  15.5 → 1.25. Frames 24/24, zero recoveries, all runs finished.
- **Readability:** v2 checkpoints validate and show lineage/eval records but
  refuse execution and fine-tuning (`checkpoint-execution-mismatch`),
  exactly like v1 did under v2; boot quarantines them. The v3 base
  checkpoint is a new shared seed (`createBaseCheckpoint`, zero-init edge
  head); v1/v2 bases never shadow it.
- **Label decision:** entrant `policyVersion` literals stay
  `baseline.safe.v2`/`reference.greedy.v2` — they are descriptive strings
  outside the execution path; the executed-teacher identity for this era is
  carried by the distill weightsHash + gate pin. Bumping the literals would
  byte-churn 24 pinned regression-frame observations for zero contract gain.

### Post-re-pin rendering dependency pass (Sep 26, no version-axis change)

- **What:** after the re-pin above, the frozen rendering stack was bumped
  within majors: three 0.180.0→0.186.1, @types/three 0.186.0,
  @react-three/fiber 9.5.0→9.8.1, @react-three/drei 10.7.9,
  react/react-dom →19.3.0 (fiber peers allow >=19 <19.4). Physics stays
  **locked: @dimforge/rapier3d-compat 0.19.2** — used directly by
  `services/arenaPhysics.ts`; the unused `@react-three/rapier` wrapper was
  removed September 26, 2026. The npm overrides + postinstall guard remain
  because `@types/three` itself depends on rapier3d-compat ~0.12; rapier 0.21
  is a breaking jump and was skipped deliberately.
- **Verification:** `npm test` green (GLB SHA pins survive — bytes unchanged);
  `npm run eval:gate` reproduced the pin byte-for-byte; `npm run build`
  (Turbopack) clean. **Zero grounded/family drift ⇒ no `ROVER_PHYSICS.version`
  bump, no re-pin.** The pass rule stands: if a future rendering bump moves any
  grounded leg, revert the bump — never re-pin over physics drift.

### Render-layer interpolation + shadow-map cleanup (Sep 26, evening — no version-axis change)

- **What:** two player-visible quality fixes with no sim/policy/physics effects:
  1. **Fixed-timestep render interpolation.** The arena sim commits at 20 Hz
     (one tick per 50 ms). Before this change the renderer consumed every
     commit directly, so both the `Rover` mesh and `FollowCamera` jittered
     20×/sec. `ArenaSession.interpolation()` now exposes the runner's
     interpolation fraction; `ArenaWorldView.tsx` adds `sampleInterpolatedPose`
     (per-session WeakMap of pose histories) so the renderer samples one tick
     behind authority and lerps by the live tick fraction — velocity ripple
     gone from the Rover, FollowCamera follows one motion curve with the
     Rover. `RoverShadow` gets the same treatment. Idempotent per tick;
     reset on scrub.
  2. **Shadow-map type pinning.** `@react-three/fiber` defaults to
     `PCFSoftShadowMap` when `shadows={true}`. `three` r186 deprecated that
     type → deprecation warning + fallback + a GL sampler mismatch against
     Spark's `sampler2DShadow` uniforms (71 `GL_INVALID_OPERATION` / frame).
     `ArenaWorldView` now passes `shadows={'percentage'}` explicitly, which
     fiber maps to `PCFShadowMap` — the current three default — before Spark
     inits. Upgraded `@sparkjsdev/spark` 2.1.0→2.2.0 for a clean
     `sampler2DShadow` implementation on r186.
  3. Spark also replaced its own deprecated `THREE.Clock` with `THREE.Timer`
     in v2.2.0; the Rapier init warning (`"using deprecated parameters"`) is
     harmless (Rapier's API contract predates the object form; no fix).
- **Verification:** `npm test` green; `npm run eval:gate` byte-for-byte
  repro of pin `2b76a6113d66`; `npm run build` clean. No grounded/family
  drift (physics untouched), no policy re-pins. Browser console: the PCFSoft
  shadow warning and all 71 GL sampler-mismatch errors clear; the remaining
  deprecations are Rapier init and fiber-internal clock (out of app code).
- **Follow-up (same day, render-only):** the pose history moved into
  `services/arenaPresentation.ts` (`advancePoseHistory`/`samplePoseHistory`)
  and gained three behaviours: snapshot-identity tracking so a rebuilt
  runner or a different recording at an unchanged tick (both start at
  tick 0) snaps instead of showing a stale pose; a display quaternion
  rate-limited to `MAX_POSE_TURN_RAD_PER_SEC` because the kinematic
  controller can commit ~180° yaw flips on consecutive ticks while
  terrain-pinned or parked on a node (declared `turnRate` is unused —
  physics is deliberately untouched since yaw steers movement; smoothing
  is render-only so recordings, replays and the gate pin are unchanged);
  and a missing-rotation guard for shallow-validated external recordings.
  `FrameLimiter` now passes `advance()` a monotonic timestamp — fiber's
  `frameloop:'never'` derives useFrame delta as `timestamp − elapsedTime`,
  so the previous per-frame duration argument starved the sim to ~0 and
  produced negative deltas on lite devices.

### Physics-aware rollout oracle + grounded argmax (Sep 26, evening — no version-axis change)

- **What:** the consequence rollout oracle is no longer route-only on
  grounded boards. `rolloutOutcomeDelta` (`services/arenaEpisode.ts`) accepts
  an optional shared `ArenaMotion`, and `restoreSnapshot` re-seeds the motion
  adapter from the restored positions (the missing primitive that made
  physics branches impossible). Branch scores penalize recoveries at −2
  each — only reachable under physics, so stalling roads can no longer
  out-score slower-but-moving ones. In the distill (`scripts/eval-lib.ts`):
  grounded phases 3a/3b/3c measure every label against the pinned collider
  and always respect the veto (the route-only floor-at-0.5 exception is
  deleted); new phase 3d re-enables edge-only outcome-argmax mining on
  `sandstone-practice-01` (both sides, cap 3 per walk / 6 total) with the
  same dual-horizon ≥ +1.0 rule, now physics-measured. Abstract argmax stays
  cap-disabled (route-only argmax measured neutral on abstract legs, poison
  on physics legs). `analyze-legs` deltas are physics-aware on
  grounded/family legs. The browser coaching path
  (`services/coachingCandidates.ts`) and all abstract mining are untouched:
  no motion ⇒ byte-identical route-only behavior.
- **Why:** route-only branches cannot produce stalls or recoveries, so
  physically slow edges looked as cheap as their nominal `travelTicks` — the
  diagnosed source of the grounded/family transfer gap.
- **Guardrails:** restore fidelity is pinned by
  `services/__tests__/rolloutPhysics.test.ts` — a snapshot-restored physics
  branch reproduces the uninterrupted run exactly (positions, banked,
  recoveries). Spawn-check failures on wall-clamped snapshot poses fall back
  to the route-only measure for that single emit (never a crash, never a
  physics-priced veto from a route-only number).
- **Measured (distill `2b76a6113d66`, dataset `ds:efb05ad8:161`; phase 3d
  found one label, `cross-vc-cc` at t370, +7.50 at both horizons):**
  grounded trained 27→**31** vs safe 35 (gap −8→−4); family 55→**63** vs
  safe 68 (gap −13→−5, incl. family-03 normal 10→13 and family-01 normal
  4→7). Abstract unmoved (38 vs 40, 8/8 parity, identical 5-leg win set).
  Zero recoveries, all runs finished, claims block green. Frames re-pinned
  to the passing subset: 23/24 — `builder-course-04-early-flood-t80`
  (expected class 6, policy now picks 5) dropped; the frame corpus guards
  behavior and does not claim capability.

### Rate-limited committed yaw + bundled starter checkpoint (controller v2; first-run UX)

- **What (physics):** `ROVER_PHYSICS.version` bumped
  `rapier-kinematic-terrain-0.19.2.v1` → `...v2`. v1 wrote
  `yaw = atan2(dx, dz)` straight into the committed pose every tick — the
  declared `turnRate` was dead code — so direction-to-target whipsaws
  committed ~180° flips per tick (174 during a flooded crawl of
  `shortcut-rb-far` in one traced match — later audit showed that edge was
  flood-crawling at quarter speed, not collider-pinned)
  and parked rovers overshoot-oscillated on sub-mm direction noise (103
  node-side flips in the same trace). v2 decouples the axes: `steerYaw`
  keeps the *identical* `atan2` expression for movement (positions and every
  downstream result are bit-identical to v1), while the committed
  `agent.yaw` slews toward it at `turnRate` (4 rad/s) and holds inside a
  0.08 `yawDeadzone`. Rotation never steers the body. The render-layer slew
  (`MAX_POSE_TURN_RAD_PER_SEC`) stays as interpolation smoothing; the
  committed data is now clean on its own.
- **Why no rules bump:** per Rule 2, the controller axis is independent —
  rotation is not part of `arena-observation-v2`, never enters
  `datasetHash`/`weightsHash`, and positions/arrivals are unchanged, so
  `season-0.reference.2` and gate pin `2b76a6113d66` hold.
- **Replay compat:** `replayArenaEpisode` accepts v1-labeled physical
  recordings under the v2 controller with `agent.rotation` normalized out of
  the state comparison (positions are bit-identical by construction).
  Positional divergence still reports `divergedAt`; unknown controllers
  still refuse with `controller-mismatch`. Pinned by new cases in
  `services/__tests__/arenaPhysics.test.ts`.
- **Artifact tracking:** `starter/champion-checkpoint.json` was previously
  gitignored as a regenerable output. It is now a runtime dependency
  (bundled into the client), so it is committed — regenerate via
  `npx tsx scripts/build-starter.ts` (grounded syllabus; see next entry)
  and commit the diff deliberately.
- **What (first run):** the app previously defaulted a fresh install to
  `SEASON_0_BASE_CHECKPOINT` — a seeded-random MLP that wanders and banks
  ~0. `services/starterCheckpoint.ts` now bundles
  `starter/champion-checkpoint.json` ("Starter brain (house-trained)",
  schema v3, 500 epochs on builder examples) as
  `SEASON_0_STARTER_CHECKPOINT`, validated at import. It is the
  `loadStoredCheckpoints` empty/corrupt sentinel, the `arenaStore` default,
  and the boot-time selection when no stored executable checkpoint exists;
  synced user checkpoints still take priority on merge (syncEngine prefers
  a non-starter executable). Training compares against the *parent* (the
  checkpoint actually trained), not vs the untrained base, so the displayed
  before/after delta reflects coaching. Service-level defaults
  (`ArenaSession`, `createLearnedPolicy`, eval/gate harness) keep
  `SEASON_0_BASE_CHECKPOINT` — the shipped artifact is an app-layer choice.

### Grounded-distilled starter + `shortcut-rb-far` audit (no version-axis change)

- **Edge audit result:** `shortcut-rb-far` is healthy — zero
  `blockedTicks` across full grounded practice matches and a clean
  isolated polyline traversal (`scripts/trace-edge-pin.ts`). The earlier
  "170-tick pin" was a flooded traversal at quarter speed (176 required
  units at 1/tick) misread under v1 yaw whipsaw, plus the match's greedy
  rival re-entering it 4×. No course or collider change, no terrain
  re-pin.
- **Real defect found instead:** the abstract-only starter artifact
  limit-cycled in grounded play — 31 consecutive `ridge-north`↔`ridge-n1`
  round-trips (t355–t1125, banked 3). The distilled checkpoint trained on
  the *grounded* syllabus (`buildSyllabusExamples` with the pinned
  collider) banks 6 on the same match and keeps purposeful movement.
- **Artifact regen:** `scripts/build-starter.ts` regenerates the bundled
  starter via that pipeline, reports incumbent-vs-candidate on abstract +
  grounded surfaces, and refuses to overwrite unless the candidate clears
  both. The regenerated artifact's `weightsHash` equals gate pin
  `2b76a6113d66` by construction — it is the same distillation the gate's
  trained legs run. A residual base↔`valley-n1` oscillation remains in
  flood windows (t600+, ~10 round-trips) — bounded, flood-plausible, and
  coachable rather than a hard loop.
- **Detection extraction:** the first-mistake trigger's predicate moved to
  `detectMistakeSignal` in `services/workbenchFlow.ts` (pure, unit-tested
  in `workbenchFlow.test.ts`) — ArenaScene now supplies the cursor and the
  session marker only.

### Proportional speed + real stagger + strict committed return (rules reference.3 / controller v3)

- **What (physics, controller v3):** `step` now moves the body at
  `min(maxSpeed, distanceToTarget/dt)` — it lands on the episode's
  advancing target instead of overshooting. v2's binary `{0, maxSpeed}`
  quanta could not cruise at the authored target speed (0.09 m/tick vs
  0.12 max), so every leg ran a lurch-stop oscillation: measured 55–61%
  of transit ticks were dead ticks (worse on flood-crawl legs, ~80%).
  Positions differ from v1/v2, so older-controller recordings are a hard
  `controller-mismatch` — no rotation-equivalence entry was added.
- **What (rules, `season-0.reference.3`):**
  - `ArenaAgentState.staggeredUntilTick` is new. `applyEncounterClash`
    previously wrote the stagger into `cooldownUntilTick`, which only
    gates `drain` — the 24-tick stagger prize never delayed the loser.
    It now sets the dedicated field, and `checkActionRejection` rejects
    every non-`wait` action with `'staggered'` while it ticks down.
    Drain cooldown semantics are untouched.
  - Regen no longer counts an accepted `wait` as "acted" — the recharge
    verb was paying a ~20% regen tax on itself. Rate extracted as
    `ARENA_RULES.idleRegenPerTick` (still 0.1).
  - Committed return is strict: when a carrier is committed and the
    canonical homeward hop is unavailable, the rule returns `wait`
    instead of keeping any distance-reducing side-hop. Side-hops burned
    regen on shuffle moves — the learned champion ping-ponged
    `ridge-center`↔`cross-c` for ~175 ticks on heldout-01.
- **Rejected economy changes (measured, deliberately not shipped):**
  `moveCostPerTick` 0.03→0.02 and `idleRegenPerTick` 0.1→0.15 each
  broke the gate — loosening energy lets `safe` wait-out obstacles even
  better while the trained student's approximate edge-ranking could
  afford churn hops sooner (heldout-01 went 6/6 → 8/5). The v3 fee
  ladder and regen rate are pinned unchanged; the starvation cost that
  remains is a design-boundary constraint, not a defect.
- **Migration:** `ARENA_RULES.version` → `season-0.reference.3`;
  `ROVER_PHYSICS.version` → `...v3`. Old recordings refuse on both axes
  (`rules-mismatch`, `controller-mismatch`) rather than silently
  diverging — `staggeredUntilTick` would otherwise appear in recomputed
  snapshots that pinned checkpoints lack.
- **Artifacts:** gate pin re-pinned via `eval:gate -- --update`
  (claims: abstract 8/8 within 1, wins 3=3, physics 12/12, frames
  24/24). Starter regenerated: `weightsHash=525eba353d75` (same
  distillation the gate runs).

### Public Rush timetable + timetable checkpoints (additive, no version-axis change)

- **What:** Rush scenarios may publish `rush.waves` (nominal spawn, jitter window,
  node). The observation gains an optional `rushWaves` field (unspawned waves,
  soonest first); episodes without waves, including all Haul scenarios, are
  byte-identical to before. The Rush course publishes its waves with the same
  `WAVE_JITTER_TICKS` the variants use, so a published window always contains the
  real spawn (validated: "rush waves").
- **Why:** the trainer's measured ceiling was timing. A wave-aware staging bot
  (bank before the wave, wait empty at the hub) beat `safe` 34-7, but a policy that
  cannot see the schedule cannot learn it.
- **Checkpoints:** a standard v3 checkpoint is 36 inputs / 8 edge features and is
  unchanged. A *timetable* checkpoint is 38 / 9 (`TIMETABLE_FEATURE_DIM`,
  `TIMETABLE_EDGE_FEATURE_DIM`); the two widths must travel together
  (`validateCheckpoint` rejects a mix). `extendCheckpointForTimetable` zero-extends
  a standard checkpoint, so it plays identically to its parent until training moves
  the new rows (pinned by `rushTimetable.test.ts`); lineage is recorded in
  `parentCheckpointId` and the id gains `-tt`. The learned policy and the trainer
  read the checkpoint's own widths, so both kinds run side by side.
- **Pins untouched:** `eval:gate`, `docs/eval-es.json`, the starter checkpoint,
  `ARENA_RULES.version`, `ROVER_PHYSICS.version` and the collider hash are
  unchanged; the new constants are pinned in `versions.test.ts`.

## 6. Non-goals
- No cross-version *execution*: a v1 checkpoint is never run under v2 rules "to see
  what happens". Cross-version comparison happens in the eval harness on matched
  scenarios, never by reinterpreting artifacts.
- No server-side migration of user artifacts: old localStorage checkpoints keep
  working under their pinned readers; user data is never rewritten in place.
- Weight identity is a deterministic digest, not a cryptographic SHA-256
  (see `HACKATHON.md`). If checkpoints leave the browser, either implement a real
  hash over canonicalized JSON or rename the field to `weightsDigest` first.
