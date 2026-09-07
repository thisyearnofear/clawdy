# Clawdy: Train Your Champion

## Decision and Authority

**Accepted direction: September 5, 2026.** This is the single authoritative product and implementation plan for the repository and the Spatial Intelligence + Generative 3D Hackathon.

Clawdy is an agent-training league in a generated physical world. People develop autonomous competitors through coaching and training, then watch frozen versions compete without intervention.

> Teach an agent your approach. Watch it use what it learned when you are no longer allowed to help.

The previous human-driven arena, onchain economy, wallet/session-permission product, named financial agent roles, and Marble-only pivot are retired. They are not alternative modes, compatibility requirements, or fallback product directions. Existing code is material to salvage or replace, not a requirement to preserve the old experience. Git history holds the previous approach.

This document locks the direction; it does not claim the learning loop has been implemented. The documentation consolidation does not remove legacy runtime code, dependencies, configuration, or deployed services.

## Event and Track

- Event: Spatial Intelligence + Generative 3D Hackathon, September 5, 2026, San Francisco.
- Track: **Gaming & Interactive Worlds**.
- Submission deadline in the supplied event brief: 6:00 PM Pacific; two-minute demos run 6:00–7:00 PM. Confirm any schedule updates with the organizers.
- Event technologies: World Labs, Tripo, Mint, and Convex.
- The project owner reports organizer approval to reuse this repository. Disclose the pre-existing foundation and identify the work completed for this event.
- Work is organized as ordered milestones for a solo build, not parallel collaborator workstreams.

## Product Thesis

The player develops the competitor rather than manually driving through a conventional game with AI opponents. The loop is:

**Watch → coach → approve examples → train → compete → replay → improve.**

Conversation is the coaching interface. Training makes approved coaching persist in the policy. The physical world provides consequences, constraints, and a visible test of competence.

The distinguishing moment is not an agent saying it understands. It is a new checkpoint behaving differently in an unseen scenario, without another instruction. A changed route, a successful recovery, or a better-timed weather intervention is the evidence.

### Product Modes

| Mode | Human role | Agent and world behavior |
| --- | --- | --- |
| Practice | Give goals, demonstrate, pause, and correct decisions. | A known checkpoint acts; observations, actions, and outcomes are recorded. |
| Coaching and training | Review proposed examples, approve or reject them, then train. | An actual learning algorithm updates policy parameters and creates a versioned checkpoint. |
| Match | Select an entrant, start, and watch. | Frozen checkpoints act under common rules; coaching and manual overrides are disabled. |
| Review | Inspect the replay and compare versions. | Recorded actions and state explain what happened; selected mistakes can become practice corrections. |

A practice instruction may immediately redirect an agent, but that is not evidence of learning. The UI must distinguish a live instruction from a change saved through training.

### Two Entry Paths, One Entrant Format

- **Player path:** coach through the application and train from approved examples.
- **Builder path:** use a starter to inspect observations, collect data, train supported policies, and evaluate locally.

Both produce the same validated policy artifact and use the same match rules. Builder source code runs in the builder's development environment, not as arbitrary uploaded code on the competition host.

## Season 0 Scope

Season 0 is a learning-focused exhibition and starter, not a production tournament platform.

### The Physical Challenge

Start with one compact, validated world, one coached rover, and one autonomous rival. Resources must be collected and returned to a base before the round ends. A short low route and a longer elevated route create a tradeoff as flooding changes traversal. One temporary drain ability costs finite in-game energy and can open the low route for either competitor.

- The result is based on banked resource value at the deadline; equal scores are a draw.
- Vehicle capabilities, initial budgets, collection rules, and ability costs are common to competitors.
- Resources and energy are game values, not tokens or real money.
- The initial learned behavior is route selection conditioned on flooding and the objective.
- The first round length, resource values, energy costs, and decision budgets must be measured and frozen in versioned rules before evaluation results are compared.
- The course is a testbed for learning. It is not a separate Storm Run product or a commitment to build a large racing game.

Do not implement every possible mechanic. The first acceptance target is one decision that can genuinely improve through training. Additional learned targets or weather strategies come only after that loop works.

### Learning Contract

Use a small, fixed-architecture decision policy, a shared starting checkpoint, and supervised updates from approved state/action examples for the first implementation. Fine-tuning the shared starting policy is explicitly allowed. A builder should not need hosted inference or a GPU to enter a scored match.

