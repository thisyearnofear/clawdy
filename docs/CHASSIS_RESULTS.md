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

## Skirmish ruleset v1 (Hauler capacity 5, superseded by 4 below, Raider steal-all, Scout two-hop vision)

Same recipe with `--ruleset skirmish`, two seeds (11, 12) per chassis. Only the trained brain gets its chassis perk; the house bots are unmodified (capacity 3, one-hop vision, steal one). Wins-losses-draws out of 50 on 25 unseen hidden Rush variants x 2 sides (evaluated without `--write`, so these numbers come from the training-host logs, not a pinned record).

| Brain (seed 11 / seed 12) | vs safe | vs greedy | vs weather | vs poach |
| --- | --- | --- | --- | --- |
| Scout | 24-1-25 / 24-1-25 | 22-4-24 / 22-5-23 | 26-13-11 / 26-17-7 | 28-1-21 / 29-1-20 |
| Hauler | 49-0-1 / 49-0-1 | 50-0-0 / 50-0-0 | 49-0-1 / 49-0-1 | 45-3-2 / 46-3-1 |
| Raider | 39-11-0 / 35-15-0 | 35-15-0 / 33-15-2 | 31-19-0 / 34-16-0 | 48-1-1 / 48-0-2 |

What this shows:
- The two seeds agree closely, so the picture is reproducible, not luck.
- **Skirmish is not balanced.** Capacity 5 makes the Hauler dominant: it banks about 10 per match against about 7 for the house bots. Scout and Raider are roughly level with safe and greedy.
- **Weather is still not beaten** by Scout or Raider (31-34 wins of 50 for Raider, a small edge; Scout wins more but with many draws). Hauler wins it, but with the capacity advantage.
- Scout's training stopped improving early (best at generation 23 and 53). Two-hop vision is not yet used well; the encoder has no input for the wider view.
- These are scores against house bots, not brain-vs-brain. The PvP bench has not been run for Skirmish, so no claim about chassis vs chassis.

Next: lower Hauler capacity to 4 or make the extra slot cost speed, run the Skirmish PvP bench, give the encoder a far-resource feature for Scout. Brains: `starter/skirmish-<chassis>.json` (seed 11); both seeds in `docs/skirmish-v1/`.

### Skirmish v2: Hauler capacity 4

Capacity 5 was dominant, so the Hauler perk is now capacity 4 (`SKIRMISH_PERKS` in `services/chassis.ts`). The Hauler was retrained on two seeds; Scout and Raider are unchanged because the house bots they trained against did not change. The v1 table above is kept for the record.

Hauler capacity 4, seeds 11 / 12, wins-losses-draws out of 50:

| vs safe | vs greedy | vs weather | vs poach |
| --- | --- | --- | --- |
| 48-1-1 / 48-1-1 | 49-1-0 / 50-0-0 | 39-10-1 / 36-12-2 | 40-3-7 / 44-2-4 |

Brain vs brain (`scripts/bench-chassis-pvp.ts 40 --ruleset skirmish --write`, 80 matches per cell, seed-11 brains, each side with its own build; record `docs/eval-skirmish-pvp.json`):

| Row beats column | scout | hauler | raider |
| --- | --- | --- | --- |
| scout | - | 21-58-1 | 52-28-0 |
| hauler | 58-21-1 | - | 43-33-4 |
| raider | 28-52-0 | 33-43-4 | - |

Reading it:
- **Still not balanced.** The order is Hauler > Scout > Raider, a straight ranking, not a rock-paper-scissors loop. The Hauler beats both others.
- Capacity 4 cut the Hauler's edge against the house bots a little (safe and greedy about the same, weather down from 49-0 to 36-39 wins of 50), so it can beat `weather` here. That is against an unmodified bot while the Hauler carries 4 instead of 3, not evidence that the weather problem is solved in Training Grounds.
- Single brain per chassis in the PvP table, so treat gaps under about 10 matches as noise. Hauler over Scout (58-21) is well outside that.
- Next levers (superseded by v3 below for the speed cost / Raider buff): a far-resource encoder input for Scout.

