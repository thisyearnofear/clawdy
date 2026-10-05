# Clawdy League — Implementation Plan

Goal: turn the single-player Rush demo into a **train-then-compete league**. You pick a chassis, spend a limited budget to shape it, train a brain, then race other players' brains on shared terrain.

Window: Tripothon S1 closes Oct 5 AoE (~12:00 UTC Oct 6). Anything not verified by the freeze is listed as roadmap and never claimed.

## Ground rules (apply to every stream)

1. **Pins are frozen.** Eval pins, the Haul gate, and the champion `es-g115-c53fbf` must keep producing identical numbers. Every stream adds a regression test for this.
2. **Additive and versioned.** New fields are optional. A brain with no chassis field runs as `hauler` with default stats.
3. **One mode today: Rush.** Capture-the-flag and Battle are named as roadmap, with the architecture ready for them (see "Modes").
4. **Honest claims.** `docs/SUBMISSION_COPY.md` is updated by each stream with what was actually verified. Weather is still unbeaten. The ladder is lightly tested.
5. **Small commits, tests green** (`vitest`, `tsc`, `eslint`) before every push. UI changes go through the cloud harness (`infra/verify`).

## Modes (design, build later)

Modes are scenario types on one sim. The mode sets the objective. Terrain and chassis set the strategy. Each mode gets its own pinned eval and its own ladder.

| Mode | Status |
| --- | --- |
| Rush (gather) | Shipped, verified |
| Battle | Roadmap. Reuses the contact rules from Stream A. |
| Capture-the-flag | Roadmap. Needs a flag objective and a second landscape. |

The seam: `ArenaScenario` gains an optional `mode` field (default `rush`). Streams below read it but only implement `rush`.

## Shared interfaces (agree these first)

Defined in one new file, `services/chassis.ts`, owned by Stream A and imported by everyone.

```ts
export type ChassisId = 'scout' | 'hauler' | 'raider'
export type StatAxis = 'navigation' | 'speed' | 'hardiness' | 'defence' | 'attack'
export type ModuleId = 'wide-sensor' | 'armour' | 'ram-plate' | 'extra-cell'

export interface Build {
  chassis: ChassisId
  points: Record<StatAxis, number> // bounded by STAT_BUDGET
  modules: ModuleId[]              // max MODULE_SLOTS
}

export const DEFAULT_BUILD: Build   // hauler, flat stats, no modules
export function validateBuild(b: Build): string[]            // [] = valid
export function buildToTraits(b: Build): EntrantTraits       // optional per-entrant sim overrides
export function buildToObservation(b: Build): number[]       // appended to brain input
```

Other shared contracts:

- **Training config:** `TrainingConfig { build, generations, populationSize, mutation, hubPrior, scenarioMix }`, defined in `services/trainingProtocol.ts`.
- **Match:** `runMatch(brainA, brainB, scenario, seed) → Replay`, defined in `services/ladderRunner.ts`.
- **Asset registry:** one `mint-assets.json` entry per chassis, key `chassis.<id>`.

## Stream A — Chassis and abilities (sim)

Owner: sim developer.

- Add `services/chassis.ts` with the interfaces above.
- **Landed (stage 1):** `services/chassis.ts` and optional `EntrantTraits` on `ArenaEntrant` (travel speed, battery size, bump strength). Rush already has rover-vs-rover bumps, so Attack and Defence bias that existing rule; no new contact system was needed. Default build is verified identical to the pinned rules.
- **Inert for now:** navigation (needs a wider fog radius), and the `wide-sensor` and `extra-cell` modules (capacity is hard-coded in the policy encoders). `ACTIVE_AXES` lists what is live, and the UI must not present inert axes as active.
- **Speed headroom:** Rush route edges run at about 1.8 m/s and the physics controller allows 2.4, so `travelSpeed` is capped at `MAX_TRAVEL_SPEED` (1.33) and live physics can follow every chassis. A test guards the cap.
- **Landed (stage 2):** build cost is escalating (`axisSpend`, `budgetSpent`) and enforced by `validateBuild`, so the server is the authority and the Build screen mirrors it.
- **Landed (stage 3):** brains can see their own build. `CHASSIS_FEATURE_DIM` (41) adds speed, battery and bump strength to the input, created only by `extendCheckpointForChassis` with zero rows, so old checkpoints and the pins are untouched. `buildToObservation` is not used by the encoder; the encoder reads the traits from `observation.self`.
- **Landed (stage 4):** `train-es` and `eval-es` take `--chassis scout|hauler|raider`. Results: [CHASSIS_RESULTS.md](CHASSIS_RESULTS.md). Trained brains: `starter/chassis-<chassis>.json`.
- **Open:** chassis-vs-chassis and brain-vs-brain balance (needs the PvP stream), and whether Hauler needs a perk. The first bench used house bots that ignore the chassis and is superseded by the trained results.

