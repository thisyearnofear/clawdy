# Chassis training results

One brain per chassis, each warm-started from the champion `es-g115-c53fbf`, with the chassis traits in its input (`--chassis`, 250 generations, hub prior 1.5, seed 11) and then scored on 25 unseen hidden Rush variants x 2 sides (50 matches per opponent).

Reproduce: `npx tsx scripts/train-es.ts --init starter/rush-champion.json --chassis scout --gens 250 --pairs 12 --tasks 4 --seed 11 --hub-prior 1.5 --out runs/ch-scout.json`, then `npx tsx scripts/eval-es.ts <checkpoint> --chassis scout --variants 25 --write`. Records: `docs/eval-es-<chassis>.json`. Brains: `starter/chassis-<chassis>.json`.

## Results (wins-losses-draws out of 50)

| Brain | vs safe | vs greedy | vs weather | vs poach |
| --- | --- | --- | --- | --- |
| Champion, unmodified (Hauler baseline) | 48-2-0 | 43-4-3 | 21-29-0 | 48-0-2 |
| Hauler, trained | 48-2-0 | 43-4-3 | 25-25-0 | 49-0-1 |
| Scout, champion untrained for it | 21-29-0 | 23-27-0 | 25-25-0 | 49-1-0 |
| Scout, trained | 41-8-1 | 38-11-1 | 36-14-0 | 46-2-2 |
| Raider, champion untrained for it | 1-49-0 | 5-45-0 | 9-41-0 | 49-0-1 |
| Raider, trained | 40-8-2 | 37-11-2 | 37-13-0 | 45-1-4 |

## What this supports

- **A brain has to be trained for its build.** The unmodified champion collapses on a Raider chassis (1-49 against `safe`) and is much weaker on a Scout. Training recovers most of it. The chassis choice is a real constraint on the brain, not a skin.
- **Chassis change which opponents are hard.** Scout and Raider brains give up a few wins against `safe` and `greedy` (about 41 and 40 of 50, against 48) and win more against `weather` (36 and 37 of 50, against 21 for the Hauler baseline).

## What this does not support

- **It does not show that `weather` is beaten.** In these runs only the scored brain has the build; the house bots run the pinned, unmodified chassis. A Scout is faster than the bot it plays. The 21-29 and 35-45 records for the equal-footing champion are a different comparison.
- **It is one training seed per chassis** on route-only (server-style) matches. Differences of a few wins are noise. Nothing here is a balance claim between chassis.
- **Chassis do not face each other here.** Chassis-vs-chassis and brain-vs-brain results need the PvP stream.
