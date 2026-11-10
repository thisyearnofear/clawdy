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
- [x] Browser rendering of the splat, rover visibility, camera, and responsive layout have been verified with agent-browser on desktop and mobile viewports. The main UI is responsive and the simulation advances.

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
- [x] League matches are server-authoritative: `leagueRun:challenge` re-plays both stored brains on a fresh hidden seed, re-simulates the recordings, and writes replay+ratings in one internal mutation; the client only supplies brain ids.
- [x] League authz negatives are covered by `convex/__tests__/league.test.ts` (cannot challenge with another account's brain, replays are append-only, share slugs cannot collide).
- [ ] A human-driven two-account challenge has completed on prod and its `?replay=<shareId>` link reloads in the workbench (backend verified in tests; awaiting two signed-in GitHub sessions).

## Starter and Ownership
- [x] The unchanged starter checkpoint loads and runs in the supported environment.
- [x] Safe-collector, greedy, and weather-aware reference baselines are available and labeled.
- [x] Builder and application training paths export the same validated entrant format (`season-0.checkpoint.v3`).
- [x] Standalone builder trainer (`starter/train.ts` via `npm run starter:train`) is documented and runs end-to-end.
- [x] Builder starter reliably completes a round and improves over the base checkpoint on the default scenario (`Baseline Banked: 0` → `Trained Banked: 4`).
- [x] Checkpoint artifacts reload with equivalent behavior in the supported runtime.
- [x] Browser `localStorage` persists checkpoints and examples; JSON import/export is supported.
- [x] Any reused third-party source retains required attribution.

## Technology Contributions
- [x] Playable world provenance is documented: the active Sandstone Basin terrain GLB is SHA-256-pinned in `services/arenaCourse.ts`; the earlier World Labs Marble assets (`arena.spz` / `collider.glb`) were retired September 26, 2026 and remain in git history.
- [x] Rapier 3D 0.19.2 physics integration with deterministic queries.
- [ ] Tripo-generated assets are integrated and performance-tested.
- [x] Mint-created content or assembly work has a functional, visible contribution (champion rover GLB generated via Mint MCP and loaded in `ArenaWorldView`).
- [x] Convex connects approved examples, training status, checkpoint metadata, and match/replay records.
- [x] Submission claims name only verified integrations and distinguish pre-existing from new work.

## Consolidation and Release Verification
- [x] Retired UI, runtime integrations, imports, and dependencies are removed from the active path.
- [x] Legacy API routes, contract/indexer tooling, and environment examples are reconciled with the new architecture.
- [x] Secrets remain server-side; no secret is copied into a public environment variable or model artifact.
- [x] Security controls remain intact; no check is disabled to hide a migration failure.
- [x] `npm run lint`, `npm test`, and `npm run build` run successfully on the intended commit, with relevant new tests added.
- [x] `npm run starter:train` runs and exports a checkpoint.
- [ ] Production preview is verified on the presentation device (asset loading, stable renderer, controls, camera, resize, console errors, reset, coaching, checkpoint selection, replay, and training).
- [x] The [release guide](DEPLOY.md), [README](../README.md), and [release checklist](SUBMISSION_CHECKLIST.md) have been updated to match current code and verified limitations.

## Demo and Submission
- [x] Practice / Match modes and scored coaching lock are reachable in the web UI.
- [x] Live app URL documented: [https://clawdy.trustfall.xyz/](https://clawdy.trustfall.xyz/) (commit on `main`; confirm SHA at submit time).
- [ ] The full [two-minute demo](DEMO_SCRIPT.md) works through one reliable interaction path on the presentation device.
- [ ] A real fallback recording and its checkpoint/training evidence are saved.
- [ ] Prepared checkpoints, recorded training, and replayed matches are explicitly labeled.
- [ ] Submitted commit SHA, starter artifact, evaluation evidence, and demo link are filled in the organizer form.
- [x] Organizer approval for repository reuse is reflected in the pre-existing/new-work disclosure.
- [x] Tripothon S1 window closed Oct 5, 2026 (archived plan: [TRIPOTHON.md](TRIPOTHON.md)). The World Labs tool-track re-check was an open item on that closed event; it does not carry into [AI_BUILDER_HACKATHON.md](AI_BUILDER_HACKATHON.md), which has no tool-track requirement.
- [x] Plain-language surfaces landed (Nov 10): Describe this Clash (`/api/arena-intent` → sanitized `CustomClashSpec`, practice-split only), free-text coaching fallback (`/api/coach-intent` → `resolveCoachIntent` against recorded legality), Describe a doctrine (`/api/doctrine` → `expandDoctrine`, consequence-measured drafts), Forge descriptor, LLM race caster (Track D, in flight). All server-key gated with deterministic fallbacks; browser verification on prod still owed (Track E).
- [ ] AI Builder Hackathon 2026 Tracks F–I (prompt-to-world, certified): `services/arenaWorldgen.ts` heightfield + playability certificate, `/api/world-intent` + `loadGeneratedCourse` wiring, forge front door + 3-step on-ramp, receipts strip. Plan and file ownership in [AI_BUILDER_HACKATHON.md](AI_BUILDER_HACKATHON.md). Claim "plain language generates playable 3D terrain" stays out of the README and the write-up until the certificate renders on prod in a browser.
- [ ] **Step zero, blocking everything:** LLM keys present in Vercel production (`COACH_INTENT_API_KEY`, `DOCTRINE_API_KEY`, caster, `WORLD_INTENT_API_KEY`) and each of the five NL surfaces verified answering on the LLM path rather than its keyword/preset fallback. As of Nov 10 prod has none of them.
- [ ] AI Builder Hackathon 2026 packet: demo video <3 min, written description, focus category, submission channel confirmed — tracked in [AI_BUILDER_HACKATHON.md](AI_BUILDER_HACKATHON.md).