Select the concrete architecture, training runtime, serialization format, tensor limits, and training resource budget through a minimal training/inference experiment. These are implementation decisions still to be made, not installed capabilities. Freeze them before producing compatible entrant artifacts. Do not start by fine-tuning an LLM or training steering from pixels.

The coaching language model proposes structured corrections. It does not directly execute unreviewed code or update match state. Show the observed situation, chosen action, preferred legal action, and context of the correction. If the system expands a correction into generated examples, label their provenance and let the user inspect them.

A training result must include:

- parent checkpoint and resulting weight hashes;
- architecture, observation, action, and rules versions;
- approved training-example identifiers and dataset version;
- training configuration and seed;
- evaluation results, scenario identifiers, and failure counts;
- enough metadata to reproduce the experiment in the supported runtime.

A changed hash proves an artifact changed, not that it improved. A saved prompt, rule edit, preference slider, or scripted reaction must never be presented as a weight update. Training from scratch is training; updating an existing trained policy is fine-tuning. Neither guarantees improvement.

### Competitive Boundaries

- Scored matches freeze weights and initial policy configuration for their duration.
- No chat intervention, human steering, hosted inference, or external network access by the entrant during a scored match.
- The application may synchronize match events; that does not grant the policy network access.
- Every entrant receives the same permitted class of observations and legal actions.
- Per-match policy memory, if supported, is bounded and reset at match start. Do not allow cross-match hidden learning or weight mutation.
- Season 0 accepts weights for the supported architecture, not arbitrary Python, JavaScript, native binaries, custom executable model operators, or remotely invoked agents.
- Validate format, tensor shapes, finite numeric values, size, versions, and compatibility. Use a data-only loader; do not deserialize executable objects.
- Score validation belongs to the match authority. A browser-reported score is not proof of a trustworthy ranked result.
- Public ranked competition and unrestricted bring-your-own-code hosting require separate infrastructure and review; they are outside this hackathon scope.

## Agent and Simulation Architecture

The protocol contract is defined in [AGENT.md](../AGENT.md). Implement one simulation and policy interface, shared by practice, evaluation, and the rendered match.

```text
Coaching UI or builder workflow
  → reviewed state/action examples
  → training job
  → validated checkpoint + manifest
  → frozen policy runner
  → bounded decisions
  → shared navigation and vehicle controller
  → fixed-step world simulation and action validation
  → observations, results, and replay records
  → rendered world and review UI
```

### Ownership

| Layer | Responsibility |
| --- | --- |
| Coach | Translate human feedback into proposed, reviewable training examples. |
| Learned policy | Choose meaningful targets, routes, and eventually weather interventions. |
| Shared controller | Execute a selected route or action using reliable navigation and vehicle control. |
| Match authority | Own time, permitted observations, action validation, costs, physics, scoring, and termination. |
| Renderer | Present the simulation; camera movement and frame rate must not change outcomes. |
| Convex | Persist and synchronize ownership, examples, job status, checkpoint metadata, match events, and results. |
| Artifact storage | Hold checkpoint data, replay snapshots, and larger assets with explicit ownership and access controls. |

Convex is not the physics loop or automatically a training compute service. Choose the training execution host separately and keep policy execution independent of real-time database latency.

### Spatial Interface

For Season 0, provide structured observations: self state, legal targets, public route topology and current traversal costs, visible rival information, current weather, ability availability, and previous action outcomes. An authored navigation graph aligned to the actual collider is acceptable and must be disclosed. Do not claim general understanding of arbitrary splat worlds or visual end-to-end control.

Do not expose future random events, held-out evaluation seeds, another policy's internal state, or unrestricted world mutation. The actor identity is bound by the runner, not accepted as a self-asserted payload field.

### Simulation and Replay Requirements

- Separate a fixed physics/simulation step from a bounded policy-decision cadence and display frame rate.
- Use explicit simulation time for gameplay timers and energy/vitality changes.
- Seed scenario randomness; do not rely on untracked wall-clock or random calls for scored behavior.
- Version the world assets, colliders, route graph, physics/runtime configuration, and scoring rules.
- Record observations or their reproducible inputs, submitted and accepted actions, rejection reasons, state snapshots, termination, and results.
- Use recorded state for reliable replay. A seed alone does not establish cross-device physics determinism.
- Evaluation runs must use the same controlled simulation/runtime configuration. The local harness and rendered experience must not implement different game rules.
- Reset all episode state, pending commands, timers, and bounded policy memory between runs.