Acceptance:
- Pins and champion regression test passes.
- Old checkpoints load and run unchanged.
- A property test shows `validateBuild` rejects over-budget builds.
- An eval table shows the three trained chassis brains against the house bots (done: CHASSIS_RESULTS.md). Not yet shown: chassis against each other.

## Stream B — Coach panel and training (UX)

Owner: front-end developer.

- Build screen in the Coach panel: chassis picker, stat budget sliders with diminishing returns, module slots, and a plain-language pre-match readout ("slow but hardy: expect to lose races, win collisions").
- Training controls: generations, population size, mutation, hub prior, and scenario mix. These feed `TrainingConfig` into the existing trainer.
- Bring-your-own-harness path: the Teacher contract accepts a `Build` and a `TrainingConfig`, so scripted sweeps use the same budget as the UI.
- Document the harness path in `docs/` with a worked example.

Acceptance:
- Build and config round-trip through save and load.
- Over-budget builds are blocked in the UI.
- Mobile and desktop harness runs show zero failures.

Status (Oct 5): build screen, budget curve and `TrainingControls` are landed. `services/trainingConfig.ts` parses/serialises/validates the knobs, `ArenaScene` persists the config in localStorage and passes it into the panel, and `policyTrainer`/`policyModel` consume `TrainingConfig` so the sliders affect the real trainer — not the frozen 60/0.008/decay pin, which stays unchanged. `chassis.ts` caps `travelSpeed` at `MAX_TRAVEL_SPEED` (1.33) so every chassis stays inside the physics controller's 2.4 m/s headroom.

## Stream C — PvP, ladder and replays (backend)

Owner: backend developer.

- Store a brain with its build (Convex tables, versioned, additive).
- Challenge-a-player: pick an opponent's stored brain, run `runMatch` server-side, store the replay.
- Tournament rounds: a scheduled round pairs brains by rating within the same mode.
- Per-build leaderboard (best result per chassis) and per-axis report card.
- Replay attribution markers: battery-out, collision damage, and so on, emitted by the sim and stored with the replay.
- First action: live-test a ladder submit on prod and fix whatever breaks. This is still unverified.

