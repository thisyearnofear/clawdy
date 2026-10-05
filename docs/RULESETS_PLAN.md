# Rulesets plan: Season 0 as the training ground, richer rulesets after it

Status: proposal, not built. Written after the first chassis results ([CHASSIS_RESULTS.md](CHASSIS_RESULTS.md)).

## Why

Chassis that differ only by small multipliers (a few percent of speed or battery) are not felt in a replay and tend to collapse to one best answer. In the brain-vs-brain bench, Scout beat Hauler 57-14 and Raider 65-15, and tuning the speed bonus from +0.06 to +0.04 did not change that. The fix is not a smaller number. It is rules that give each chassis a different verb, so matches differ in kind and not just in timing.

Those rules cannot go into Season 0 in place. The pinned evals, the Haul gate and the champion `es-g115-c53fbf` are the evidence behind everything we claim. So the new rules live in new rulesets, and Season 0 stays as it is.

## Naming

- **Ruleset**: a versioned set of rules, scenario family and eval, selectable per match. The id travels with the scenario (`rulesetId`, default `season-0`).
- **Season** keeps the meaning Stream C gave it: a time-boxed league number on stored rows. A season runs on one ruleset. Do not use "season" for a ruleset.
- Player-facing: Season 0 is the **Training Grounds**. Later rulesets get their own names.

## Season 0 as the training ground

- Behaviour is unchanged: `ARENA_RULES.version` `season-0.reference.3`, same pins, same champion record, same Haul gate.
- Role: the place to learn the loop (play, replay, coach, train, match) on a simple, well-understood task, and the baseline every brain starts from.
- **Skippable.** A returning player, or one who brings a brain, can go straight to a richer ruleset. Training Grounds stay available as a warm-up and as the benchmark for "does this brain still work."
- Chassis keep working in Season 0 as they do now (optional traits, default Hauler). They are a preview there, not the main event.

## Ruleset architecture (what has to exist first)

1. `rulesetId` on `ArenaScenario` (optional, default `season-0`). Validation, rejection rules and per-agent parameters read the ruleset, not the global `ARENA_RULES`.
2. A ruleset record: `{ id, rulesVersion, defaults, evalPin }`. `ARENA_RULES` becomes the Season 0 record.
3. Stored rows (matches, ladder, league) carry `rulesVersion` already. Ladders and rounds are per ruleset, so ratings never mix.
4. Brains declare which rulesets they support. A checkpoint's input shape (36, 38 or 41 today) is part of that declaration.
5. Everything new is additive. A Season 0 recording must replay identically before and after.

## First new ruleset: Skirmish

Three rule changes, chosen because each uses a mechanism that already exists in the sim (cargo, bumps, fog) and each gives one chassis a different way to win.

| Chassis | Rule | Why it creates a different match |
| --- | --- | --- |
| Hauler | Carries 5 instead of 3. | A real risk and reward choice: carry big and risk a bump, or bank early. |
| Raider | A won bump steals the loser's whole cargo, not one unit. | The map's chokepoints and contested nodes become the game. Scouts and loaded Haulers must route around it. |
| Scout | Sees two hops ahead instead of one. | An information advantage: finds cores and the rival's position sooner. A different way to win than speed. |

The speed, battery and bump-strength traits stay, but as small tuning. The three rules above carry the identity.

### What has to change in the code

- **Capacity per entrant.** `ARENA_RULES.capacity` is read in `arenaEpisode.ts` (validation, collect rejection, bump steal) and hard-coded in the policy code: `policyModel.ts` (encoder normalisation, shortlist logic), `policyTrainer.ts`, `arenaPolicy.ts`, `arenaControllerRules.ts`. These need `self.capacity` from the observation. This is the largest change.
- **Whole-cargo steal.** One line in `#resolveContacts` (the `stolen` amount), gated by a trait.
- **Two-hop vision.** The `visible` set in `observe` and in the resource-seeing code in `arenaEpisode.ts` (about two places) becomes a breadth-first expansion of depth `visionHops`.
- **Traits.** `EntrantTraits` gains `capacity`, `stealAll` and `visionHops`, all optional with Season 0 defaults.
- **Observation and input.** The brain needs to see its capacity and vision. This is a new input shape (an additive extension of the 41-input shape, zero-initialised), plus a new normalisation of cargo by the entrant's own capacity.
- **House bots.** `safe`, `greedy`, `weather` and `poach` assume capacity 3 and one-hop vision. They need the same fix, or Skirmish gets its own house bots.
- **Training and eval.** `train-es` and `eval-es` take a ruleset. Skirmish gets its own held-out variants and its own pin, written to `docs/eval-skirmish.json`. Nothing in the Season 0 pins changes.

