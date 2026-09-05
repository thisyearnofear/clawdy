# Clawdy — Season 0 Release Checklist

The [canonical plan](HACKATHON.md) defines the accepted direction. These are implementation and release gates, not completed features. Check an item only after recording actual verification evidence.

## One Playable Autonomous Episode

- [ ] Generated world loads with stable renderer ownership and a visible loading/failure state.
- [ ] Collider, navigation graph, spawn, boundaries, and recovery agree on coordinates and scale.
- [ ] A baseline completes movement, collection, banking, round termination, and reset without manual rescue.
- [ ] Flooding and the one supported intervention visibly change traversal.
- [ ] Gameplay uses simulation time rather than state-publication count or display frame rate.
- [ ] Practice, evaluation, and presentation share the same versioned rules and simulation.
- [ ] The primary path has no wallet, auction, vehicle lease, queue, or retired financial-role dependency.

## Real Coaching and Learning

- [ ] Practice/replay exposes the recorded situation and action to correct.
- [ ] Chat proposes structured examples, with generated expansions labeled separately.
- [ ] The user can approve or reject examples before training.
- [ ] A real training run changes supported policy parameters and produces a new checkpoint.
- [ ] Parent and new hashes, architecture/schema versions, approved data, training seed, and configuration are recorded.
- [ ] The UI distinguishes a live instruction, proposed correction, approved data, trained checkpoint, and evaluated result.
- [ ] The trained checkpoint reloads and runs through the same controller as the baseline.
- [ ] Claims accurately distinguish training, fine-tuning, prompting, and engineered navigation.

## Match and Evaluation Integrity

- [ ] Rules, world, collider, route graph, runtime, and entrant versions are pinned.
- [ ] Weights are frozen and human controls/external inference are unavailable during scored matches.
- [ ] Observation filtering and action validation enforce the same rules for every entrant.
- [ ] Invalid, stale, unaffordable, malformed, and late actions have tested handling.
- [ ] Artifact loading rejects unsupported formats, versions, shapes, sizes, non-finite values, and executable content.
- [ ] Episode state and any bounded policy memory reset between matches.
- [ ] Training and held-out scenarios are separated; the entrant cannot read hidden evaluation seeds.
- [ ] Version comparisons use matched scenarios and swapped starting positions where applicable.
- [ ] Evaluation shows sample count, scoring, ties, crashes, timeouts, invalid actions, and regressions.
- [ ] Replays contain actual accepted actions and state snapshots, not reconstructed fictional decisions.
- [ ] Local/browser exhibition results are not represented as production-secure ranked competition.

## Starter and Ownership

- [ ] The unchanged starter checkpoint completes a round in the supported environment.
- [ ] Random smoke-test, safe-collector, and weather-aware reference baselines are available and labeled.
- [ ] Builder and application training paths export the same validated entrant format.
- [ ] Play, collect, train, evaluate, replay, and package workflows are documented only once implemented.
- [ ] Checkpoint artifacts reload with equivalent behavior in the supported runtime.
- [ ] Training records and private replay/log access enforce ownership.
- [ ] Any reused third-party source retains required attribution.

## Sponsor Contributions

- [ ] World Labs asset provenance and the validated playable route are documented.
- [ ] Tripo-generated assets are actually integrated, attributed, and performance-tested.
- [ ] Mint-created content or assembly work has a functional, visible contribution.
- [ ] Convex connects approved examples, training status, checkpoint metadata, and match/replay records.
- [ ] Generated assets are packaged ahead of the demo; no expiring URL or generation request is required during a match.
- [ ] Submission claims name only verified integrations and distinguish pre-existing from new work.

## Consolidation and Release Verification

- [ ] Retired UI, runtime integrations, imports, and dependencies are removed from the active path.
- [ ] Legacy environment examples, CI variables, deployment scripts, and API routes are reconciled with the new architecture.
- [ ] Secrets remain server-side; no secret is copied into a public environment variable or model artifact.
- [ ] Security controls remain intact; no check is disabled to hide a migration failure.
- [ ] `npm run lint`, `npm test`, and `npm run build` run successfully on the intended commit, with relevant new tests added.
- [ ] Production preview is verified on the presentation device, including resize, camera, controls, assets, console errors, and reset.
- [ ] The [release guide](DEPLOY.md), [README](../README.md), and [submission draft](SUBMISSION.md) match deployed behavior.

## Demo and Submission

- [ ] The full [two-minute demo](DEMO_SCRIPT.md) works through one reliable interaction path.
- [ ] A real fallback recording and its checkpoint/training evidence are saved.
- [ ] Prepared checkpoints, recorded training, and replayed matches are explicitly labeled.
- [ ] Live app URL, submitted commit, starter artifact, evaluation evidence, and demo link are filled in.
- [ ] Organizer approval for repository reuse is reflected in the pre-existing/new-work disclosure.
- [ ] Confirm submission channel and deadline with organizers; the supplied brief says September 5, 2026, 6:00 PM Pacific.
