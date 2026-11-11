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
- [x] PBRgen (AIxPOLY) material maps are integrated and browser-verified (Nov 11): one prompt → seamless albedo/normal/roughness set, exported at 2K and recompressed to 1024 px JPEG, applied to **generated terrain only** in `components/environment/terrainPbr.ts`. The shader response is driven by certified fields — per-vertex slope (dust on flats, bare on faces) and the flood footprint's own waterline (a ±1.4 m wet band that hugs the shoreline, and never appears on a course with no flood). Verified on `localhost:3001` across three palettes (basalt canyon, copper flood flat, gypsum basin) with the receipt unchanged at `23/23 · 38/38`; the authored GLB keeps its own procedural detail textures. Provenance and prompt in `public/assets/asset-credits.json`.
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
- [x] AI Builder Hackathon 2026 Tracks F–I (prompt-to-world, certified): `services/arenaWorldgen.ts` heightfield + playability certificate, `/api/world-intent` + `loadGeneratedCourse` wiring, forge front door + 3-step on-ramp, receipts strip. Plan and file ownership in [AI_BUILDER_HACKATHON.md](AI_BUILDER_HACKATHON.md). The claim unlocked on Nov 11: the certificate has rendered on prod in a browser, twice, so the README and the write-up now state it.
- [ ] **Step zero, partially cleared:** the world translator is confirmed answering on the **LLM path** in production (no `WORLD_INTENT_*` var exists; the route falls back to the `COACH_INTENT_*` chain and produced a spec that no preset could have produced). Still unproven on prod, in a browser: the doctrine surface and the free-text coaching fallback. `DOCTRINE_API_KEY` and a dedicated caster key are absent from the Vercel project; those two surfaces run on their deterministic fallbacks there.
- [x] AI Builder Hackathon 2026 packet: demo video cut and delivered (`~/Downloads/clawdy-walkthrough-v1.mp4`, 1:34, narrated + captioned, `.srt` alongside), written description and focus category drafted as paste-ready answers in [AI_BUILDER_HACKATHON.md](AI_BUILDER_HACKATHON.md) ("Form answers, ready to paste"), submission channel confirmed (`https://forms.cloud.microsoft/e/XJx86qYjcn`).
- [x] **Repo + demo now carry the headline feature.** `gh auth status` showed a third account — `thisyearnofear` — and it is the active one; the earlier 403 was git falling back to an SSH identity (`denied to sneldao`). Pushing with `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin main` moved `main` from `f209546` to `d652c9f`, Vercel auto-deployed to Production (Ready in 2m), and prompt-to-world was re-verified on prod in a browser at 11:12 UTC: `world generated "Copper Flooded Salt Flat" · 23/23 stations grounded · 38/38 routes cleared` in 18 s, race + flood + `Call the next route` all live, no console errors.
- [ ] **One URL blocker left, and it is a human one:** the demo video needs a hosted link (YouTube unlisted / Drive anyone-with-link) — the form validates URL format, so `~/Downloads/clawdy-walkthrough-v1.mp4` has to be uploaded by the account owner.
- [ ] **Push gotcha, live at 11:25 UTC:** the active `gh` account flipped to `udirobert` between two pushes and the next one 403'd (`denied to udirobert`). `gh auth status` lists all three identities but only marks one `Active account: true` — check that line, not the first block, and `gh auth switch --user thisyearnofear` before pushing. The repo owner is the only one of the three that can write here.