Acceptance:
- Convex tests with authz negatives (cannot challenge with someone else's brain, cannot overwrite a replay).
- Two accounts complete a challenge end to end on prod.
- Replays reload from a share link.

Status (Oct 5): implemented and deployed to prod (`accomplished-capybara-638`). `convex/league.ts` + `convex/leagueRun.ts` + `convex/crons.ts` ship publish/challenge/6-hourly `runRound`, `runMatch` in `services/ladderRunner.ts` replays both sides and stores ~1 MB recordings in file storage behind a public `?replay=<shareId>` link (the workbench boots straight into review), `services/replayMarkers.ts` derives bump/spawn/battery-out/recovery/bank markers, and `league.topByChassis` + `league.reportCard` cover the per-build board and report card — the report card aggregates published brains' builds, not ladder rows. The `?replay=` share slug is consumed from the URL once the recording has loaded. `convex/__tests__/league.test.ts` covers the authz negatives and a real two-account challenge; the remaining open item is a human-driven two-account challenge on prod (needs two GitHub sign-ins).

## Stream D — Assets and Forge (Tripo, Heygears, World Labs)

Owner: assets developer.

- Generate three chassis bodies with `scripts/tripo-generate.mjs`. Register them as `chassis.scout`, `chassis.hauler`, `chassis.raider`, and wire them into `ArenaWorldView.tsx` with a procedural fallback, as done for `CoreBody`.
- Compress the GLBs (current ones are ~3 MB each).
- **Forge your champion:** a Convex action calls Tripo server-side, with a per-account limit and a global credit cap. The key never reaches the client. The result is stored and shown as the champion's look.
- Export an STL of the forged rover for the Heygears print kit.
- Keep the World Labs claim exactly as written in `docs/TRIPOTHON.md`.
- Refresh `docs/assets/asset-board.png` and the build-log drafts at the end.

Status (Oct 5): bodies, resolver, Forge backend and panel, and STL export are landed. The Forge backend is **deployed to Convex prod** (`accomplished-capybara-638`, from a clean checkout of committed `main`). The Forge **panel is not live** until the client (Vercel) is redeployed.
- **Bodies:** `chassis.scout|hauler|raider` are Tripo P1 text-to-model assets (40 credits each, task IDs in `mint-assets.json`). The scout's detached sensor dish was removed from the mesh. All GLBs, including the rival and core, were resized to 1024 px textures and quantized: ~3.4 MB to ~1.0–1.3 MB, bounding boxes unchanged. Quantization was chosen over Draco so rendering does not depend on the Mint CDN decoder.
- **Resolver:** `services/chassisAssets.ts` picks chassis body, then the legacy `championRover`/`rivalRover`, then the procedural rover. `ArenaScene` passes `chassisByEntrant={{ champion: build.chassis }}`, so the champion renders its chassis body; the house rival keeps its legacy model. Not yet seen in the live app.
- **Forge backend:** `convex/forge.ts` (`start`, scheduled `poll`, `mine`, a 2-minute `sweep` cron) with limits and messages in `services/forge.ts`. Chassis and paint come from fixed menus, so players cannot write prompts. Credits are reserved atomically before Tripo is called and released on every failure. Limits default to 2 forges per account and 2,000 credits globally (`FORGE_PER_ACCOUNT_LIMIT`, `FORGE_GLOBAL_CREDIT_CAP`). Only `start` and `mine` are public.
- **Forge verified against the real Tripo API** on a local Convex deployment (a scout in ice paint): Tripo accepted the task, the busy rule held while it ran, and the stored GLB is valid (3.58 MB, 7,792 triangles, long axis X as the borrowed chassis transform assumes, no detached parts, exports to STL). That run also found a real failure: a scheduled poll failed transiently, and Convex does not retry failed actions, so the forge stayed pending forever (player blocked by `forge-busy`, credits held). Fixed with the sweep cron (fails overdue forges, restarts quiet polls), a `reserve` that expires overdue forges, poll error handling, and cleanup of a duplicate poll's stored file. The sweep rescued the stranded real forge. All covered by `convex/__tests__/forge.test.ts`.
- **Forge on prod:** deployed and smoke-checked only: all ten functions are registered, an unauthenticated `start` is refused, `sweep` runs, and `forges` is empty. **No real forge has run on prod**: it needs a signed-in GitHub account, and no test users were created in the prod database. `TRIPO_API_KEY` on prod is identical to the local key (compared by hash).
- **Forge panel:** mounted in the Coach panel as "Forge your champion"; the forged GLB becomes the champion's look (falls back to the standard rover if it cannot load). Covered by render tests only; never opened in a browser.
- **Print:** `scripts/export-print-stl.py` reads quantized GLBs, takes a URL (a forged rover) and `--scale-mm`; STLs for the three chassis are in `public/prints/` (see `docs/PRINT_KIT.md`). Nothing was test-printed.
- **Facing:** checked in an offline three.js render using the game's own transforms and the sim's +Z forward axis. The scout, hauler, raider and the rival all face +Z with the current `-π/2` Y rotation, so no flip was needed. This is not the live app and not the cloud harness.

Open: redeploy the client, then a human forge on prod with a real account; prod harness run per chassis; refresh asset board and build-log drafts.

Acceptance:
- Each chassis renders on prod, verified by the harness. (Open: renders correctly offline; the client is not redeployed.)
- Forge fails safely: limit reached, Tripo error, and cap reached each show a clear message. (Messages, refunds and the stranded-poll recovery are covered by tests; the stranded-poll recovery was also seen against real Tripo locally; the messages have not been seen in the UI.)
- Rival hauler facing is confirmed (flip the rotation if it is backwards). (Confirmed correct in an offline render.)

## Sequencing

| Phase | Hours | Work |
| --- | --- | --- |
| 0 | 0–2 | Land `services/chassis.ts` with stubs and the shared types. Stream D starts chassis generation. Stream C live-tests the ladder. |
| 1 | 2–9 | All four streams build against the interfaces. Each stream merges small commits to `main` once its tests pass. |
| 2 | 9–13 | Integration: end-to-end build → train → challenge → replay on prod. Balance runs. Bug fixes. |
| 3 | 13–17 | Freeze. Update asset board, `SUBMISSION_COPY.md`, `TRIPOTHON.md`. Record the walkthrough. Submit. |

Merge order for conflicts: A (types and sim) → B and C (consumers) → D (assets). Stream D is independent until wiring, so it can merge anytime.

## Risks

- **Balance.** One chassis may dominate. We ship what the data shows and say so. Scope is capped at 3 chassis, 4 modules, and a small stat budget.
- **Brain compatibility.** Mitigated by the optional observation field and the champion regression test.
- **Contact rules in Rush.** The largest sim change. It is the first thing cut if it threatens the pins, and those axes are then labelled roadmap.
- **Forge cost and abuse.** Per-account limit plus a global cap. Tripo had 24,440 credits at last check.
- **Parallel edits.** Streams touch different files. Shared files (`schema.ts`, `ArenaWorldView.tsx`, `mint-assets.json`) get short-lived branches and quick rebases.

## Manual items for the project owner

- Try a ladder submit on prod.
- Record the walkthrough (`docs/RECORDING_SCRIPT.md`).
- Submit the entry form and post the build logs.
- Rotate both GitHub OAuth client secrets (they were pasted in chat).
- Confirm the Vercel primary domain and redirect.
