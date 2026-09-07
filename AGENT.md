# Clawdy Agent Contract and Implementation Instructions

## Binding Direction

As of September 5, 2026, Clawdy is an **agent-training league in a generated physical world**. The authoritative product and execution plan is [docs/HACKATHON.md](docs/HACKATHON.md).

The loop is **watch → coach → approve examples → train → compete → replay → improve**. Chat is the coaching interface. A real policy update makes coaching persist. Frozen checkpoints compete without human help.

The old human-driving-first arena, onchain economy, wallet/session permissions, financial agent roles, and separate Marble pivot are retired. Do not extend those products, preserve their APIs for compatibility, or introduce a parallel game. Reuse useful rendering, physics, weather, and state primitives; replace or retire everything else as its dependencies are removed. Historical behavior is available in Git.

This is the target contract and implementation guide. The application entrypoint runs `ArenaScene` / `ArenaWorldView` with the same `ArenaEpisode`, `ArenaPhysics`, and `ArenaSession` used in headless tests, plus a `Coach & Train Studio` that proposes examples, trains a small MLP checkpoint in-browser/CLI, and exports/imports `PolicyCheckpoint` artifacts. The full loop is wired, but held-out evaluation, browser rendering, and a starter that produces a measurable improvement are still being hardened. Browser testing is deferred at the project owner's request; continue with code and non-browser tests until that scope changes.

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

The first learned action is a route choice conditioned on the observed world and objective. The bounded action vocabulary should support:

- selecting a legal target or returning to base;
- selecting a route or waypoint for the shared controller;
- using the one supported weather intervention when affordable and available;
- continuing or waiting when no new action is required.

These are design requirements, not existing method names. Freeze the exact vocabulary, identifiers, schema, and decision budget with the initial policy architecture. All competitors use the same contract and controller.

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

The concrete model is a 2-layer MLP (24 inputs → 32 → 16 → 8 action classes) with Tanh activations, a softmax action distribution, and supervised cross-entropy training with momentum SGD. The `PolicyCheckpoint` format (`season-0.checkpoint.v1`) is JSON data only and is validated for shape, finite values, and schema version before loading. The training host is the same JavaScript runtime as the app/CLI, not a remote GPU service. The exact hyperparameters and action-class mapping must still be frozen and documented; do not change them without bumping the schema/rules versions.

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
- `services/arenaPolicy.ts`: safe/greedy/weather reference routing, a `learned` strategy that loads a `PolicyCheckpoint`, and a pinned `ArenaRunner` advanced through explicit ticks or integer microseconds.
- `services/arenaReplay.ts`: version-checked replay with mandatory state checkpoints and divergence reporting.
- `services/worldSurface.ts`: world-space static collider extraction, downward surface queries, and bounded route-grounding checks.
- `services/arenaPhysics.ts`: Rapier 0.19.2 kinematic spherical rover proxy, static-world collision, grounding, reset, recovery, and controller version tracking.
- `services/arenaCourse.ts`: authored `Cloudbank / Course 01` loader with pinned collider SHA-256 and scenario construction.
- `services/arenaSession.ts`: application adapter that wires start/pause/reset, policy locking, bounded frame pumping, replay scrubbing, checkpoint selection, and JSON export.
- `services/policyModel.ts`: `PolicyCheckpoint` schema, 24-dimensional observation encoding, 8-class action mapping, MLP forward/inference, and checkpoint validation.
- `services/policyTrainer.ts`: supervised cross-entropy backpropagation with momentum SGD, dataset hashing, and scenario evaluation.
- `services/coachingEngine.ts`: natural-language and rule-based proposal of reviewable `ArenaTrainingExample` corrections.
- `services/checkpointStorage.ts`: browser `localStorage` persistence, JSON import/export, and validation.
- `starter/train.ts`: standalone CLI that runs evaluation, collects examples, trains, and exports a checkpoint.

They use `season-0.reference.2` for simulation rules and `season-0.checkpoint.v1` for checkpoint data, not finalized competition rules. Motion is now resolved by Rapier from a proposed target along grounded edges; nominal route time is not sufficient for arrival. The runner does not execute uploaded code or hosted inference, but it does run the in-process learned MLP from a validated checkpoint. Tests cover the actual committed collider, synthetic fixtures, encoding, training, and checkpoint I/O. Grounding checks do not certify wheeled dynamics or full swept collision.

Extend these modules rather than creating a second episode engine. Keep the full recording, including its private scenario seed and weather schedule, separate from the limited policy observation. Do not treat replay-state equality as a cryptographic or anti-cheat guarantee.

`services/AgentProtocol.ts` still exposes the legacy `window.clawdy` and `clawdy:state`. Its `WorldState` contains vehicles, assets, bounds, and a wall-clock timestamp. The active page no longer uses it; retire or reshape it around the new authority rather than reintroducing it as the main path.

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

CI currently uses Node.js 20 and npm. Legacy chain environment settings in CI and the existing environment examples are consolidation work, not Season 0 requirements. Reference tests now cover episodes, actions, timing, replay, world queries, and public configuration; they do not verify a learned policy or the complete application.

For implementation changes, extend the reference tests and add coverage for training updates, artifact validation, and held-out evaluation as those systems are implemented. Browser scope was approved; `agent-browser` verified the page loads, the splat world renders, the run starts/pauses/reviews, and the layout reflows at 375×812. Remaining browser work: complete the full coaching/training round-trip and stress loading/retry on lower-end devices.

For documentation-only work, check the diff for whitespace errors, local links, contradictory product claims, unsupported commands, and planned-versus-implemented wording. Do not report application tests as passing unless they were run.
