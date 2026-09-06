# Clawdy — Season 0 Release Checklist

The [canonical plan](HACKATHON.md) defines the accepted direction. The following checklist records verified implementation evidence. Items are checked only when supported by the current code, tests, or a documented manual run.

## One Playable Autonomous Episode
- [x] Generated world loads with a server-rendered loading/failure state (`ArenaScene` boot shell).
- [x] Collider, navigation graph, spawn, boundaries, and recovery agree on coordinates and scale (unit tests traverse every edge).
- [x] A baseline completes movement, collection, banking, round termination, and reset without manual rescue.
- [x] Flooding and the one supported intervention change traversal costs in the episode authority.
- [x] Gameplay uses simulation time rather than state-publication count or display frame rate.
- [x] Practice, evaluation, and presentation share the same versioned rules and simulation.
- [x] The primary path has no wallet, auction, vehicle lease, queue, or retired financial-role dependency.
- [ ] Browser rendering of the splat, rover visibility, camera, and responsive layout have been verified on a presentation device.

## Real Coaching and Learning
- [x] Practice/replay exposes the recorded situation and action to correct ("Coach this frame (Tick T)" UI).
- [x] Natural language guidance and quick tactical rules propose structured examples (`proposeCorrection`).
- [x] The user can approve or reject examples before training in the studio queue.
- [x] A real training run changes supported policy parameters and produces a new checkpoint via momentum SGD backpropagation.
- [x] Parent and new digests, architecture/schema versions, approved data, training seed, and configuration are recorded.
- [x] The UI distinguishes a live instruction, proposed correction, approved data, trained checkpoint, and evaluated result.
- [x] The trained checkpoint reloads and runs through the same controller as the baseline (`createLearnedPolicy`).
- [x] The default builder starter demonstrates a measurable improvement over the base checkpoint on a held-out scenario.
- [x] Held-out evaluation is split and matched in `services/arenaScenarios.ts`; `rejectEvaluationExamples` guards the training pipeline and `ArenaScene` disables coaching/training on evaluation scenarios.

## Match and Evaluation Integrity
- [x] Rules, world, collider, route graph, runtime, and entrant versions are pinned.
- [x] Observation filtering and action validation enforce the same rules for every entrant.
- [x] Invalid, stale, unaffordable, malformed, and late actions have tested handling.
- [x] Artifact loading rejects unsupported formats, versions, shapes, sizes, non-finite values, and executable content (`validateCheckpoint`).
- [x] Episode state and any bounded policy memory reset between matches.
- [ ] Weights are frozen and human controls/external inference are unavailable during scored matches (UI enforces policy lock after start; scored-match isolation not yet demonstrated).
- [x] Training and held-out scenarios are separated in the starter registry; the entrant cannot read hidden evaluation seeds.
- [ ] Version comparisons use matched scenarios and swapped starting positions where applicable.
- [x] Evaluation shows sample count, scoring, ties, crashes, timeouts, invalid actions, and loss summary.
- [x] Replays contain actual accepted actions and state snapshots, not reconstructed fictional decisions.
- [x] Local/browser exhibition results are not represented as production-secure ranked competition.

## Starter and Ownership
- [x] The unchanged starter checkpoint loads and runs in the supported environment.
- [x] Safe-collector, greedy, and weather-aware reference baselines are available and labeled.
- [x] Builder and application training paths export the same validated entrant format (`season-0.checkpoint.v1`).
- [x] Standalone builder trainer (`starter/train.ts` via `npm run starter:train`) is documented and runs end-to-end.
- [x] Builder starter reliably completes a round and improves over the base checkpoint on the default scenario (`Baseline Banked: 0` → `Trained Banked: 4`).
- [x] Checkpoint artifacts reload with equivalent behavior in the supported runtime.
- [x] Browser `localStorage` persists checkpoints and examples; JSON import/export is supported.
- [x] Any reused third-party source retains required attribution.

## Technology Contributions
- [x] World Labs asset provenance and the validated playable route are documented (`arena.spz` and `collider.glb`, SHA-256 `25f82036...`).
- [x] Rapier 3D 0.19.2 physics integration with deterministic queries.
- [ ] Tripo-generated assets are integrated and performance-tested.
- [ ] Mint-created content or assembly work has a functional, visible contribution.
- [ ] Convex connects approved examples, training status, checkpoint metadata, and match/replay records.
- [x] Submission claims name only verified integrations and distinguish pre-existing from new work.

## Consolidation and Release Verification
- [x] Retired UI, runtime integrations, imports, and dependencies are removed from the active path.
- [x] Legacy API routes, contract/indexer tooling, and environment examples are reconciled with the new architecture.
- [x] Secrets remain server-side; no secret is copied into a public environment variable or model artifact.
- [x] Security controls remain intact; no check is disabled to hide a migration failure.
- [x] `npm run lint`, `npm test`, and `npm run build` run successfully on the intended commit, with relevant new tests added.
- [x] `npm run starter:train` runs and exports a checkpoint.
- [ ] Production preview is verified on the presentation device (asset loading, stable renderer, controls, camera, resize, console errors, reset, coaching, checkpoint selection, replay, and training).
- [x] The [release guide](DEPLOY.md), [README](../README.md), and [submission draft](SUBMISSION.md) have been updated to match current code and verified limitations.

## Demo and Submission
- [ ] The full [two-minute demo](DEMO_SCRIPT.md) works through one reliable interaction path in a browser.
- [ ] A real fallback recording and its checkpoint/training evidence are saved.
- [ ] Prepared checkpoints, recorded training, and replayed matches are explicitly labeled.
- [ ] Live app URL, submitted commit, starter artifact, evaluation evidence, and demo link are filled in.
- [x] Organizer approval for repository reuse is reflected in the pre-existing/new-work disclosure.
- [ ] Confirm submission channel and deadline with organizers; the supplied brief says September 5, 2026, 6:00 PM Pacific.