### Acceptance

- Season 0 parity: all existing tests pass, and a Season 0 replay is byte-identical before and after the change.
- Each new rule has a unit test (capacity limit, whole-cargo steal, two-hop sight).
- Trained brains per chassis in Skirmish, scored against the house bots and against each other, with several training seeds per chassis. Report the spread.
- A chassis is described as balanced only if no single chassis beats both others across seeds. Otherwise the results doc says which one leads.
- The UI explains the three rules in plain language on the build screen, and the pre-match readout names what each chassis is good at.

## After Skirmish

In priority order, each as its own ruleset:

1. **Active abilities with cooldowns** (a decoy flare, a short sprint, a one-use shield). Moments that stand out in a replay.
2. **Terrain and weather per chassis** (a heavy rover is slow in flood, a light one cannot cross some ridges). Needs more than one landscape to matter.
3. **Capture the flag.** A flag objective on a second landscape, with team or solo play.
4. **Mid-match events** (a core that moves, a closing edge, a second wave of cores) for variation between matches.

## Player journey across rulesets

The disclosure rules in [LEAGUE_PLAN.md](LEAGUE_PLAN.md) (monotonic flags through a pure flag-map, no ad-hoc conditionals) apply to rulesets too.

- **First visit:** the Training Grounds, starting with the guided first loop (one coaching action, then the behaviour change). The recording is generated at runtime from the deterministic sim, not shipped as an asset.
- **Skip:** a returning player or one who brings a brain gets a "skip to Skirmish" path. Skipping is a one-way unlock and does not remove the Training Grounds.
- **Unlock for everyone else:** Skirmish appears after the first publish, with a short explanation of the three rules.
- **Events and ladders are per ruleset.** An event has a join code and runs on one ruleset; ratings never mix across rulesets.
- **Spectators** arriving by a shared replay see the ruleset's name and rules in plain language, then the "Train your own brain" button.

## Workstreams

Each can start once the ruleset record and the per-entrant parameters exist.

| Stream | Work |
| --- | --- |
| Sim (A) | Ruleset record, `rulesetId`, traits, three rule changes, parity tests, house bots. |
| Training (A, server) | Skirmish held-out variants, `--ruleset` flag, multi-seed training and eval, results doc. |
| UI (B) | Ruleset picker, build screen copy for the new rules, Training Grounds skip. |
| League (C) | Per-ruleset ladder and rounds, `rulesetId` on stored rows, rating per ruleset. |
| Journey (U2, U3) | Guided first loop on the Training Grounds, Skirmish unlock and skip, ruleset name and rules on the spectator view. |
| Assets (D) | Chassis bodies that show the rule (a bigger load bed on the Hauler, a ram on the Raider, a mast on the Scout). |

## Status

- **League (C): done in the repo, not deployed.** `rulesetId` is stored on brains, ladder entries, challenges, replays and rounds. Training Grounds is an absent field, so Season 0 rows need no backfill. The ladder holds one entry per account per ruleset; pools, ratings and round numbers are per ruleset (`skirmish-round-N` refs). A brain id is bound to one ruleset, and a cross-ruleset challenge fails with `ruleset-mismatch`. Skirmish publish and submit require a build, since the perks come from the chassis. The ruleset is derived from the stored brains, never from the client. `replayParticipants` and `league.myReplays` are in, with an idempotent `league.backfillReplayParticipants` to run once after deploy. A Skirmish challenge's stored recordings carry `scenario.rulesetId` and the perks, and re-simulate with no divergence (`convex/__tests__/rulesets.test.ts`).
- **Not covered by League (C):** whether Stream A's zero-extended brain input shape loads in the server runner, and the Skirmish house bots (the ladder gives only the submitted champion the perks, as `train-es` does).
- **Assets and submission (D):** the chassis bodies were generated before these rules and do not show them. Showing them means regenerating bodies with Tripo. Submission copy treats Skirmish as roadmap until a multi-seed eval is pinned and the deployed app is checked.
- **UI (B): implemented locally (Oct 6).** Training Grounds/Skirmish picker, returning-player or own-brain skip, monotonic publish unlock, chassis perk descriptions, actual entrant cargo limits, and an unranked Rush-course Skirmish preview. The league drawer selects separate boards and pools, publishes distinct ruleset identities, and passes the ruleset to submit/publish. Original Training Grounds modes and evaluation pins remain unchanged. TypeScript, targeted lint, 620 tests and the production build pass. Browser checks cover ruleset switching and build persistence; screenshot capture times out, and authenticated production publish/challenge verification still requires a deployed backend. Guided first loop and publish ceremony remain U2/U3 work.
- **Still open:** trained Skirmish brains and `docs/eval-skirmish.json` (A), and the Convex deploy plus a live check of the Training Grounds board (the per-ruleset indexes rely on `eq(field, undefined)` matching rows without the field, which passes in `convex-test` but is not yet confirmed on a deployment).

