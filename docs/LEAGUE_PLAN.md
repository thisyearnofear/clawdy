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
- **Known caveat:** a faster chassis moves the route reference faster than the physics controller's `maxSpeed` (2.4) can follow in live physics-backed play, so speed above 1.0 needs a physics scale before it ships to the live view. Server-side route-only matches are unaffected.
- Append `buildToObservation` to the policy input behind a feature flag. The default input size stays unchanged for old brains.
- Per-chassis balance runs with `scripts/eval-es.ts`. Report win rates for real, including any chassis that dominates.

Acceptance:
- Pins and champion regression test passes.
- Old checkpoints load and run unchanged.
- A property test shows `validateBuild` rejects over-budget builds.
- An eval table shows the three chassis are not strictly ranked.

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

## Stream D — Assets and Forge (Tripo, Heygears, World Labs)

Owner: assets developer.

- Generate three chassis bodies with `scripts/tripo-generate.mjs`. Register them as `chassis.scout`, `chassis.hauler`, `chassis.raider`, and wire them into `ArenaWorldView.tsx` with a procedural fallback, as done for `CoreBody`.
- Compress the GLBs (current ones are ~3 MB each).
- **Forge your champion:** a Convex action calls Tripo server-side, with a per-account limit and a global credit cap. The key never reaches the client. The result is stored and shown as the champion's look.
- Export an STL of the forged rover for the Heygears print kit.
- Keep the World Labs claim exactly as written in `docs/TRIPOTHON.md`.
- Refresh `docs/assets/asset-board.png` and the build-log drafts at the end.

Acceptance:
- Each chassis renders on prod, verified by the harness.
- Forge fails safely: limit reached, Tripo error, and cap reached each show a clear message.
- Rival hauler facing is confirmed (flip the rotation if it is backwards).

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
