# Dev A ⇄ Dev B contracts (v1)

Owner: Dev A · Date: 2026-10-01 · Branch: `worktree-dev-a` (Dev A) · Everything here is **additive**: Haul behaviour and all pinned tests are unchanged.

## Day-1 spike results (facts to build on)

| Question | Answer |
|---|---|
| Where is the clash triggered today? | In the UI: `ArenaScene.tsx` calls `shouldOfferEncounter` and then `session.applyEncounterClash`. Headless and server matches never see it. **Rush moves contact into the sim** (below). |
| Does route-only (no Rapier) agree with physics? | **Yes: 15/15 identical winners and scores** across the compete course and 4 family layouts (`scripts/bench-route-only.ts`). |
| How fast is a route-only match? | ~127 ms warm, down from ~490 ms (observation path arrays were being deep-cloned 480× per match). Enough for a server ladder; ES training will use parallel workers. |
| Pinned evals still hold? | `scripts/eval-gate.ts` PASS, numbers byte-identical. 307/307 tests green (4 pre-existing `workbenchPanels` UI tests fail on a clean checkout when run from a worktree with a symlinked `node_modules`; Dev B's area). |

Observation change Dev B should know about: `ArenaObservation.edges[*].path` is **no longer present** in observations. Use `course.scenario.edges[*].path` (unchanged) for rendering.

## 1. Scenario additions (Dev A implements, Dev B reads)

```ts
// services/arenaEpisode.ts
interface ArenaResource { id; nodeId; value /* 1..3 */; spawnTick?: number }  // hidden + uncollectable until spawnTick
interface ArenaScenario {
  /* existing fields */
  rush?: {
    contactRadiusM: number        // default 1.1
    bumpStaggerTicks: number      // default 24
    bumpCooldownTicks: number     // default 60 (per pair)
  }
}
```

Mode check for UI: `scenario.rush !== undefined` means Rush. Rush scenario ids start with `sandstone-rush-`.

## 2. Sim events (authoritative, replay-safe)

Events live in state so checkpoints and recordings carry them; scanning checkpoints in a replay reproduces them exactly.

```ts
type ArenaSimEvent =
  | { type: 'core_spawn'; tick: number; resourceId: string; nodeId: string; value: number }
  | { type: 'bump'; tick: number; winnerId: string; loserId: string; position: [number, number, number]; stolen: number /* cargo units moved to the winner */ }

interface ArenaSnapshot { /* existing */ events?: ArenaSimEvent[] }   // present only in Rush; append-only
```

Bump rule (deterministic, skill-rewarding): within `contactRadiusM` (measured on the **route reference positions**, so physics and route-only agree), not on cooldown, neither staggered. **The rover carrying more cargo loses** (it's heavy); ties → higher energy; ties → seeded priority. Loser is staggered (`bumpStaggerTicks`, may only `wait`) and the winner steals up to 1 cargo unit.

**Event ticks:** both event types carry the tick of the first snapshot that contains them (`core_spawn.tick === spawnTick`; a `bump` stamped during a step is published with that step's resulting tick). So `event.tick <= snapshot.tick` always holds, and an event is "new" when it appears in `events` beyond the previous snapshot's length. Prefer a small recency window (`snapshot.tick - event.tick <= 3`) over strict equality, because a hitch can advance several ticks in one frame.

Dev B: show bump VFX when a new `bump` event appears between consecutive snapshots; core-spawn beacon on `core_spawn`. Prefer importing `ArenaSimEvent` from `services/arenaEpisode` over redefining the type.

## 3. Loading the Rush arena

**LANDED (Day 2, branch `worktree-dev-a`).** `loadArenaCourse()` returns `{ course, rushCourse, physics, createMotion, dispose }`. `rushCourse` is an `ArenaCourse` with 20 nodes / 38 edges: the Haul graph plus node `arena-core` at (7, 8) linked from `cross-s` and `cross-s2` (edge ids `rush-cs-core`, `rush-s2-core`). Scenario id `sandstone-rush-01`.

- 4 "mother cores" (`mother-1..4`, value 3 = a full load) spawn at `arena-core` at ticks **160, 460, 760, 1040** (`RUSH_WAVE_TICKS`).
- A spawn is a **public flare**: both rovers learn of it through the fog. Beacon it in the world.
- Travel to the centre is 110 ticks for the champion and 106 for the rival (fair). Scatter cores are mirrored pairs; flood windows are ticks 120-420 and 780-1080.
- Dev B: the centre is `course.center` for `rushCourse` (same x/z as before). Flood zones are unchanged.

## 4. Convex API (Dev A builds Days 4-5; Dev B mocks)

```ts
rovers.publish({ guestKey, name, look: { accent: string }, checkpoint: PolicyCheckpoint }): { roverId: string }
ladder.list(): { roverId, name, look, rating, wins, losses, lastMatchAt }[]      // live query
ladder.challenge({ guestKey, roverId, opponentId?: string }): { matchId: string }  // server picks opponent + hidden seed
matches.get({ matchId }): { recording: ArenaRecording, result: { winner, banked }, ratingDelta: number, scenarioId: string } | null
```

A ladder `recording` is a normal `ArenaRecording`, so the existing replay/cinematic code plays it unchanged.

## 5. Code-coach types

```ts
type Teacher = (obs: ArenaObservation) => ArenaAction   // one shape for bots and teachers
```

## 6. Training stream (Day 3) - LANDED on `worktree-dev-a`

```ts
// services/policyES.ts (pure, browser/worker-safe)
trainES(config: EsConfig): AsyncGenerator<EsProgress>
EsProgress = { generation, mean /* population fitness */, validation: EsScore, best: number, checkpoint: PolicyCheckpoint /* best so far */, elapsedMs }
EsScore    = { fitness, margin, ownBanked, foeBanked, wins, losses, matches }
```

For the fitness chart plot `validation.fitness` and `best` against `generation` (`mean` is noisy because the opponent rotates). Browser training: run `trainES` inside a Web Worker with an evaluator that posts `scoreCheckpoint` jobs; `scripts/es-pool.ts` is the Node equivalent. Dev B can keep mocking until Dev A wires the worker (Day 5).

Also new: `rushVariant(base, 'train' | 'hidden', seed)` (seeded wave/flood timetables) and `swapSides(scenario)` in `services/rushVariants.ts`.

**Rush flares (learned rovers):** a spawn now reaches learned policies as an observation resource with `flare: true` and routes the rover there (`classifyAction` class 6). Haul is unaffected (nothing is ever announced there).

## 6b. Trained Rush rover artifact

`starter/rush-champion.json` is the best ES checkpoint so far (`es-g15-b03d7b`, warm-started from the bundled starter). On 12 hidden Rush variants x 2 sides (24 matches per opponent) it wins 96% vs greedy, 92% vs poach, 38% vs safe, 33% vs weather, and goes 10-0-14 (wins-losses-draws) against the imitation starter, which itself wins 0% vs safe/greedy/weather. It is experimental: it does not yet beat the strongest house bots.

## 7. Ownership and workflow

- Dev A: `services/`, `convex/`, `scripts/`, `starter/`, `docs/eval-*`.
- Dev B: `components/`, `app/`, `public/`, visual-only terrain script, CSS. **`ArenaScene.tsx` is Dev B only.**
- Dev A works in `.agents/worktrees/dev-a` on `worktree-dev-a`; opens a PR to `main` daily. Rebase on `main` every morning.
- This file lives in `docs/adal/` (untracked on `main`). Changes to a contract: edit here and tell the other dev.
