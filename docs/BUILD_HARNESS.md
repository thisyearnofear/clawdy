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
| Legality | `validateBuild(build)` |

`buildBudget.ts` adds only the presentation-layer rules the sim does not care
about: **how a player spends those 3 points**, and the clamping that stops a
slider offering an illegal build.

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
  maxAffordableLevel, validateBuild, describeBuildSummary,
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
validateBuild(fastest)                  // [] — legal under Stream A's flat cap
maxAffordableLevel('defence', fastest)  // 2 — nothing else is affordable
describeBuildSummary(fastest)           // 'faster than a hauler, … every point is spent.'
```

Overspending is impossible through this API: `setAxisLevel` clamps to
`maxAffordableLevel` and returns the original build if the result would fail
`validateBuild`. A slider mid-drag gets a clamped value, never a throw.

## Round-tripping a build

```ts
import { serializeBuild, parseBuild } from './services/buildBudget'

localStorage.setItem(BUILD_STORAGE_KEY, serializeBuild(build))
const restored = parseBuild(localStorage.getItem(BUILD_STORAGE_KEY))
```

`serializeBuild` refuses to write an invalid build. `parseBuild` never throws:
missing, malformed, or invalid stored data resolves to the hauler baseline, so a
player who predates the Build screen is not broken by it (ground rule 2).

## Sweeping builds headlessly

`validateBuild` is pure, so a sweep is an ordinary loop:

```ts
import { baseBuild, setAxisLevel, validateBuild, buildToTraits } from './services/chassis'

const results = []
for (const chassis of ['scout', 'hauler', 'raider'] as const) {
  for (const speed of [2, 3, 4]) {
    const build = setAxisLevel(baseBuild(chassis), 'speed', speed)
    if (validateBuild(build).length > 0) continue   // cannot happen, asserted anyway
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