Records: `docs/eval-es-skirmish-<chassis>.json` (seed 11), `docs/eval-skirmish-pvp.json`. Brains: `starter/skirmish-<chassis>.json`; both seeds in `docs/skirmish-v1/` (`sk4-hauler-*` is capacity 4).


### Skirmish v3: Hauler travelSpeed −0.08, Raider +0.04 (capacity 4 kept)

The capacity-4 Hauler still led PvP, so Skirmish adds a data-only travel cost on the Hauler's extra slot and a small Raider travel buff (`buildToTraits` when `rulesetId === 'skirmish'`). Hauler and Raider were retrained (two seeds); Scout is unchanged because its perk and the unmodified house bots it trained against did not change. The v2 table above is kept for the record.

Reproduce:

```
npx tsx scripts/train-es.ts --init starter/rush-champion.json --chassis hauler --ruleset skirmish --gens 250 --pairs 12 --tasks 4 --seed 11 --hub-prior 1.5 --out runs/sk5-hauler-s11.json
npx tsx scripts/eval-es.ts runs/sk5-hauler-s11.json --chassis hauler --ruleset skirmish --variants 25 --write
npx tsx scripts/bench-chassis-pvp.ts 40 --ruleset skirmish --write
```

Hauler (speed −0.08, capacity 4), seeds 11 / 12, wins-losses-draws out of 50:

| vs safe | vs greedy | vs weather | vs poach |
| --- | --- | --- | --- |
| 39-9-2 / 41-9-0 | 39-11-0 / 40-10-0 | 33-17-0 / 31-18-1 | 42-3-5 / 37-4-9 |

Raider (speed +0.04), seeds 11 / 12, wins-losses-draws out of 50:

| vs safe | vs greedy | vs weather | vs poach |
| --- | --- | --- | --- |
| 38-11-1 / 33-15-2 | 34-15-1 / 30-15-5 | 37-13-0 / 31-19-0 | 50-0-0 / 50-0-0 |

Brain vs brain (`scripts/bench-chassis-pvp.ts 40 --ruleset skirmish --write`, 80 matches per cell, seed-11 brains):

| Row beats column | scout | hauler | raider |
| --- | --- | --- | --- |
| scout | - | 4-66-10 | 63-15-2 |
| hauler | 66-4-10 | - | 47-21-12 |
| raider | 15-63-2 | 21-47-12 | - |

Reading it (vs v2 capacity-4 PvP: Scout–Hauler 21-58, Scout–Raider 52-28, Hauler–Raider 43-33):
- **Still not balanced.** Order remains Hauler > Scout > Raider. The Hauler's lead over Scout widened (66-4 vs 58-21) despite the −0.08 travel cost — the retrained capacity-4 brain banks harder.
- Raider's +0.04 travel did not close the gap on Hauler (21-47 vs old 33-43) and lost more to Scout (15-63 vs 28-52). Weather vs house bots improved a little for Raider seed 11 (37-13 vs v1's ~31-34).
- Hauler vs house bots is softer than v2 capacity-4 (safe/greedy ~39-41 of 50 instead of ~48-50; weather ~31-33 instead of ~36-39), so the speed cost is visible against unmodified bots.
- Single brain per chassis in the PvP table; gaps under about 10 matches are noise. Hauler over Scout (66-4) is well outside that.
- Next levers: a larger Hauler cost or energy tax, Raider steal/timing help, far-resource encoder input for Scout.

Records: `docs/eval-es-skirmish-<chassis>.json` (seed 11), `docs/eval-skirmish-pvp.json`. Brains: `starter/skirmish-<chassis>.json`; both seeds in `docs/skirmish-v1/` (`sk5-hauler-*` / `sk5-raider-*` are travel-lead; Scout remains `sk-scout-*`).
