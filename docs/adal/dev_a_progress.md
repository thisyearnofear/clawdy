# Dev A progress: Brain and Arena

Date: 2026-10-02
POC: Dev A
TL;DR: Rush mode runs in the simulation (timed cores, real rover contact), learned rovers can race to spawns, and an evolution-strategies trainer turned a rover that lost every Rush match into one that beats greedy and poach bots and the imitation starter. It still loses to the two strongest house bots. Server ladder and code-coaching backend are not started.

## Landed (branch `worktree-dev-a`)

- **Speed:** warm route-only match 490 ms to ~127 ms. Observation edges no longer carry dense `path` arrays (policies never read them); hot paths use a plain-data clone. Eval gate reproduces its pins exactly.
- **Rush rules** (`services/arenaEpisode.ts`, `services/arenaCourse.ts`): optional `scenario.rush`, `resource.spawnTick`, `snapshot.events` (`core_spawn`, `bump`). Contact uses route-reference positions, so physics-backed and route-only matches agree (tested, bumps included). Haul snapshots are unchanged.
- **Rush arena:** `buildRushCourse` adds `arena-core` (110 vs 106 ticks from the two bases), four value-3 mother cores at ticks 160/460/760/1040, mirrored scatter cores. `loadArenaCourse()` also returns `rushCourse`.
- **Flares:** a spawn is public to both rovers. Learned policies route to it through a new class-6 path (`flare` on observation resources); nothing changes in Haul.
- **Variants:** `services/rushVariants.ts` (`rushVariant`, `swapSides`); hidden ids are evaluation-only.
- **ES trainer:** `services/policyES.ts` (`trainES`, `scoreCheckpoint`), `services/rng.ts`, `record: false` fast mode, scripts `train-es`, `es-pool`, `es-worker`, `eval-es`, and bench scripts.
- **Artifact:** `starter/rush-champion.json` (`es-g15-b03d7b`).
- **Docs:** `starter/README.md` corrected (36 features); `docs/adal/contracts.md` is the Dev A/B contract.
- **Review fix:** bump events are now stamped with the tick of the snapshot that first contains them. They were one tick early, which would have hidden them from the tick-equality check in `RushEventFX`.

## Measured

ES on Rush, 12 hidden variants x 2 sides (24 matches per opponent). Margin = own banked minus rival banked.

| Opponent | Starter before | Trained after |
|---|---|---|
| safe | 0% wins, -4.5 | 38% wins, -1.8 |
| greedy | 0% wins, -5.0 | 96% wins, +0.8 |
| weather | 0% wins, -5.0 | 33% wins, -0.7 |
| poach | 92% wins, +2.4 | 92% wins, +3.6 |
| starter | - | 10 W, 0 L, 14 D |

Tests: 327 passing in this branch (`workbenchPanels` excluded, see below). Lint and typecheck clean. The `eval-gate` Haul pins still reproduce.

## Not done, and what is wrong

- **G2 is only partly met.** The trained rover beats the imitation starter and two bots, not `safe` or `weather`. Validation fitness plateaued around 1.3 after ~35 generations. A third run (sigma 0.1, more tasks on hard opponents) was stopped at generation 9 without improvement. The next lever is a richer action set or executor, not more generations.
- The held-out numbers above come from training logs. They are not yet pinned in `docs/eval-es.json` (`scripts/eval-es.ts --write` produces it).
- Server ladder (Convex), hidden-seed challenge action, rating, and the code-coaching backend (`Teacher`, distillation move, CLI, `llms.txt`) are not started.
- `workbenchPanels` has 4 failing UI tests when run from a worktree with a symlinked `node_modules`. Dev B reported the same 4 on `main`, so they predate this work.
- Rush is not selectable in the UI yet (Dev B).

## Next

1. Merge with Dev B's commit; run the full suite on the merged tree.
2. Executor or action-set work to beat `safe` (Day 3 gate), then pin `docs/eval-es.json`.
3. Convex ladder: `rovers.publish`, `ladder.challenge`, `matches.get`.
