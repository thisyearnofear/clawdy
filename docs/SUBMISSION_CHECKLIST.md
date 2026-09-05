# Clawdy — Season 0 Release Checklist

The [canonical plan](HACKATHON.md) defines the accepted direction. The following checklist records verified implementation evidence.

## One Playable Autonomous Episode
- [x] Generated world loads with stable renderer ownership and a visible loading/failure state.
- [x] Collider, navigation graph, spawn, boundaries, and recovery agree on coordinates and scale.
- [x] A baseline completes movement, collection, banking, round termination, and reset without manual rescue.
- [x] Flooding and the one supported intervention visibly change traversal.
- [x] Gameplay uses simulation time rather than state-publication count or display frame rate.
- [x] Practice, evaluation, and presentation share the same versioned rules and simulation.
- [x] The primary path has no wallet, auction, vehicle lease, queue, or retired financial-role dependency.

## Real Coaching and Learning
- [x] Practice/replay exposes the recorded situation and action to correct ("Coach this frame (Tick T)").
- [x] Natural language guidance and quick tactical rules propose structured examples (`proposeCorrection`).
- [x] The user can approve or reject examples before training in the studio queue.
- [x] A real training run changes supported policy parameters and produces a new checkpoint via momentum SGD backpropagation.
- [x] Parent and new hashes, architecture/schema versions, approved data, training seed, and configuration are recorded.
- [x] The UI distinguishes a live instruction, proposed correction, approved data, trained checkpoint, and evaluated result.
- [x] The trained checkpoint reloads and runs through the same controller as the baseline (`createLearnedPolicy`).
- [x] Claims accurately distinguish training, fine-tuning, prompting, and engineered navigation.

## Match and Evaluation Integrity
- [x] Rules, world, collider, route graph, runtime, and entrant versions are pinned.
- [x] Weights are frozen and human controls/external inference are unavailable during scored matches.
- [x] Observation filtering and action validation enforce the same rules for every entrant.
- [x] Invalid, stale, unaffordable, malformed, and late actions have tested handling.
- [x] Artifact loading rejects unsupported formats, versions, shapes, sizes, non-finite values, and executable content (`validateCheckpoint`).
- [x] Episode state and any bounded policy memory reset between matches.
- [x] Training and held-out scenarios are separated; the entrant cannot read hidden evaluation seeds.
- [x] Evaluation shows sample count, scoring, ties, crashes, timeouts, invalid actions, and loss summary.
- [x] Replays contain actual accepted actions and state snapshots, not reconstructed fictional decisions.

## Starter and Ownership
- [x] The unchanged starter checkpoint completes a round in the supported environment.
- [x] Safe-collector, greedy, and weather-aware reference baselines are available and labeled.
- [x] Builder and application training paths export the same validated entrant format (`clawdy-checkpoint-v1`).
- [x] Standalone builder trainer (`starter/train.ts` via `npm run starter:train`) is documented and verified.
- [x] Checkpoint artifacts reload with equivalent behavior in the supported runtime.
- [x] Browser localStorage persists checkpoints and examples; JSON import/export is supported.

## Technology Contributions
- [x] World Labs asset provenance and the validated playable route are documented (`arena.spz` and `collider.glb`).
- [x] Rapier 3D 0.19.2 physics integration with deterministic queries.
- [x] Submission claims name only verified integrations and distinguish pre-existing from new work.

## Consolidation and Release Verification
- [x] Retired UI, runtime integrations, imports, and dependencies are removed from the active path.
- [x] Legacy environment examples, deployment scripts, and API routes are reconciled with the new architecture.
- [x] `npm run lint`, `npm test`, and `npm run build` run successfully on the intended commit, with relevant new tests added.
- [x] Production static build is verified and clean.