## Time and risk

- The capacity change touches the brain code and must not move any Season 0 behaviour. It is the part most likely to cost time. If it cannot be finished and verified before the submission window closes, Skirmish is described as roadmap and the current chassis stay as the working demo.
- Each retrain takes about 10 minutes per chassis on the server. Multi-seed runs multiply that.
- Balance can only be claimed from several seeds. One training run per chassis already swung a pairing from 39-41 to 15-65.

## References to build on

Found by search; these were read as search summaries only, not reviewed in depth. Check each licence before copying code or assets, and prefer reading them for design over importing them.

| Reference | What it is | What we could take |
| --- | --- | --- |
| [strakam/generals-bots](https://github.com/strakam/generals-bots) | Fast gym-style generals.io environment for RL, with a competition. | The shape of a small, fast bot-development API, and how a leaderboard for bots is run. |
| [strakam/AverageJoe](https://github.com/strakam/AverageJoe) and [arXiv 2606.23348](https://arxiv.org/html/2606.23348v1) | A generals.io bot trained from scratch with self-play PPO. | Self-play as a training mode alongside ES, once brain-vs-brain play is in. |
| [Lux-AI-Challenge/Lux-Design-S1](https://github.com/Lux-AI-Challenge/Lux-Design-S1) and [Lux AI Season 2](https://www.kaggle.com/competitions/lux-ai-season-2) | Resource gathering and allocation with unit types, fog and a replay viewer. | The closest analogue to our game: unit-type design, observation design and how replays are shown. |
| [Battlecode 2025 specs](https://releases.battlecode.org/specs/battlecode25/3.1.0/specs.pdf), [engine](https://github.com/battlecode/battlecode25/tree/master/engine) and the 2021 and 2025 postmortems | A long-running bot competition with several unit types and abilities. | Unit and ability design that stayed interesting over seasons, the engine and client split, and what balance problems came up. |
| [Halite III postmortem (mlomb)](https://mlomb.dev/blog/halite-iii-postmortem), [Two Sigma Halite III](https://www.prnewswire.com/news-releases/two-sigma-launches-halite-iii-the-open-source-competition-for-artificial-intelligence-experimentation-300731998.html) | Ships collecting a resource on a grid. | A direct parallel to our bump rule: the postmortem breaks collision ties by cargo, as we do. Read it before changing the bump rule. |
| [screeps/screeps](https://github.com/screeps/screeps) and [Robocode](https://github.com/robocode-dev) | Programming games where players write bots for a persistent world or an arena. | How programming games keep players engaged over time, and how bots are submitted and run. |
| [Neural MMO](https://puffer.ai/blog/nmmo3), [NeurIPS 2023 competition](https://arxiv.org/html/2508.12524v1) | Many agents on procedural maps with several terrains and resources. | Procedural maps and several resource types, relevant to the "multiplicity of landscapes" goal. |
| [Farama MicroRTS](https://github.com/Farama-Foundation/MicroRTS) | A small RTS built for AI research, with several unit types. | A reference for a compact engine with distinct unit types. |
| [PettingZoo](https://github.com/Farama-Foundation/PettingZoo) | Standard multi-agent environment API. | If we want external harnesses to drive a ruleset, wrapping it in this API is the conventional way. |
| [OpenSkill](https://github.com/vivekjoshy/openskill.py) and [paper](https://arxiv.org/html/2401.05451v1) | Fast multiplayer rating system. | A rating option for per-ruleset ladders. Check what the current ladder uses before changing anything. |
| [Rock, paper, scissors design (Game Developer)](https://www.gamedeveloper.com/design/rock-paper-scissors-design-in-strategy-games) | Design article on counter relationships between unit types. | The argument for counter relationships as a balance safety valve, which is what the Skirmish rules aim for. |
| [THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain) | Procedural terrain generation for Three.js. | A starting point for generating more landscapes. Our current terrain is a Blender-authored mesh, so any new landscape must also produce collision and a pinned route graph. |
| [Quaternius](https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk) and Kenney free assets | CC0-style low poly models. | Set dressing for new landscapes. Chassis bodies stay Tripo-generated. |

## Decisions

1. Skirmish is approved as the first ruleset with the three rules above.
2. Skirmish is a build target for this submission window. If the capacity change cannot be verified in time, fall back to describing it as roadmap.
3. Season 0's player-facing name is **Training Grounds** (approved).
