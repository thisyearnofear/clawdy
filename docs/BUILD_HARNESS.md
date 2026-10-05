# Build harness — the scripted path (Stream B)

The Build screen in the Coach panel and a scripted sweep share **one** budget
implementation: `services/buildBudget.ts`. There is no second copy of the cost
rules in the CLI path, so a headless sweep cannot drift from what a player sees.

## The contract, and who owns it

`services/chassis.ts` (Stream A) is authoritative for everything the simulation
cares about:

| Rule | Value |
| --- | --- |
| Chassis base total | `CHASSIS_TOTAL` = 11 |
| Discretionary budget | `STAT_BUDGET` = 3 |
| Per-axis range | `STAT_MAX` = 6 |
| Module slots | `MODULE_SLOTS` = 2 |
| Axes that change the sim | `ACTIVE_AXES` = speed, hardiness, defence, attack |
| Escalating cost | `axisSpend(n) = n(n+1)/2`, netted by `budgetSpent(build)` |
| Legality | `legalLeagueBuild(build)` — **two** checks, see below |

### Legality is two checks, not one

`validateBuild` enforces the *flat* stat total, because the sim only cares about
the final stat vector. The match authority in `services/ladderRunner.ts`
(`legalLeagueBuild`, reused by `convex/leagueRun.ts`) adds the escalating curve:

```ts
validateBuild(build).length > 0 || budgetSpent(build) > STAT_BUDGET
```

A build can therefore be flat-legal and still be unable to race. `buildBudget.ts`
exposes that same pair as `budgetErrors(build)`, and every guard in this module —
`setAxisLevel`, `toggleModule`, `isValidBuild`, `serializeBuild`, `parseBuild` —
uses it, so the panel blocks an unraceable build where the player can still act
on it. The curve error string is byte-identical to the server's
(`build costs 6 but the budget is 3`), so the panel and the API never describe
the same failure two different ways.

What `buildBudget.ts` adds on top: the marginal-cost *label* a slider needs
(`marginalCost`), and the clamping and save/load helpers. The accumulation itself
is Stream A's — there is deliberately no second copy of it.

## Training controls — `TrainingConfig`

Stream B also asks for training controls: **generations, population size,
mutation, hub prior, and scenario mix**. Those five are not `TrainingOptions`
(epochs / learningRate / momentum / weightDecay) — they are the
**evolution-strategy** knobs in `services/policyES.ts` and
`scripts/train-es.ts`, and they drive `trainES`.

They are deliberately **not** the browser Coach-train optimizer. That one is
frozen: `services/__tests__/versions.test.ts` pins the literal text
`epochs: 60,` / `learningRate: 0.008,` /
`learningRateDecay: { atEpoch: 30, factor: 0.5 }` inside
`components/environment/ArenaScene.tsx`, and the eval pin reproduces the weights
that config produced. Making the sold learning path configurable would break a
deliberate pin, so the Train button keeps its config and this panel configures
the builder.

`services/trainingConfig.ts` owns the knobs, the ranges, the readout, and the
round-trip. `DEFAULT_TRAINING_CONFIG` is transcribed from the `train-es.ts`
argument defaults, so an untouched panel reproduces the builder run exactly:

| Knob | CLI arg | Default | Feeds |
| --- | --- | --- | --- |
| `generations` | `--gens` | 30 | `EsConfig.generations` |
| `pairs` | `--pairs` | 8 | `EsConfig.pairs` (population is twice this) |
| `sigma` | `--sigma` | 0.08 | `EsConfig.sigma` |
| `scenariosPerGeneration` | `--tasks` | 3 | `EsConfig.trainScenariosPerGen` |
| `hubPrior` | `--hub-prior` | 0 | checkpoint seeding, *not* an `EsConfig` field |

`hubPrior` is called out because it is the one that does not belong in an
`EsConfig`: it seeds the parent checkpoint's hub edge. `toEsConfig` therefore
does not carry it, and `hubPriorSeed` returns it separately — folding it in
would produce a field the trainer ignores.

### Running a sweep with a config

```ts
import { DEFAULT_TRAINING_CONFIG, setKnob, toEsConfig } from './services/trainingConfig'
import { trainES } from './services/policyES'

const config = setKnob(DEFAULT_TRAINING_CONFIG, 'generations', 60)
const es = toEsConfig(config, {
  parent,           // the checkpoint being improved
  context,          // arena context (features, scenarios, rivals)
  learningRate: 1,  // the ES step size, --lr; not a Stream B knob
  validationSeeds: [1, 2, 3],
  seed: 7,
})
for await (const progress of trainES(es)) {
  console.log(progress.generation, progress.validation)
}
```

`toEsConfig` is the single handoff, and a test asserts that
`toEsConfig(DEFAULT_TRAINING_CONFIG, base)` yields the same four `EsConfig`
values the CLI builds from those defaults. That is what stops the Coach panel
from being dead UI.

The ES step size (`learningRate`) and `validationSeeds` are **not** panel knobs
and must be supplied by the caller in the base object.

## The cost curve

The n-th point added to a single axis costs `n`:

| Points on one axis | 1 | 2 | 3 |
| --- | --- | --- | --- |
| Cost | 1 | 2 | 3 |
| Running total | 1 | 3 | 6 |