## Starter and Evaluation

The [AI Chessathon starter](https://github.com/advitrocks9/aichessathon-starter) is inspiration for the development loop, not a dependency or the Clawdy rulebook. Its model rules differ from ours: it permits classical agents, does not require a network, and prohibits using a published chess network as the starting point. Its local subprocess harness is not a production security sandbox. If source is reused, retain its MIT attribution and review it independently.

The Clawdy starter is planned; no starter package or training CLI is shipped by this documentation update. The first version should support:

| Workflow | Required outcome |
| --- | --- |
| Play | A complete match with the unchanged starter checkpoint. |
| Collect | Demonstrations and approved corrections in the versioned example schema. |
| Train | A real new checkpoint and training manifest. |
| Evaluate | A batch comparison against baselines and the previous checkpoint. |
| Replay | Inspectable actions, physical consequences, and failures. |
| Package | A validated data-only entrant artifact and compatibility manifest. |

Provide a legal random policy for smoke testing, a competent safe collector, and a weather-aware baseline. Handwritten reference bots are allowed as disclosed house baselines; they are not examples of learned improvement. Do not weaken opponents to manufacture a result.

Separate practice/training scenarios from held-out evaluation. Vary resource placement, start positions, and weather timing within the validated world. Compare versions on matched scenarios, swap starting sides where applicable, and report sample counts, ties, crashes, invalid actions, and timeouts. Fix evaluation rules and failure handling before comparing checkpoints. A selected replay illustrates a result; it does not replace aggregate evaluation.

If a reviewed match becomes coaching or training material, move its scenario into the development/training set and exclude it from subsequent held-out claims. Repeatedly tuning against a benchmark also makes it a development benchmark. Reserve an untouched final scenario set for the reported comparison, and record the split with each evaluation.

## Sponsor Integration Plan

All roles below are planned unless the status table explicitly identifies existing assets or code. Credit only tools and outputs actually used.

| Technology | Intended role | Visible evidence |
| --- | --- | --- |
| World Labs | Generate the environment used for practice and matches. | An agent traverses a recognizable generated world with validated collision and routes. |
| Tripo | Generate the champion rover and readable resource or objective objects. | Distinctive bodies and interactive objects; imported visuals use shared gameplay physics. |
| Mint | Generate functional course pieces and assist with assembling playable interactions. | A gate, ramp, or weather-control object affects traversal rather than serving as unrelated decoration. |
| Convex | Connect coaching data, training-job status, checkpoint metadata, match records, and replay access. | An approved correction, new checkpoint, and resulting match are linked in the UI. |

Freeze and package generated assets before the demo. Asset generation is not on the match's critical path. Check generated models for scale, pivot, texture cost, licensing, collision alignment, and browser performance. Mint and Tripo have distinct content roles; using both must not multiply unrelated scope.

## Current Repository Status

**Third implementation slice: training and checkpoint pipeline wired into the main page and a standalone starter CLI.** The starter CLI trains on three practice builder scenarios and evaluates on three held-out variants; the policy demonstrates generalization. Browser QA confirmed the page loads, the splat world renders, the run starts/pauses/reviews, and the layout reflows on a mobile viewport. The Mint runtime loader is wired but no Mint MCP server is connected yet.

| Area | Current state | Next requirement |
| --- | --- | --- |
| Episode authority | `services/arenaEpisode.ts` owns validated actions, resources, budgets, results, and reset. It supports optional physical motion and deterministic replay. `services/arenaScenarios.ts` now provides the practice/held-out split and `rejectEvaluationExamples` guards it. `ArenaScene` disables coaching on evaluation scenarios. | Add more diverse evaluation scenarios and a scenario-selector UI. |
| Physical controller | `services/arenaPhysics.ts` uses Rapier 0.19.2 with a kinematic spherical rover proxy, static-world sweeps, grounding, bounded speed, and reset/disposal. Blocked movement triggers a recorded recovery. Browser QA confirmed the rover moves and the camera follows. | Further adversarial course coverage and deeper mobile physics testing. This is not wheeled vehicle dynamics. |
| Versioned course | `services/arenaCourse.ts` grounds six stations and seven connections against the committed collider. Its loader checks the collider SHA-256 and rejects mismatches. All seven edges pass traversal tests in both directions. Browser QA confirmed the course renders over the splat. | Validate a second course/collider version and Mint-generated world colliders when available. Course 01 is public practice, not a held-out evaluation set. |
| Baselines and learned policy | `services/arenaPolicy.ts` supports safe, greedy, weather, and `learned` (`PolicyCheckpoint`) strategies. The learned MLP runs through `createLearnedPolicy`. Trained from 42 demonstrations across three practice seeds, it banks 12 on practice and 4/4 on each of three held-out scenarios. | Add more diverse held-outs and verify the MLP on non-builder course graphs. |
| Replay and session | `arenaReplay.ts` verifies controller/rules compatibility and state checkpoints. `arenaSession.ts` adds checkpoint selection, review-mode observations, and frame-level coaching hooks. Browser QA verified start/pause/review controls update the UI. | Test that review observations exactly match the replayed frame and complete a full coaching/training round-trip in the browser. |
| Active application / Coach & Train UI | `app/page.tsx` mounts `ArenaScene`/`ArenaWorldView` with the same authority and physical controller as headless runs. `ArenaScene` exposes watch, replay scrub, "Coach this frame", quick rules, natural-language prompt, example queue with approve/reject, train, checkpoint export/import, and `localStorage` persistence. It now disables coaching/training when the loaded scenario is a held-out evaluation scenario. Browser QA verified the page loads, splat renders, the run starts/pauses/reviews, and the layout reflows on a 375×812 mobile viewport. | Mobile layout polish and full coaching/training round-trip in a real browser. |
| World loading | The main page uses the pinned local course, shared collider extraction, and stable Spark lifecycle callbacks. Loading errors stop the run and offer retry rather than inventing a fallback world. Browser QA confirmed the splat loads and the WebGL canvas initializes. | Stress-test loading/retry under degraded network and on lower-end mobile devices. |
| Checkpoint format and storage | `policyModel.ts` defines a 24 → 32 → 16 → 8 MLP with Tanh/softmax and a validated `season-0.checkpoint.v1` JSON format. `checkpointStorage.ts` handles `localStorage`, JSON import/export, and validation. The weight identity is a deterministic digest, not a cryptographic SHA-256. | Freeze hyperparameters and class mapping; implement a real SHA-256 if the docs must claim it. |
| Training runtime / starter | `policyTrainer.ts` implements supervised cross-entropy backpropagation with momentum SGD. `starter/train.ts` runs `npm run starter:train` end-to-end and exports `starter/champion-checkpoint.json`. It trains on 3 practice scenarios and reports `Practice 0 → 12` and `Held-out 0 → 12` (4/4 on each of 3 held-out variants). | Freeze hyperparameters and add larger-scale held-out course graphs. |
| Mint, Tripo, Convex integrations | `mintdotgg/mint-threejs-skills` is installed, `mint-assets.json` and `services/mintAssets.ts` are wired, `components/environment/MintModel.tsx` adds Draco GLB loading, and `ArenaWorldView.tsx` swaps the procedural rover for a Mint `championRover`/`rivalRover` asset when present. No Mint MCP server is connected yet. | Connect a Mint MCP server and generate the first rover model (or a validated world/collider) to exercise the end-to-end pipeline. |

### Implemented Reference Contract

The simulation uses `season-0.reference.2`; the checkpoint artifact uses `season-0.checkpoint.v1`. Neither is a frozen competition release. It uses 50 ms ticks and a decision every five ticks. Course `marble-038d084c-course-1` runs for 1200 ticks (60 seconds), with twelve cores, two floodable connections, and two scheduled flood windows. Flooding applies a route-speed penalty; the water overlay is not a fluid simulation.

`ArenaRunner` accepts an `ArenaScenario`, fixed safe/greedy/weather baseline selections, or a `learned` strategy backed by a `PolicyCheckpoint`, plus an optional `ArenaMotion` adapter. The main page always supplies `ArenaPhysics`; the route-only path remains for isolated tests, not as another playable mode. Nominal route progress proposes a target along a grounded polyline. Actual Rapier-resolved position and grounding determine whether progress and arrival commit. Forty blocked ticks trigger an observable recovery to the last station and mark the edge unavailable for that entrant. Rover bodies collide with the static environment but deliberately do not block one another; resource contention remains authoritative in the episode.

The learned policy is a 2-layer MLP: 24 normalized observation features, hidden layers of 32 and 16 with Tanh, and an 8-class action head with softmax. Inference selects the available action whose class has the highest logit. Training is supervised cross-entropy on approved `ArenaTrainingExample` tuples with momentum SGD; it writes a new `PolicyCheckpoint` with a parent reference, training summary, and a deterministic weight digest. Checkpoints are validated for shape, finite values, and schema version before use. `ArenaSession` loads the checkpoint into the runner, and the UI persists checkpoints/examples in `localStorage` with JSON import/export.

`advanceTicks()` and `advanceMicroseconds()` drive the same authority. The latter can bound work per pump without discarding accumulated time. The application session processes at most eight ticks per display pump, pauses local practice when the page is hidden, and disallows policy changes after starting. Camera and replay controls never steer an agent. `observe()`, `snapshot()`, and `recording()` return detached authority data; reset clears episode and timing state.

On each decision boundary, every entrant observes the same pre-step state. Requests resolve in a seeded, rotating entrant order, independent of request-array order. Invalid actions are rejected without applying their effect. Invalid envelopes or oversized request batches throw before advancing. This is a trusted in-process runner, not an uploaded-code sandbox or CPU inference-deadline service.

Recordings include controller and rule versions. Physical replay requires a matching controller built from the same collider data. The replay export contains the full scenario for the owner/evaluator; do not give it to a competitor as its observation. UI review reads recorded checkpoints and does not advance the live world.

Course 01 is authored public practice. The synthetic fixtures remain unit-test inputs. Neither is a held-out learning result. Numerical rules, paths, controller behavior, world assets, and checkpoint schema must be versioned when they change.

### Verification Snapshot

- `npm test` — 9 test files / 80 tests passed.
- `npm run lint` passed; `npx tsc --noEmit --incremental false` passed; `npm run build` completed with static generation for `/`.
- `npm run starter:train` runs end-to-end and exports `starter/champion-checkpoint.json`. It trains on three practice builder scenarios (42 non-wait demonstrations) and reports `Baseline: Practice 0 / Held-out 0` and `Trained: Practice 12 / Held-out 12` (4/4 on each of three held-out variants).
- Actual-collider tests traverse all seven connections in both directions without recovery, complete a round with both entrants banking resources, exercise the weather policy's spend, and reproduce the physical recording with a matching controller.
- Encoding/training tests verify the 24-dimensional vector, MLP forward pass, checkpoint validation, cross-entropy training, and the `proposeCorrection` coaching engine.
- The server-rendered entrypoint test verifies the new loading shell and training-status disclosure.
- Remaining warnings: Rapier's upstream initialization deprecation and Vitest's future config-loader warning. No security or verification controls were disabled.
- This is not a cross-version or cross-browser matrix. No browser, dev server, screenshot, or visual playtest was started. Canvas rendering, visual alignment, responsive layout, and real browser interactions remain unverified.

### Remaining Foundation and Retirement Work

- Verify the actual splat view, rover visibility, camera framing, loading/retry, controls, and layout once browser testing is approved.
- Add more diverse held-out scenarios (adversarial weather timing, swapped start positions, additional resource layouts) and regression reporting.
- Verify the `ArenaScene` held-out guard works in a browser once visual testing is approved.
- The active page no longer imports `CloudScene`, the old physics hook, wallet configuration, queue, or legacy `AgentProtocol`. Their files remain unreachable from that path rather than being silently deleted.
- Legacy API routes, contract/indexer tooling, unused dependencies, environment examples, and CI chain settings still need deliberate retirement. No external service was shut down.
- The old collider component and procedural-world assumptions remain only in the retired scene; the active course uses shared extraction and Rapier queries.

## Consolidation Policy

There is one product and one execution path. Do not maintain a parallel legacy game, chain-specific variant, or new prototype disconnected from the real runtime.

### Keep or Rebuild

- World rendering and validated asset loading.
- A minimal vehicle body and dependable controller.
- Weather with measurable traversal consequences.
- Resources and energy as bounded game mechanics.
- Observations, actions, outcomes, and readable spatial feedback.
- One state model shared across practice, training records, matches, and replay.

### Retire from Active Code and Configuration

- Wallet onboarding, chain switching, session permissions, and chain providers.
- Auctions, vehicle leases, ability minting, financial treasury roles, and the earn-pay-earn story.
- Onchain persistence, transaction dashboards, contract deployment requirements, and indexer setup.
- Human vehicle queues, practice slots while waiting, and human-driving-first onboarding.
- Parallel procedural/spherical game modes and disconnected spectacle systems.
- Legacy sponsor copy, environment examples, CI variables, deployment helpers, and API routes that only support the retired product.

Audit imports, callers, tests, scripts, and deployment configuration when retiring a subsystem. Preserve security controls and disclose any external service shutdown separately. Unused legacy tests can be retired with their owning functionality; do not weaken tests or protections to hide failures. This docs update authorizes the direction, not a claim that these code removals have occurred.

## Ordered Implementation Milestones

### 1. Establish One Playable Simulation

Simplify the active scene, reproduce the foundation failures, align the generated world and collider, and separate simulation time from rendering. Remove the retired product from the active onboarding and gameplay path as its dependencies are disentangled.

**Acceptance:** a baseline rover can spawn, traverse both routes, collect, bank, experience the weather effect, finish, and reset without a wallet or manual rescue. Changing camera or display frame rate does not change the intended rules. A diagnostic plain scene may isolate bugs but must not become a second product.

### 2. Freeze the Episode and Policy Contract

Implement structured observations, legal actions, bounded decision cadence, common navigation/controller behavior, scoring, termination, and run records. Establish the reference baselines and replay.

**Acceptance:** a full autonomous round runs with no human intervention; invalid actions and timeouts have explicit, tested outcomes; repeated evaluations use the same versioned rules.

### 3. Prove a Real Learning Update

Choose and benchmark the small policy architecture and training runtime. Start with a reviewed correction to flood-conditioned route choice. Train, export, validate, and load a new checkpoint. Evaluate it against its parent on held-out scenarios.

**Acceptance:** weights genuinely change, a manifest identifies the training inputs, and the new checkpoint produces observable behavior under frozen inference. Report measured results even if performance regresses. Do not replace a failed learning experiment with a hidden rule edit.

### 4. Connect Coaching and Review

Build the practice/replay selection, conversational correction proposal, approval flow, training status, checkpoint selection, and comparison interface. Route accepted examples and artifacts through the same schemas used by builders.

**Acceptance:** a user can complete watch → coach → approve → train → compete → replay without developer console intervention. The UI distinguishes instructions, pending examples, completed training, and evaluated checkpoints.

### 5. Integrate Content and Persistence

Add the focused Mint and Tripo assets, consolidate the World Labs world, and connect Convex records and access controls. Do not let content replacement alter collider fairness or introduce per-frame database writes.

**Acceptance:** sponsor use is visible and attributable; a correction, checkpoint, and match result can be traced together; private training records are not exposed to other entrants.

### 6. Package the Starter and Demo

Deliver a minimal working starter and data-only export path using the same policy contract. Prepare the two-minute demo, a labeled fallback recording, release verification, and accurate submission copy.

**Acceptance:** the unchanged starter completes a round; an exported checkpoint reloads with equivalent behavior in the supported runtime; the full demo path and reset work on the presentation device.

Milestones are dependencies, not promises about elapsed time. If scope must shrink, reduce world size, asset count, policies, or scenario variety. Do not drop the real training step or revert to the old wallet/arena thesis and call it this product.

## Release Gates and Claim Boundaries

Use [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) as the execution checklist and [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for presentation.

A credible hackathon build must demonstrate a playable autonomous episode, a reviewed coaching correction, a genuine checkpoint update, hands-off evaluation on held-out scenarios, and inspectable evidence. Live training is preferred only if reliable; prerecorded training or prepared checkpoints must be clearly labeled and traceable to real runs.

Do not claim that:

- deterministic rules or prompts are fine-tuned models;
- one replay proves generalization or superiority;
- an authored route graph is automatic spatial understanding;
- the browser or local subprocess harness provides tournament-grade isolation;
- all sponsor integrations are complete because their roles are documented;
- documentation changes have fixed playability or shipped the league.

## Documentation Map

- [README](../README.md): product introduction, current status, and existing development commands.
- [AGENT.md](../AGENT.md): implementation instructions and target agent contract.
- [DEPLOY.md](DEPLOY.md): release and configuration gates, not a legacy chain deployment recipe.
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md): two-minute evidence-first presentation.
- [SUBMISSION.md](SUBMISSION.md): draft submission and implementation-status disclosure.
- [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md): unchecked release criteria until verified.
- [World asset guide](../public/marble/README.md): existing asset pipeline and new validation requirements.

Retired document paths contain pointers, not competing plans. Update this document when a product decision changes; update the status and evidence in the supporting docs when implementation changes.
