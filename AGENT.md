# Clawdy Agent Contract and Implementation Instructions

## Binding Direction

As of September 5, 2026, Clawdy is an **agent-training league in a physical world**. The authoritative product and execution plan is [docs/HACKATHON.md](docs/HACKATHON.md).

The loop is **watch → coach → approve examples → train → compete → replay → improve**. Chat is the coaching interface. A real policy update makes coaching persist. Frozen checkpoints compete without human help.

The old human-driving-first arena, onchain economy, wallet/session permissions, financial agent roles, and separate Marble pivot are retired. Do not extend those products, preserve their APIs for compatibility, or introduce a parallel game. Reuse useful rendering, physics, weather, and state primitives; replace or retire everything else as its dependencies are removed. Historical behavior is available in Git.

**September 18 addendum:** the owner approved a mesh-first playable ground built locally instead of a generated world. The active terrain is a Blender-authored uncompressed GLB at `public/terrain/sandstone-basin.glb` (assets included; `npm run terrain:build` checks the overwrite guard — regenerate with `blender --background --factory-startup --python scripts/build-arena-terrain.py -- --force` using Blender 4.5 LTS on PATH, then re-pin the printed GLB SHA in `arenaCourse.ts`), used identically for rendering and collider extraction. The Marble world pipeline (code, scripts, assets, and env vars) was retired and removed from the repo on September 26, 2026; git history holds it. The synced Mint terrain candidate remains in the registry but is not active. No browser QA was run for this pass; code and non-browser checks only.