So with a 3-point budget you can put **two** points on one axis (1 + 2 = 3) or
spread one point across three. Lowering an axis below its chassis base refunds
its points, so "give up 2 hardiness, buy 2 speed" is expressible.

This is the D&D point-buy shape, chosen over a logarithmic curve: logs diminish
"fast and hard" and need per-game tuning to feel right, while an escalating
integer cost is legible on a slider ("the next one costs 2") and trivial to
reverse.

## Worked example — a speed build

```ts
import {
  baseBuild, setAxisLevel, remainingBudget,
  maxAffordableLevel, budgetErrors, describeBuildSummary,
} from './services/buildBudget'

// Start from a chassis base line (navigation 2, speed 2, hardiness 4, defence 2, attack 1).
const build = baseBuild('hauler')
remainingBudget(build)                  // 3 — the full discretionary pool

// Buy speed. The first point costs 1.
const faster = setAxisLevel(build, 'speed', 3)
remainingBudget(faster)                 // 2

// Buy a second. The second point costs 2, which exhausts the budget.
const fastest = setAxisLevel(faster, 'speed', 4)
remainingBudget(fastest)                // 0
budgetErrors(fastest)                   // [] — legal under the league's full gate
maxAffordableLevel('defence', fastest)  // 2 — nothing else is affordable
describeBuildSummary(fastest)           // 'faster than a hauler, … every point is spent.'
```

Overspending is impossible through this API: `setAxisLevel` clamps to
`maxAffordableLevel` and returns the original build if the result would fail
`budgetErrors`. A slider mid-drag gets a clamped value, never a throw.

Three points on one axis is the case the curve exists to catch: it is flat-legal
(total is exactly `CHASSIS_TOTAL + STAT_BUDGET`) but costs 6, so
`legalLeagueBuild` refuses it and `budgetErrors` reports
`build costs 6 but the budget is 3`.

## Round-tripping a build

```ts
import { serializeBuild, parseBuild } from './services/buildBudget'

localStorage.setItem(BUILD_STORAGE_KEY, serializeBuild(build))
const restored = parseBuild(localStorage.getItem(BUILD_STORAGE_KEY))
```

`serializeBuild` refuses to write a build the league would reject. `parseBuild`
never throws: missing, malformed, or illegal stored data resolves to the hauler
baseline, so a player who predates the Build screen is not broken by it
(ground rule 2) — and a build saved under an older rule is dropped rather than
handed forward to fail at submit time.

## Round-tripping a training config

```ts
import { serializeTrainingConfig, parseTrainingConfig, TRAINING_STORAGE_KEY } from './services/trainingConfig'

localStorage.setItem(TRAINING_STORAGE_KEY, serializeTrainingConfig(config))
const restoredConfig = parseTrainingConfig(localStorage.getItem(TRAINING_STORAGE_KEY))
```

`parseTrainingConfig` is additive and versioned: a config saved before a knob
existed is **missing that field**, so it is filled from the defaults instead of
the whole value being discarded. Anything genuinely unusable — malformed JSON, a
string where a number belongs, an out-of-range value — falls back to the
defaults rather than throwing, because a stored string must never wedge the
panel.

## Sweeping builds headlessly

`budgetErrors` is pure, so a sweep is an ordinary loop. Note the gate is
`legalLeagueBuild`, not `validateBuild` — a sweep that filters on the flat cap
alone will happily collect builds that cannot race:

```ts
import { baseBuild, setAxisLevel, budgetErrors, buildToTraits } from './services/buildBudget'
import { legalLeagueBuild } from './services/ladderRunner'

const results = []
for (const chassis of ['scout', 'hauler', 'raider'] as const) {
  for (const speed of [2, 3, 4]) {
    const build = setAxisLevel(baseBuild(chassis), 'speed', speed)
    if (budgetErrors(build).length > 0) continue   // cannot happen, asserted anyway
    if (!legalLeagueBuild(build)) continue         // the gate the league actually uses
    results.push({ chassis, speed, traits: buildToTraits(build) })
  }
}
```

Pass the resulting `buildToTraits(build)` as the entrant's `traits` in
`ArenaRunner`. Builds never change pinned rules: an entrant without traits runs
exactly as before, which is the `hauler` baseline and is what the eval pin
assumes.

## Honest limits

- **Navigation is inert.** It is spendable but not in `ACTIVE_AXES`, so the
  screen tags it `roadmap` and the readout says it does nothing yet.
- **`wide-sensor` and `extra-cell` have no sim effect.** Only `armour` and
  `ram-plate` change traits. The readout flags the other two.
- **These are UI rules, not sim rules.** `buildToObservation` is not yet
  appended to any encoder, so a build does not currently change what the policy
  *sees*. It changes the entrant's traits, not its input vector.
- **The training panel configures the builder, not the Train button.** Setting
  generations to 500 changes an ES run and the cost readout; it does not change
  the browser Coach-train optimizer, which stays pinned at 60 epochs / 0.008 /
  0.5x at 30.
- **The curve is enforced twice, in two layers.** `chassis.ts` measures it
  (`budgetSpent`); `ladderRunner.ts` rejects on it (`legalLeagueBuild`);
  `buildBudget.ts` mirrors it (`budgetErrors`) so the panel blocks the build
  rather than letting a player reach the submit-time rejection. If the three ever
  disagree, `services/__tests__/buildBudget.test.ts` fails on
  `legalLeagueBuild` — that test is the tie between them.
