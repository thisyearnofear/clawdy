# Chassis training results

One brain per chassis, each warm-started from the champion `es-g115-c53fbf` with the chassis traits in its input (`--chassis`, 250 generations, hub prior 1.5, seed 11, one training run per chassis). Reproduce:

```
npx tsx scripts/train-es.ts --init starter/rush-champion.json --chassis scout --gens 250 --pairs 12 --tasks 4 --seed 11 --hub-prior 1.5 --out runs/ch-scout.json
npx tsx scripts/eval-es.ts runs/ch-scout.json --chassis scout --variants 25 --write
npx tsx scripts/bench-chassis-pvp.ts 40 --write
```

Brains: `starter/chassis-<chassis>.json`. Records: `docs/eval-es-<chassis>.json`, `docs/eval-chassis-pvp.json`. The first mapping (speed +0.06 per point) is kept in `docs/chassis-v1/`.

## Against the house bots (v2: speed +0.04 per point)

Wins-losses-draws out of 50 on 25 unseen hidden Rush variants x 2 sides.

| Brain | vs safe | vs greedy | vs weather | vs poach |
| --- | --- | --- | --- | --- |
| Champion, unmodified (Hauler baseline) | 48-2-0 | 43-4-3 | 21-29-0 | 48-0-2 |
| Hauler, trained | 48-2-0 | 43-4-3 | 25-25-0 | 49-0-1 |
| Scout, trained | 42-8-0 | 29-20-1 | 33-17-0 | 49-0-1 |
| Raider, trained | 36-14-0 | 33-15-2 | 34-16-0 | 49-1-0 |

The Hauler baseline is the same checkpoint as before (its traits did not change), which is a useful determinism check.

## Brain against brain (v2)

The three trained brains play each other on 40 unseen variants x 2 sides, each with its own build. Row brain's record against the column brain (wins-losses-draws out of 80):

| | vs scout | vs hauler | vs raider |
| --- | --- | --- | --- |
| scout | 40-40-0 | 57-14-9 | 65-15-0 |
| hauler | 14-57-9 | 40-40-0 | 35-40-5 |
| raider | 15-65-0 | 40-35-5 | 39-39-2 |

With the first mapping (v1, speed +0.06) the picture was: Scout beat Hauler 71-9 and was even with Raider (39-41), and Raider beat Hauler 45-35.

## What this supports

- **A brain has to be trained for its build.** With the v1 mapping, the unmodified champion on a Raider chassis went 1-49 against `safe` and on a Scout 21-29. Training recovered it. The chassis is a real constraint on the brain, not a skin.
- **Chassis change which opponents are hard.** Scout and Raider brains win less against `safe` and `greedy` than the Hauler and more against `weather`.
- **Scout is ahead in both mappings.** It beat the Hauler by a wide margin in both, and beat the Raider in v2. Speed is the strongest stat in this sim today. Lowering its bonus from +0.06 to +0.04 per point did not fix that.

## What this does not support

- **It does not show that `weather` is beaten.** The house bots run the pinned, unmodified chassis, so a Scout or Raider is faster than the bot it plays. The equal-footing record (21-29 here, 35-45 on the pinned eval) is a different comparison.
- **It is not a balance result.** There is one training run per chassis, and the Raider-vs-Scout result changed a lot between v1 and v2 (39-41 to 15-65), which is probably training variance rather than the mapping alone. Treat any single cell as noisy.
- **The chassis are not balanced.** Hauler is the weakest, and Scout is the strongest. This is the main open item for the build system. Likely fixes: lower or remove the speed bonus, give Hauler a perk that matters in a race for timed cores, and train several seeds per chassis before drawing conclusions.