This is the target contract and implementation guide. The application entrypoint runs `ArenaScene` / `ArenaWorldView` with the same `ArenaEpisode`, `ArenaPhysics`, and `ArenaSession` used in headless tests, plus a `Coach & Train Studio` that proposes examples, trains a small MLP checkpoint in-browser/CLI, and exports/imports `PolicyCheckpoint` artifacts. The full loop is wired; held-out evaluation is CI-gated (`npm run eval:gate` pin `53f3d95c3d9b` + claims block, docs/COMPATIBILITY.md §3) and the starter reports a measured improvement (grounded-distilled `525eba353d75`, +21 banked and 4/4 wins over the untrained base's 0 on abstract held-outs, 56 vs 0 on abstract practice, and 9 banked on the grounded practice course vs 3 for the abstract-only predecessor). Proven claim boundary (Sep 26): teacher-parity on abstract held-outs, mixed on physics — the distilled entrant leads the safe teacher on the grounded course (28 vs 27) but trails on held-out family layouts (56 vs 68) — never claim superiority the gate does not enforce. Browser testing was deferred at the project owner's request; the deferral was lifted for the Sep 26 decomposition round and the full workbench loop (boot → Play → review → coach → train → bracket, offline sync readout, checkpoint quarantine, Match coaching lock, Help drawer keyboard/a11y) was QA-passed in a real browser. Browser-verify surfaces you touch from here on.

## Responsibilities

- **Human coach:** sets practice goals, reviews corrections, approves examples, and selects checkpoints.
- **Coaching model:** translates feedback into structured, reviewable examples. It is not the live match policy and cannot mutate a scored match.
- **Competitor policy:** selects targets, routes, and supported interventions from permitted observations.
- **Shared controller:** performs navigation and steering. Its engineered behavior must not be attributed to model training.
- **Match authority:** owns time, observations, action validation, costs, scoring, termination, and replay records.

Practice may accept chat and demonstrations. Scored matches reject human control, weight changes, and external inference. Convex synchronization belongs to the application, not to the entrant's capabilities.

## Target Observation Contract

Version and validate the schema before publishing a starter. The initial interface is structured spatial state, not raw rendered pixels.

| Field group | Intended contents |
| --- | --- |
| Episode | Match identifier, rules/schema versions, simulation tick and time remaining. |
| Self | Position, relevant motion state, energy, cargo, active objective, and cooldowns. |
| Routes | Public waypoint topology, traversability, and current route costs aligned to the actual collider. |
| Targets | Permitted resource and base identifiers, positions, values, and availability. |
| Rivals | Only information allowed by the same visibility rules for all entrants. |
| Environment | Current weather and physical hazards, not future random events. |
| Actions | Currently available action choices and relevant constraints. |
| Feedback | Previous accepted action, completion status, or explicit rejection/failure reason. |

Do not expose evaluation seeds, future state, another policy's private memory, credentials, or direct references to mutable simulation objects. Bind competitor identity in the runner rather than trusting an identity supplied by a policy.

## Target Action Contract

The learned action is a route or target choice conditioned on the observed world, objective, and arena state. The bounded action vocabulary should support:

- selecting a legal target or returning to base;
- selecting a route or waypoint for the shared controller;
- using the one supported weather intervention when affordable and available;
- continuing or waiting when no new action is required.

These are design requirements, not existing method names. Freeze the exact vocabulary, identifiers, schema, and decision budget with the initial policy architecture. All competitors use the same contract and controller.

The action vocabulary must be rich enough to express the arena's decision space. With multiple resources, multiple flood zones, and energy budgeting, the policy must be able to select between meaningfully different targets and routes — not just "take the low road" vs "take the high road." If the action vocabulary can be reduced to a binary choice, the arena is too simple. The vocabulary should be frozen before evaluation, but it should be frozen at a level of expressiveness that matches the arena's complexity, not at a minimal level that makes the learning trivial.

The authority validates actions against the applicable tick, target validity, energy, cooldowns, and ownership. Stale, malformed, illegal, or late actions need documented deterministic handling and must not silently bypass limits. Choose and test the failure policy before evaluating entrants.

## Training and Artifact Contract

Season 0 uses a small supported policy architecture and a common starting checkpoint. Fine-tuning that checkpoint is allowed. The player-facing app and builder starter must produce the same entrant format.

Required properties:

- Every coaching correction identifies the recorded situation, original action, preferred legal action, and source episode/tick.
- User-approved examples are distinguishable from drafts and generated expansions.
- Training changes policy parameters and writes a new checkpoint rather than mutating an active match.
- A manifest identifies the parent, resulting weights, model/schema/rules versions, dataset, training configuration, and evaluation records.
- Weights are data only. Reject unsupported architectures, tensor shapes, non-finite values, oversized artifacts, incompatible versions, executable deserialization, and custom code.
- Reset any supported bounded policy memory per episode. Freeze weights throughout a scored match.
- Never present a prompt change, rule patch, or coaching acknowledgment as fine-tuning.

The concrete model is a 2-layer MLP (36 inputs → 32 → 16 → 8 action classes) with Tanh activations, a softmax action distribution, and supervised cross-entropy training with momentum SGD; checkpoint v3 adds a linear residual edge-pointer head that ranks same-class roads over the shared executor heuristic. The `PolicyCheckpoint` format (`season-0.checkpoint.v3`; v1/v2 metadata-readable, execution-quarantined) is JSON data only and is validated for shape, finite values, and schema version before loading. The training host is the same JavaScript runtime as the app/CLI, not a remote GPU service. The exact hyperparameters and action-class mapping are frozen and pinned by `versions.test.ts` (docs/COMPATIBILITY.md §3); do not change them without bumping the schema/rules versions.

## Simulation and Evaluation Rules

- Fixed-step gameplay and physics are separate from renderer frame rate and policy decision cadence.
- Use simulation time for gameplay timers, costs, and degradation.
- Version and record rules, world assets, collider, route graph, runtime configuration, and checkpoint.
- Use the same simulation and policy contract in practice, local evaluation, and rendered matches.
- Separate training from held-out scenarios. Compare versions on matched scenarios and report failures as well as scores.
- Record state snapshots and accepted actions for reliable replay; a random seed alone does not prove cross-platform determinism.
- The browser is a presentation/development environment, not evidence of production-grade ranked-match isolation.
- Readable action logs are evidence of decisions and outcomes, not access to a model's hidden reasoning.

## Existing Code Boundary

The new reference modules are:

- `services/arenaEpisode.ts`: validated scenario and action types, detached observations, budget/resource rules, round termination, reset, and recording.
- `services/arenaPolicy.ts`: safe/greedy/weather reference routing, a `learned` strategy that loads a `PolicyCheckpoint`, a house-only `poach` pacing rival (live matches; steered by a director hint to the champion's destination so encounters actually occur — never used in evaluation or tournament entrants), and a pinned `ArenaRunner` advanced through explicit ticks or integer microseconds.
- `services/arenaReplay.ts`: version-checked replay with mandatory state checkpoints and divergence reporting.
- `services/worldSurface.ts`: world-space static collider extraction, downward surface queries, and bounded route-grounding checks.
- `services/arenaPhysics.ts`: Rapier 0.19.2 kinematic rigid body with terrain-following pitch/roll, wall collision via ray casts, grounding, reset, recovery, and controller version tracking.
- `services/arenaCourse.ts`: authored `Sandstone Basin / Course 01` loader with pinned terrain SHA-256, scenario construction, and a rich route graph (12+ nodes, 25+ edges, multiple resources, multiple flood zones) embedded in the terrain.
- `services/arenaTerrain.ts`: shared validated loader for the pinned terrain GLB (fetch, size budget, SHA-256, parse, abort disposal) used identically by physics collider extraction and rendering.
- `services/arenaPresentation.ts`: pure geometry helpers for route ribbons used by the scene and tests.
- `services/presentationPacing.ts`: first-run playback defaults. Unranked Practice / Rush / Skirmish Plays start at 4× until the player cycles speed (persisted in localStorage); scored Match is never auto-bumped. Presentation only — does not change Season 0 tick budgets or Match evaluation.
- `services/arenaCinematic.ts`: deterministic storyboard planner that partitions a recording into event-driven shots (establish/flood/collect/bank/recovery/follow/finish) for the review-mode replay-cam; see `docs/SCENES.md`.
- `services/arenaSession.ts`: application adapter that wires start/pause/reset, policy locking, bounded frame pumping, replay scrubbing, checkpoint selection, external-recording review (`reviewFrom`), and JSON export.
- `services/arenaTournament.ts`: seeded single-elimination bracket over headless matches; entrants map onto champion/rival slots, each match runs on isolated physics and keeps its own `ArenaRecording` for cinematic review.
- `services/policyModel.ts`: `PolicyCheckpoint` schema, 36-dimensional observation encoding, 8-class action mapping, v3 edge-feature encoding + residual edge ranking, MLP forward/inference, and checkpoint validation.
- `services/policyTrainer.ts`: supervised cross-entropy backpropagation with momentum SGD, dataset hashing, and scenario evaluation.
- `services/coachingEngine.ts`: natural-language and rule-based proposal of reviewable `ArenaTrainingExample` corrections.
- `services/coachingReview.ts`: recorded-replay coaching context (`recordedCoachContext` returns the pre-decision observation, accepted original action, and legal alternatives at a replay frame) plus `draftRecordedCorrection` for reviewable human correction drafts.
- `services/matchTimeline.ts`: deterministic forecast of presentation beats (contested ground, floods, banks, rescues, finish) used by the director and BeatTimeline; advisory only, never scoring input.
- `services/practiceComparison.ts`: frozen parent/child practice evidence (`comparePracticeCheckpoints` re-runs both checkpoints headlessly on the same practice scenario and rival through isolated instances of the live controller/physics; `comparisonFrameAt` samples sparse/nonuniform recordings by actual checkpoint ticks).
- `services/behaviourDelta.ts`: pure reduction of two champion decision traces into what actually changed — decisions moved, action-class shifts, and rejection deltas (`summarizeBehaviourChange`, `describeBehaviourChange`). Makes the trained checkpoint legible in the lesson card instead of leaving the player with a loss number. Derived from comparison evidence already collected; never touches the sim.
- `services/liveCall.ts`: the mid-race coaching verb. `liveCallContext` decides when an unranked run offers "call the next route" and which alternatives are legal, reading `observation.availableActions` as the authoritative legal set (running candidates through `applyControllerRules` instead would collapse every proposal to `wait` off a decision tick and silently yield zero options). Choosing a route strongly applies for the rest of that run via destination-sticky preference (`resolveLiveCallPreference` + `wrapPolicyWithLiveCall`) and still saves a Train lesson; scored Matches stay locked.
- `services/trainingProtocol.ts` + `services/trainingWorker.ts` + `components/utils/useCoachingWorker.ts`: the off-thread coach path. Training (60 epochs), both practice comparison matches, and the beat forecast run in a worker so the canvas never stalls at the payoff moment. The worker rebuilds its own Rapier world from the pinned terrain GLB (hash-verified) and caches it across jobs rather than structured-cloning collider arrays per run. Worker CPU output must stay bit-identical to the main-thread path — the eval gate is what proves it.
- `services/arenaSound.ts`: quiet native Web Audio cues (no assets) that stay muted until an explicit gesture, dedupe by match/tick/action, and stay silent in review/training/headless phases.
- `services/checkpointStorage.ts`: browser `localStorage` persistence, JSON import/export, and validation.
- `services/arenaBroadcast.ts` + `services/orbisDirector.ts` + `services/reactorToken.ts`: the Orbis AI-video broadcast stage (docs/SCENES.md). `arenaBroadcast` compiles recorded-fact triggers (storyboard shots in review, live snapshot diffs in play) into anchored initial / "same unbroken scene" delta prompts; `orbisDirector` rate-limits dispatch to Orbis chunk cadence and coalesces by drama priority; `reactorToken` + `app/api/reactor/token` keep `REACTOR_API_KEY` server-side behind a bounded session grant. Presentation only — nothing it emits re-enters a match, observation, or evaluation.
- `services/syncEngine.ts` + `services/arenaStore.ts`: offline-first sync against `convex/sync.ts` (LWW on client `updatedAtMs`, server-clock `serverSeenAt` ordering, tombstones, persisted outbox). localStorage is a write-behind cache, not the source of truth, whenever Convex is configured. `ArenaScene.tsx` is the composition root; workbench panels live in `components/workbench/*` and the next-step guidance machine is pure in `services/workbenchFlow.ts`.
- `services/ladderRunner.ts`: server-authoritative ladder evaluation (`buildLadderContext` hash-pins the terrain GLB, `runLadder` re-plays a checkpoint on hidden seeds against the house bots) plus the shared league primitives — `runMatch(a, b, base, seed)` races two stored brains on one hidden Rush variant from both sides and re-simulates both recordings before returning them, and `legalLeagueBuild`/`traitsForBuild` are the build gate every scored path uses (flat cap via `validateBuild` plus the escalating point-buy curve via `budgetSpent`).
- `services/replayMarkers.ts`: pure reduction of an `ArenaRecording` into attribution markers (`bump`, `core-spawn`, `battery-out`, `recovery`, `bank`) stored on the replay row; unknown future event types fall through to a generic marker (raw type, first `*Id` field as subject, scalar fields as note) rather than being dropped.
- `convex/league.ts` + `convex/leagueRun.ts` + `convex/crons.ts`: the league backend (docs/LEAGUE_PLAN.md, Stream C). `league.ts` holds brains/challenges/replays/rounds queries and the internal write mutations — every identity is server-derived; `leagueRun.ts` ('use node') runs `publish`, `challenge` and the scheduled `runRound`, fetching and hash-checking the pinned terrain before any match. Replays are ~1 MB JSON in Convex file storage addressed by a public `shareId` slug (`league.viewReplay`); rows are append-only. `?replay=<shareId>` on the app URL loads a stored match straight into review.
- `services/chassis.ts` + `services/buildBudget.ts`: chassis/ability contract and the build screen's helpers. `validateBuild` is the *flat* legality check (stat cap, axis ranges, module slots); the escalating marginal cost (`budgetSpent`) is enforced separately by the match authority — a hand-authored build may satisfy `validateBuild` yet be over the curve, and `describeBuildSummary` reports that honestly rather than throwing. `buildToTraits` caps `travelSpeed` at `MAX_TRAVEL_SPEED` (1.33) so every chassis stays inside `ROVER_PHYSICS.maxSpeed` (2.4).
- `services/trainingConfig.ts` + `components/workbench/TrainingControls.tsx`: Stream B training knobs (generations, population, mutation, hub prior, scenario mix) — validated/serialised config persisted to localStorage by `ArenaScene` and consumed by `policyTrainer`/`policyModel`, distinct from the frozen 60/0.008/decay pin on the Train button.
- `services/forge.ts` + `convex/forge.ts`: Stream D Forge-your-champion backend. `forge.start` reserves credits atomically (per-account limit + global credit cap) and calls Tripo server-side with `TRIPO_API_KEY`; a scheduled `poll` moves `pending` → `ready`/`failed` and refunds on failure. Chassis/paint come from fixed menus — no free prompts. Convex-only; never call the real Tripo API from tests.
- `services/chassisAssets.ts`: resolves the Tripo chassis GLB per entrant (chassis body → legacy rover → procedural fallback). `ArenaWorldView` accepts a `chassisByEntrant` prop, but no call site passes it yet — every rover still renders its legacy model.

### Workbench disclosure state (pure, tested)

Three pure modules decide *how much of the workbench is showing*, because playtest
feedback was that the landing view carried so many simultaneous instructional surfaces
that people could not parse them. They hold no refs and touch no storage — the render
path maps their output onto flags — so the ordering is unit-testable rather than
discovered by reading JSX. All three are monotonic: a returning player must never lose
access to something they have already unlocked.

- `services/engagement.ts`: engagement depth from two signals (has the player finished a
  run, do they own a brain). Gates the broadcast CTA, rules paragraph, tournament, agent
  cards, camera switcher and run utilities. The hero progress rail is permanently `false`
  — the next-step bar already names the single next action, so the rail only restated it.
- `services/coachPanelView.ts`: the Coach panel ladder. With an empty queue the guidance
  block opens and leads, because it is the only way to make progress; with a queue in
  front of the player it collapses behind a one-line hint. Also decides whether sync
  trouble is loud or quiet — a cloud problem is never the player's mistake and must not
  outrank the Approve/Train buttons above it.
- `services/workbenchFlow.ts`: the next-step label/action machine. After Train,
  `hasUnwatchedComparison` attaches an optional "See what changed" CTA beside the
  primary next-step (Play / Clash again) — comparison stays available but never
  forces another watch as the sole next action.

`services/engagementProgress.ts` persists the two engagement signals to localStorage.
Deliberately not synced: a shared browser unlocking the advanced surface is harmless, and
keeping it out of the Convex payload avoids growing the sync schema for a cosmetic
preference. Do not put the comparison recordings there either — two 241-frame
`ArenaRecording`s are far too large to persist; `divergenceFrameIndex` plus the in-worker
re-derivation is the intended pattern.

Two naming rules follow from this and are worth preserving: the control-bar button is
**Lessons**, not "Coach", because the 3D route picker in Replay is also a coaching
surface and two controls called Coach left it unclear which one was about to open; and
player-visible surfaces use `friendlyActionLabel`/`routeLabel`, never raw edge ids
(`move · cross-vn-cn`), which are an internal detail the player never chose.

- `starter/train.ts`: standalone CLI that runs evaluation, collects examples, trains, and exports a checkpoint (abstract syllabus only — the simple builder path). The bundled first-run artifact is regenerated by `scripts/build-starter.ts`, which trains on the grounded distillation syllabus (`buildSyllabusExamples` with the pinned collider) and compares against the incumbent before overwriting `starter/champion-checkpoint.json`.

They use `season-0.reference.3` for simulation rules and `season-0.checkpoint.v3` for checkpoint data, not finalized competition rules. Motion is now resolved by Rapier from a proposed target along grounded edges; nominal route time is not sufficient for arrival. The runner does not execute uploaded code or hosted inference, but it does run the in-process learned MLP from a validated checkpoint. Tests cover the actual committed collider, synthetic fixtures, encoding, training, and checkpoint I/O. Grounding checks do not certify wheeled dynamics or full swept collision.

Extend these modules rather than creating a second episode engine. Keep the full recording, including its private scenario seed and weather schedule, separate from the limited policy observation. Do not treat replay-state equality as a cryptographic or anti-cheat guarantee.

The legacy `services/AgentProtocol.ts` (`window.clawdy`, `clawdy:state`) has been deleted; git history holds it. Do not reintroduce it as the main path.

The current vehicle command uses low-level forward/turn/brake inputs. The reference episode does not expose those; it uses `move`/`collect`/`bank`/`drain`/`wait` actions resolved by the shared controller.

Do not retain wallet authorization, chain selection, bidding, rental, or financial-provider calls in the new entrant interface. The existing browser API is not an authenticated external-agent service or a safe competition boundary.

## Implementation Discipline

1. Read the canonical plan before changing product behavior.
2. Work through its ordered milestones; a stable world and episode precede a training UI.
3. Consolidate owning modules instead of stacking new adapters around retired behavior.
4. Update callers, imports, configuration examples, scripts, and tests when retiring a subsystem. Do not change security policies or bypass verification to make the pivot pass.
5. Preserve required third-party attribution. Git history preserves old product plans; do not maintain conflicting active instructions.
6. Keep implementation-status statements accurate. Assets or interfaces in the repository do not prove a working release.
7. Treat paid generation, external deployment, destructive removal, and service shutdown as separate actions requiring the appropriate approval. Product retirement alone is not authorization to destroy external data or infrastructure.

## Verification

Existing root commands:

```bash
npm run lint
npm test
npm run build
```

CI currently uses Node.js 20 and npm and carries no chain environment settings; the legacy chain/Marble environment examples were retired on September 26, 2026. Reference tests now cover episodes, actions, timing, replay, world queries, terrain loading and grounding, route-ribbon geometry, cinematic storyboards, seeded tournament brackets and external-recording review, scenario guards, encoding/training, checkpoint I/O, and public configuration; they do not verify the complete application in a browser.

For implementation changes, extend the reference tests and add coverage for training updates, artifact validation, and held-out evaluation as those systems are implemented. Earlier `agent-browser` checks (page load, splat world render, start/pause/review, 375×812 reflow) applied to the retired Marble world. No browser QA ran for the Sandstone Basin pass; re-verify loading, framing, and layout when browser scope resumes. Remaining browser work: complete the full coaching/training round-trip and stress loading/retry on lower-end devices.

Coaching-first update (September 30, 2026): controls precede the arena; Practice replay corrections use the recorded pre-decision observation and accepted action, with explicit draft/approval/training. Keyword guidance is secondary and limited; automatic pickup and full-cargo return are shared-controller behavior, not learned skill. Proximity cues are non-scoring. The new practiceComparison service captures parent/child runs on the same practice scenario and rival, with isolated instances of the live controller/physics. LessonComparison presents recorded scores and different accepted decisions; PracticeGhost is presentation-only. These practice comparisons do not establish held-out improvement or ranked readiness. The arena graph, global flood behavior, model architecture, rule/schema versions, trainer settings, and evaluation pin are unchanged.

Code verification: 20 focused comparison/correction/timeline tests and 24 focused audio/panel/learning tests passed; TypeScript and production build passed; lint had zero errors and five warnings. The full suite has not been rerun after the latest revisions. Further browser automation was stopped at the owner's request; revised 3D route selection, ghost comparison, final layout, and mobile behavior are not fully browser-verified.

Follow-up hardening (Sep 30): checkpoint import now goes through `readCheckpointFile` (FileReader + abort signal + live predicate re-check on completion), and training holds a synchronous `trainingBusyRef` so a delayed read can't adopt a brain mid-train; `ArenaSound` reports resume/construction failures through `onUnavailable` instead of leaving the UI claiming Sound on. Verified with `npx vitest run services/__tests__/checkpointStorage.test.ts services/__tests__/arenaSound.test.ts services/__tests__/workbenchPanels.test.ts` (3 files / 39 tests passed), `npx tsc --noEmit` (clean), targeted ESLint on the changed files (0 errors, 1 pre-existing exhaustive-deps warning), and a production `npm run build` (clean).

For documentation-only work, check the diff for whitespace errors, local links, contradictory product claims, unsupported commands, and planned-versus-implemented wording. Do not report application tests as passing unless they were run.
