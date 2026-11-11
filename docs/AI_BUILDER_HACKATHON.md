# Victoria VR AI Builder Hackathon 2026 — Clawdy Plan

> **Event:** AI Builder Hackathon 2026 (Victoria VR).
> **Source (build-period brief):** https://victoriavr.com/news/ai-builder-hackathon-2026-the-building-period-2042daf3
> **Build period:** Sep 11 – Nov 11, 2026. **Submission deadline:** Nov 11, 2026, 16:30 CEST.
> **Winners:** Nov 25, 2026. **Prize pool:** €20,000 (1st €10k, 2nd €5k, 3rd €3k, 4th €1.5k, 5th €500).
> **Status:** ACTIVE — this is the only open external opportunity. [TRIPOTHON.md](TRIPOTHON.md) is closed and archived.
> **Registration:** the registration period closed; early-benefit participants were contacted by email. Confirm our registered/eligible status before submitting.

## The challenge, in their words

Turn plain language into interactive 3D scenes and working logic. The official rule: "submitted projects [must] turn plain language into 3D scenes and working logic." A system should understand what the user wants, create something meaningful from that input, and let the user interact with or keep shaping the result. Browser-based; any 3D stack (R3F is explicitly listed); backend may be hosted separately as long as the experience stays accessible through judging.

Named directions include: prompt-to-world creation, AI-assisted 3D editing, **intelligent NPCs or autonomous agents**, procedural environments, **AI-generated gameplay systems**, interactive storytelling, collaborative creation tools, multimodal workflows.

## Why Clawdy fits — and the honest read

Clawdy's spine is literally natural language → working logic → observable behavior in a live 3D scene:

1. **Coach in plain language.** The user types tactical guidance (or picks a quick rule); `proposeCorrection` turns it into structured training examples the user approves or rejects.
2. **Real weight update.** Approving examples runs a genuine training pass (momentum SGD) on the policy's MLP — the words change the weights.
3. **The 3D scene behaves differently.** The trained brain drives a rover in the Rapier-physics arena; the lesson card shows which decisions moved. Then Prove locks coaching out and the held-out board shows whether the coaching held.
4. **Plain language → 3D asset.** *Forge your champion*: a signed-in player's text prompt generates a one-of-a-kind rover body server-side via Tripo, live in the arena (verified end to end against the real API).
5. **Keep shaping the result.** The loop is iterative by design — Call a route, scrub the replay, coach the frame, retrain, re-race. The world is the data; the policy is what the human trained.

**Honest gaps (do not oversell in the write-up) — updated Nov 10 after Tracks A–C landed:**

- The NL understanding is now real: four key-gated LLM translators (`/api/arena-intent`, `/api/coach-intent`, `/api/doctrine`, `/api/caster`) with bounded client-side resolvers and deterministic fallbacks. It is still a *bounded* contract — the LLM proposes, resolvers dispose — frame it as "plain language compiles to validated structures," not "prompt-to-anything."
- The arena *terrain* is authored, not prompt-generated (the Marble-generated first arena was retired Sep 26; see git history). But plain language now **re-parameters the 3D scene live**: Describe this Clash remakes floods, core placement/values, duration and the rival on the pinned world — the "3D scenes" half of the rule is parameterization with a playability proof, not geometry generation. Forge adds a bounded free-text descriptor so words also shape the champion's body.
- Judge-facing risk (now reduced, not removed): "autonomous agents" + "AI-generated gameplay systems" remain our strongest named directions; lead with them *and* the describe-the-arena beat.
- Structural gaps identified in the Nov 10 post-Tracks-A–D review — the world is still authored, the entry still reads as a game, and the payoff is too deep — are addressed by **[Winning plan II](#winning-plan-ii--prompt-to-world-certified-nov-10-5-people)** (Tracks F–I), which is the active plan.

**Positioning line:** *an AI-native training league where plain language becomes working logic — you coach a rover in words, its weights actually change, and you watch the 3D arena prove whether your coaching held.*

## Critical review → fix plan (Nov 10)

A critical review against the brief found seven reasons the entry would not win today,
ranked: (1) the core requirement "plain language → 3D scenes and working logic" is only
half-true — coaching input is a keyword matcher (`proposeCorrection`), Forge prompts are
server-built from fixed menus, the world is authored; (2) no live generative-AI surface
the judge can see (Orbis broadcast unverified); (3) first-run friction — no guided first
loop, the payoff beat is three panels deep; (4) missing required deliverables (video,
description, category, registration unconfirmed); (5) unverified surfaces (prod Forge
run, two-account challenge); (6) visual impression reads as "nice little game"; (7)
`node_modules` was space-cleaned, nothing verifiable.

**Fix plan, in priority order (items 1–2 are the code work; 3–5 gate the video):**

| # | Fix | Design | Status |
| --- | --- | --- | --- |
| 1 | **Make the words real** — LLM-backed intent parsing behind the existing correction contract | Free-text guidance is routed through a server-side LLM call (`app/api/coach-intent`, key server-only like the Reactor token broker) whose JSON output is a bounded `CoachIntent`; a pure resolver (`services/coachIntent.ts`) validates it against the *client's* live `observation.availableActions` and builds the same `ArenaTrainingExample` draft `proposeCorrection` produces. The LLM can never invent a legal move — the action must exist in the recorded observation — and the human still approves every example. The keyword matcher stays as the instant path for chips/rules and as the offline/unconfigured fallback. | ✅ Landed — route + resolver + `ArenaScene` fallback chain + `coachIntent.test.ts`. Ops: `COACH_INTENT_API_KEY` (+ optional `COACH_INTENT_BASE_URL`/`COACH_INTENT_MODEL`) must be set in prod or the route 503s to the keyword path. |
| 2 | **Free-text slot in Forge** — plain language → 3D *asset* | `buildForgePrompt(chassis, paint, descriptor?)` appends one bounded descriptor (sanitized, length-capped) to the server-built Tripo prompt; fixed menus remain the structure, credit caps and negative prompt unchanged. UI: one text field in `ForgePanel`. | ✅ Landed — `sanitizeForgeDescriptor` + Convex `start`/`reserve` arg + schema field were already in; `ForgePanel` text field + `mine` descriptor display added Nov 10. |
| 3 | **Judge on-ramp** — a guided first loop | Minimal step highlighter so a judge reaches "your words changed the weights, here is the route that moved" inside two minutes (see ROADMAP "Guided first coaching loop"). | Open |
| 4 | **Prove it once on prod** | One real Forge run + one two-account challenge before any recording. | Open |
| 5 | **Record the <3-min video** | Open with a typed sentence; end on the held-out board. Only after 1–4. | Open |

Honesty rules unchanged: the LLM path is a *proposal* translator, not a new capability
claimed for the policy — the demo claim remains "plain language produced training
examples that changed the weights, verified on a held-out board," and every LLM-derived
example is labeled and human-approved like every other draft. Items 1–2 must keep the
eval-gate pins (`docs/eval-gate.json`) byte-identical — coaching UI and Forge prompts
touch nothing in the match authority, policy, or trainer.

## Winning plan — envelope push (Nov 10, team split)

Supersedes the fix-plan table above as the working plan; items 1–5 there are absorbed
into Tracks C and E below. **Decision: land all five tracks.** The strategic read: our
technical execution is strong (verifiable sim, eval gates, re-simulated replays); the
weakness is exactly where the headline rule points — the world is authored and the
language surface is a keyword matcher. The winning move is making a typed sentence
visibly create and change the 3D world and the agent's behavior, *bounded* on rails
the existing machinery provides (`arenaScenarios` generators, `worldSurface`
grounding, `coachingEngine` → `policyTrainer`). Pure prompt-to-world entries will be
unbounded and fragile; ours stays playable because every generated scenario is
validated — that is a story, not a limitation.

| Track | What | Design | Owner capacity |
| --- | --- | --- | --- |
| **A. Prompt the Arena** | Free text → server-side LLM compiles a bounded scenario spec (flood windows, core values/placement on legal pads, duration, rival pick) → sanitized against the course graph (dry-reachability, base pads, bounds) → instantiated live as an unranked Clash | **Landed (code-complete Nov 10, agent):** `services/arenaCustomClash.ts` (digest + spec sanitizer + course builder — practice-split only, pinned world/nodes/edges cloned untouched, `clash-custom-` id namespace), `app/api/arena-intent/route.ts` (key-gated, 503 → preset fallback), CoachPanel "Describe this Clash" wired via `handleDescribeClash` (ready-phase Training Grounds only; rival bot switch included). 8 tests; tsc/lint/full suite (775) green; **eval-gate PASS — pin reproduced**. Remaining: set `COACH_INTENT_*` in prod + browser smoke (Track E) | ~2 devs, medium-high → done in ~1 |
| **B. Doctrine → Champion** | "Describe a doctrine" — a paragraph → LLM (`/api/doctrine`) → bounded `DoctrineSpec` (signed weights over the five foci) → `expandDoctrine` mines the recorded run: each draft picks a legal alternative at a real recorded tick and carries a measured `rolloutOutcomeDelta` (hard-veto floor −4). `source: 'generated'`, `provenance.kind: 'doctrine'` — distinguishable per the training contract. Local keyword fallback (`heuristicDoctrine`) when the translator is unconfigured | Batch-proposal front end on `coachingReview` + `coachingCandidates`-style rollout measurement. Words → weights → labeled drafts → real checkpoint. Demo beat is the *measured* story per the review amendments | ✅ **Landed Nov 10** — `services/doctrine.ts`, `app/api/doctrine/route.ts`, CoachPanel "Describe a doctrine" panel (review phase), `doctrine.test.ts` 7/7. Ops: `DOCTRINE_API_KEY` (falls back to `COACH_INTENT_API_KEY`) |
| **C. Words work everywhere** | `app/api/coach-intent` + `services/coachIntent.ts` (as designed above) **and** Forge free-text descriptor (`buildForgePrompt(chassis, paint, descriptor?)` + one UI field + one Convex arg) | Makes every NL surface real. Highest certainty per hour — Forge descriptor is a small diff | ✅ **Landed Nov 10** (route, resolver, fallback chain, Forge field; tests + tsc clean). Remaining: set `COACH_INTENT_*` env in prod (Track E ops) |
| **D. Live AI surface** | LLM race caster on `matchTimeline` + `decisionCaption` — deterministic recorded facts in, commentary out | **Landed (code-complete Nov 10, agent):** `services/raceCaster.ts` (fact extraction from the live feed, anchor-number anti-hallucination validation, ≤120-char lines, one cast at a time with an 8s gap; finish always cast), `app/api/caster/route.ts` (503 → deterministic caption stands). Deterministic captions remain the base — the caster only adds a follow-up feed line, never replaces a fact. **TTS dropped per review amendment.** 7 tests. Remaining: prod key + browser smoke (Track E) | ~1 dev, small → done |
| **E. Judge path & packet** | Guided first loop, prod verification (real Forge run, two-account challenge, console-clean), <3-min video, description, category, repo hygiene | Owns the deadline. Also does the registration/email eligibility check first — costs nothing, gates everything | ~1 dev, blocking |

### Guardrails (non-negotiable)

- **LLM proposes, sim disposes.** Every LLM output is validated against legal scenario
  params / `observation.availableActions` before it touches anything. Match authority,
  policy, and trainer stay untouched — eval-gate pins byte-identical.
- **Every AI surface has a deterministic fallback.** Keyword matcher, preset
  scenarios, rule captions. A judge hitting a dead LLM endpoint is worse than no LLM.
  Feature-flag each surface so a bad deploy can be killed without rollback.
- **One new scene only.** Do not touch the terrain pipeline, physics, or visuals
  beyond Track D. "Nice little game" is beaten by "watch me reshape this arena with a
  sentence," not by reskinning.

### Demo narrative this unlocks

Type *"a greedy scavenger that hugs the low road but panics in floods"* → doctrine
compiles, weights train, the rover visibly does the dumb thing described → then
*"make the floods worse and cores scarcer"* → the arena itself changes → re-race.
Prompt-to-world, working logic, and autonomous agents in ~90 seconds, with receipts
(held-out board, replay links) no other entry will have.

### Timeline (~20h remaining, deadline Nov 11 16:30 CEST)

| Hours | Milestone |
| --- | --- |
| 0–1 | Registration confirmed; LLM provider/key chosen (server-only); track leads assigned; feature flags scaffolded |
| 1–6 | Tracks A–D build in parallel; Track E drafts copy and preps recording |
| 6–8 | Merge, eval-gate check (`npm run eval:gate`), prod deploy, end-to-end verification |
| 8–10 | Video recorded on prod per [DEMO_SCRIPT.md](DEMO_SCRIPT.md) updated beats; description + category finalized |
| 10–12 | Buffer, submit early |
| 12+ | Contingency only — nothing new in prod |

If only one envelope feature lands, it is **Track A** — it converts the biggest
disqualification risk into the headline claim. (Corollary from review: this is only
true once E is secured. E is the gate, A is the prize; when the clock bites the cut
order is B → D → A, never E.)

### Review amendments (Nov 10, critical-review pass — binding)

- **E is step zero, with an abort rule.** If the registration/eligibility check fails,
A–D are moot — stop and reassess before any envelope work. The cut order above holds
only after E's registration check passes and the packet path is proven.
- **B is aligned in goal, not in guarantee.** "The rover visibly does the dumb thing
described" is an emergent SGD outcome, not a build promise — never script the video
around it. B ships only as: doctrine → *batch of draft proposals*, each validated like
coach-intent (the action must be legal at a real recorded/practice tick), reusing the
consequence-veto machinery from `eval-lib`; the demo beat is the **measured** story
(drafts approved → real training → lesson-card behavior delta), not "it obeyed the
paragraph." B is first on the cut list when the clock bites.
- **D drops the TTS.** The audio stack is gesture-gated and hard-won; bolting TTS on in
the final day risks a dead surface in front of a judge. Recorded-fact text commentary
only, deterministic captions as fallback.
- **A capacity realism.** The "~2 devs" estimate assumes a team; the actual workforce is
the owner plus the agent. A must start immediately after C closes, and generated
scenarios are **unranked Clash-only** — never near held-out/evaluation sets — so the
eval-gate pins stay byte-identical.
- **A needs two UX decisions before code:** where the player types (candidate: a
"Describe this Clash" box at Clash setup) and what validation failure looks like
(preset fallback + honest message, never a broken arena).

**Agreed execution order:** finish C → registration check (owner, in parallel) → A →
D → B only if ≥5h remain → E's video last, recorded on prod, scripted around guaranteed
visuals (the arena changing under a sentence; the measured lesson card), never around
unguaranteed emergent behavior.

### Track A contract — `ArenaPromptSpec` (for the track owners)

The LLM emits one bounded JSON object; a pure resolver turns it into an
`ArenaScenario` built from the *same* node/edge sets `arenaCourse.ts` already
constructs. The LLM picks placements from a legal-node menu and values inside
caps — it never emits geometry, coordinates, or edges. Everything a player can
break is rejected by the resolver and falls back to the standard course.

```ts
interface ArenaPromptSpec {
  /** 1–4 flood windows; each endTick > startTick, within durationTicks. */
  floods: { startTick: number; endTick: number }[]
  /** 8–24 cores, each on a node from the scenario's legal station menu. */
  resources: { nodeId: string; value: 1 | 2 | 3; spawnTick?: number }[]
  /** Rival house brain + start node from the legal base menu. */
  rival: { policyVersion: 'reference.safe.v2' | 'reference.greedy.v2' | 'reference.weather.v2' | 'house.poach.v1'; baseNode: string }
  durationTicks: 600 | 800 | 1000 | 1200
  /** LLM-proposed label shown in the UI ("Drowned Valley Rush"). Sanitized, ≤40 chars. */
  scenarioName: string
}
```

Resolver duties: clamp/dedupe floods, reject unknown nodeIds and
policyVersions, enforce resource/flood count caps (mirroring `assertScenario`
limits: ≤64 resources, ≤32 floods, `ARENA_RULES.maxDurationTicks`), inject the
champion entrant, assign the seed server-side (never from the LLM), tag the
scenario `split: 'practice'` so it can never pollute held-out evaluation. Same
route shape as `app/api/coach-intent` (`/api/prompt-arena`, `ARENA_PROMPT_API_KEY`,
503 → fallback to the standard course); same client pattern as
`resolveCoachIntent` (validate the reply, never trust it).

## Winning plan II — prompt-to-world, certified (Nov 10, 5 people)

Supersedes the envelope-push plan above as the working plan. **Decision: land all of it**
(F–I plus E). The previous plan made the language surfaces real; it did not make the
*scene* real, and the headline rule is "plain language into interactive 3D scenes and
working logic". This plan closes that gap and turns the two structural weaknesses
(authored world; reads as a game) into the entry's identity.

### The unlock (verified in code, Nov 10)

Terrain is not a hand-made asset — it is an analytic function baked to GLB by Blender:

- `ground_height(x, z)` is ~6 lines of math in `scripts/build-arena-terrain.py:24`
  (ridge + Gaussian channels + boundary rim), with `is_road(x, z)` for material split and
  skirt walls.
- `createWorldSurface(root)` (`services/worldSurface.ts:16`) takes **any** three.js object
  and yields `colliderData()` (`{vertices, indices}`) plus `checkRouteGrounding()`.
- `new ArenaPhysics({vertices, indices})` (`services/arenaPhysics.ts:57`) builds the Rapier
  trimesh from those arrays alone.
- `buildArenaCourse(physics)` / `buildRushCourse(physics)`
  (`services/arenaCourse.ts:134`, `:215`) are pure functions *of the surface*: they
  re-ground `TEMPLATE_STATIONS` by raycast (`groundPoint`, `services/arenaCourse.ts:32`)
  and throw on any sample with `normal.y < 0.7`.

Therefore a heightfield generated in TypeScript flows through the existing surface,
physics and course builders unchanged, and **the existing machinery certifies it is
playable**. Only `loadArenaCourse` (`services/arenaCourse.ts:374`) needs a sibling that
supplies an in-memory mesh instead of fetching a pinned GLB. Physics, renderer, match
authority, policy and trainer are untouched.

### Positioning this buys

*Three sentences make the three artifacts.* "A flooded salt flat under a copper sky" →
geometry. "Hug the low road but panic in floods" → weights. "A scuttling hauler" → a
Tripo chassis. Prompt-to-world, working logic, and generated 3D assets in one product —
and unlike every other prompt-to-world entry, **every generated world ships with a
machine-checked playability certificate**: the world is not just pretty, it is runnable
and measurable.

### The claim, earned — verified in a browser (Nov 11, 01:45 UTC)

The sentence that was previously only true in tests is now true on screen. Headless
Chromium against the dev build, unmodified working tree, two takes:

| Typed description | World built | Receipt on screen |
| --- | --- | --- |
| "a razor-backed basalt canyon with a wide dry riverbed" | *Razor-Backed Canyon* — basalt palette, high ridge, dry valley road | `world generated "Razor-Backed Canyon" · 23/23 stations grounded · 38/38 routes cleared` |
| "a flooded salt flat under a copper sky" (the scripted video line) | *Flooded Copper Salt Flat* — copper palette, low relief, drainage channels | `world generated "Flooded Copper Salt Flat" · 23/23 stations grounded · 38/38 routes cleared` |

Both then ran: the rover drives the generated ground, the flood fires on it
(`Flood · valley slowed`), and the receipt stays pinned under the scene for the whole
run. The refusal path is equally honest — the loader quotes the census it ran
(`… stations grounded, … routes cleared`) and the authored basin stays up.

**Use these words, in this order, everywhere the entry is described:**

> Plain language into a 3D scene is what every entry here will claim. Ours is the one
> that proves the scene is playable before it shows it to you — and refuses when it
> can't. The model proposes bounded parameters; the simulator that scores the authored
> championship runs a 23-probe, 38-route census on the generated ground first, repairs
> the least it can, and only then hands you the world.

Two honesty features to state, not hide: the Blender-authored GLB is still the default
world, and every generated course is practice-split only — it can never satisfy a
scored Prove scenario, so generated terrain cannot touch a ranked result.

Measured numbers safe to quote in copy: 16–160 ms to generate and certify in the
browser · 0 refusals across a 270-corner sweep of the parameter contract · worst-case
relief override after the stepped ladder 325 m³ / 1.28 m of ground (was 665 m³ / 2.61 m)
· 831 tests and `eval:gate` green at the proof commit.

### Shared contract — `WorldSpec` (frozen before any dev starts; this is the API between tracks)

The LLM emits parameters only — never coordinates, vertices, edges or geometry. The
resolver owns every number that reaches the mesh.

```ts
interface WorldSpec {
  landform: 'basin' | 'canyon' | 'plateau' | 'dune-field' | 'salt-flat'
  /** Ridge: corridor x-position and relief it rises to. */
  ridge: { x: number; height: number }        // x 5.5–8.5, height 0.2–1.6
  /** Drainage channels carved off the valley route. */
  channels: { count: number; spacing: number; depth: number } // 0–6, 1.5–4, 0.02–0.2
  rim: { height: number; steepness: number }   // 0–2.2, 1–4
  waterlineOffset: number                      // -0.2 – +0.35 over the authored baseline
  palette: 'sandstone' | 'basalt' | 'slate' | 'oxide' | 'gypsum'
  rockDensity: number                          // 0–1, drives ArenaProps scatter
  scenarioName: string                         // sanitized, ≤40 chars
}
```

`WorldSpec` lives in `services/arenaWorldgen.ts` and is the only symbol F, G and H share.
Digest = SHA-256 over the canonical JSON → `worldId: 'generated-' + digest.slice(0, 8)`,
always `split: 'practice'`.

### Track F — `services/arenaWorldgen.ts`: generate + certify (Dev 1)

Port `ground_height` / `is_road` / skirt walls to TS as a pure function of
`(x, z, WorldSpec)`. Build a displaced `THREE.BufferGeometry` (grid ≤ 200×200, flat
shading — low-poly is a deliberate, on-brand aesthetic, not a fallback). Feed
`createWorldSurface` → `colliderData()` → `new ArenaPhysics` → `buildRushCourse`.

The proof is the deliverable: ground all 19 `TEMPLATE_STATIONS`, run
`checkRouteGrounding` on every edge, and emit
`{ stationsGrounded, routesCleared, repairsApplied, worldDigest, msElapsed }`. Failure
ladder: flatten a pad under the offending station → retry once at reduced relief →
fall back to the pinned authored course with an honest message (never a broken arena).

Owns: `services/arenaWorldgen.ts`, `services/__tests__/arenaWorldgen.test.ts`.
Headless + deterministic → must be fully provable with `npm test` before Dev 2 or the
QA helper ever opens a browser. ~4h.

**LANDED (Nov 10, 23:20 UTC).** Two plan details were wrong and the code follows
reality, not the sketch:

- Routes are **not** audited with `worldSurface.checkRouteGrounding` — it rays the
  whole triangle soup per sample with no BVH, ~60M triangle tests for this course.
  The audit walks each route at the course's own 0.2 m spacing through
  `groundPoint` → Rapier (`arenaWorldgen.ts`, `firstRefusedPoint`), which is
  ~1.6k BVH walks.
- The census is 23 probes (19 `TEMPLATE_STATIONS` + `RUSH_CORE_STATION` + the 3
  `floodZones` grounds) and 38 routes (36 `TEMPLATE_CONNECTIONS` + 2 rush links),
  because `buildArenaCourse`/`buildRushCourse` ground all of them and throw on the
  first refusal. Measured outcome per contract-conforming spec: every landform and
  palette certifies, 16–160 ms, and the pad rung fires on the steepest canyons
  (`repairsApplied` 2–4) instead of refusing them.

`AUTHORED_RELIEF_PLAN` is the port's fidelity reference and is deliberately outside
the contract — its 4.17 m channel gap exceeds `channels.spacing`'s ceiling, which is
how the test proves a generated world can never be a copy of the scored basin. The
87-point fixture is compared against `ground_height`/`is_road` from the shipped
baker, unmodified, at 1e-5.

Two follow-ups for the other tracks. `loadGeneratedCourse` read the refusal through
`generateWorld`, so it reported the generic "could not certify a playable course" —
**switched to `certifyGeneration(spec)` on Nov 11, 01:20 UTC**, which quotes the census (measured refusal for a spec that skipped the sanitizer: `17/23
stations grounded, 13/38 routes cleared (first refusal: cross-n: Unsupported course
surface at 7.00, 2.00)`), which is what `ArenaScene`'s forge status line renders. And
`services/__tests__/arenaWorldIntent.test.ts`'s stub-era loader test was flipped to
the real path (generated + registered scene, and an authored fallback for a spec that
skipped the sanitizer) — that edit crossed file ownership because Track F landing made
the stub assertion false.

**The "mesa" soft spot, measured (Nov 11, 01:20 UTC).** Swept all 270 corners of the
contract space (5 landforms × 3 ridge heights × 3 rim settings × 3 channel loads ×
2 waterlines) and diffed every certified mesh against the analytic relief its own spec
asked for. The pad ladder never produces a plateau: `flatPlateau` vertices (spec slope
> 0.3 repaired to < 0.05) came back **0 for every corner**, and the worst *local* pad
moved 332 of 8 769 vertices by at most 0.19 m — a shallow grade scar, not a mesa. What
actually redraws a canyon is the last rung: a single global `retreatPlan` to 0.55×
relief, measured at 665 m³ of displaced ground and 2.61 m on one vertex in the worst
corner. So the ladder now steps the relief (1 → grade → 0.78 → 0.55 → 0.34) and stops
at the first rung that certifies: same 270 corners, still 0 refusals and 18 repaired,
worst displacement **325 m³ / 1.28 m** — the sim overrides about half as much ground,
and `steps the relief down only as far as the sim insists` locks the number in.

A gradient-clip rung (cap each vertex's neighbour delta to 0.6 m/m, roads excluded from
the apron) was built and measured for this too: identical outcomes on all 270 corners —
it never certified where the pad ladder could not — so it was reverted rather than
shipped as dead weight.

### Track G — `/api/world-intent` + live wiring (Dev 2)

Route mirrors `app/api/coach-intent/route.ts` exactly: provider fallback chain
(`services/llmProviders.ts`), `WORLD_INTENT_API_KEY`, unconfigured → 503 → the client
falls back to the 3-preset world gallery so the surface is never dead. Client-side
sanitizer/clamps in the `resolveCoachIntent` pattern — validate the reply, never trust
it. Then `loadGeneratedCourse(spec)` beside `loadArenaCourse`, and a `TerrainMesh` branch
that accepts an in-memory scene instead of `url`/`sha256` (`ArenaWorldView.tsx:258`).
Palette also drives `BasinSky`, fog and `createTerrainDetailTextures` colors, so a
sentence visibly changes the world's identity, not just its heightmap.

Owns: `app/api/world-intent/route.ts`, `services/arenaWorldIntent.ts`,
`services/arenaCourse.ts` (new export only), `components/environment/ArenaWorldView.tsx`.
~2.5h. Depends on F's `WorldSpec` type, not its implementation — start against the
contract above immediately.

### Track H — the front door is a forge + judge on-ramp (Dev 3)

Reposition, per the review's own finding that the arena "reads as a nice little game":
the first screen is a prompt field over a live wireframe world, not a Play button.
Typing reshapes it; generating is the act and racing it is act two. Three preset worlds
give instant impact for a judge who will not type. Closes the still-open Track E item 3:
a 3-step spotlight — Describe → Coach → Prove — that reaches
"your words made this world and this brain" inside 60 seconds instead of four panels deep.

Owns: `components/workbench/BootScreen.tsx`, `components/workbench/WorldForgePanel.tsx`
(new), `components/environment/ArenaScene.tsx` (entry flow only), `docs/DEMO_SCRIPT.md`.
~2h. Starts on layout/copy against the spec now; needs G for the live reshape.

### Track I — rigor as receipts, not caveats (Dev 3 with Dev 1)

A persistent one-line strip:
`world generated · 19/19 stations grounded · 18/18 routes cleared · 1 lesson trained · +4 banked on held-out`.
The honesty stops reading as "unfinished" and starts reading as "the only entry with
evidence". Paired copy change: in README and the written description, lead the eval claim
with what the champion **beats** (untrained baseline, +21 banked, all four held-out
boards) before the teacher comparison. Never delete a real limitation — reorder it.

Owns: `components/workbench/ReceiptsStrip.tsx` (new), `README.md` claims order. ~1h.

### Track E — packet + ops (2 helpers, unchanged scope, now staffed)

Helper 1 (ops/copy): **prod keys first** — the four translator routes currently 503 to
keyword fallbacks in production because no `COACH_INTENT_API_KEY` / `DOCTRINE_API_KEY` /
caster / `WORLD_INTENT_API_KEY` exist in Vercel production (verified via `vercel env ls
--environment production`, Nov 10). Then registration/eligibility confirmation, the exact
focus-category list, written description, organizer form. Secrets go in the dashboard or
`vercel env add`, never into a committed file — this repo is public.

Helper 2 (verification): browser smoke matrix on prod after deploy (desktop + 375×812,
console-clean, each of the five NL surfaces firing on the LLM path not the fallback),
real Forge run, two-account challenge, `npm run eval:gate`, submission SHA pinning,
and the mobile pass for the video.

### Guardrails (non-negotiable, extended)

- **Frozen for everyone:** `arenaEpisode.ts`, `arenaPolicy.ts`, `policyES.ts`,
  `policyModel.ts`, `policyTrainer.ts`, `arenaProtocol.ts`, `arenaReplay.ts`,
  `scripts/eval-gate.ts`, `docs/eval-gate.json`, `public/terrain/*`,
  `ARENA_WORLD` and its SHA pins. `npm run eval:gate` must stay byte-identical at every
  merge, not just at the end.
- **The authored GLB stays the default course.** A generated world is an opt-in practice
  surface behind a flag; a bad deploy can never take the demo down.
- **LLM proposes, sim disposes** — unchanged, and now load-bearing: the LLM emits
  `WorldSpec` ranges; the resolver owns the mesh.
- **File ownership is the merge plan.** Touch only your track's files; `ArenaScene.tsx`
  is Dev 3's and Dev 2 posts the needed diff there rather than editing it.
- **Claim discipline.** The docs may state "plain language generates certified, playable
  3D terrain" only after the certificate renders on prod and a browser run confirms it.
  Until then the honest line remains "parameterized with a playability proof".

### Timeline (~19h to Nov 11 16:30 CEST / 15:30 UTC)

| Clock (UTC) | Milestone | Who |
| --- | --- | --- |
| now – +0:30 | Prod keys; registration check; `WorldSpec` frozen in this doc; branches cut | Helper 1, all |
| +0:30 – +4:30 | F builds and tests headless; G builds route + sanitizer against the contract; H builds forge screen shell + copy on presets | Dev 1, 2, 3 |
| +4:30 – +6:00 | G wires `loadGeneratedCourse` into the live scene; F review + fixes | Dev 1+2 |
| +6:00 – +7:30 | H wires live reshape + 3-step on-ramp; I strip + claims reorder | Dev 3, Dev 3+1 |
| +7:30 – +8:30 | Merge, `eval:gate`, deploy, prod smoke matrix | all, Helper 2 |
| +8:30 – +12:00 | Hard stop; sleep. On-call fix only | — |
| +12:00 – +14:00 | Second smoke, visual polish on the generated world, fallback recording | Helper 2, Dev 2 |
| +14:00 – +16:30 | Record <3-min video on prod; write description + category | Helper 1, Dev 3 |
| +16:30 – +17:30 | **Prod freeze.** Repo pinned, submission SHA recorded | all |
| +17:30 – +18:30 | Submit with ≥1h to spare; uptime watch through Nov 25 | Helper 1 |

### The video, shot for shot (<3 min, recorded on prod after the smoke matrix)

1. **0:00–0:20** — cold open on the blank prompt field. Type "a flooded salt flat under a copper sky". The wireframe world assembles and repaints. Receipts strip reads `world generated "Flooded Copper Salt Flat" · 23/23 stations grounded · 38/38 routes cleared` — **this is the measured outcome of that exact prompt, verified in a browser on Nov 11; do not re-script it around an assumed number.**
2. **0:20–0:50** — Play. Two autonomous rovers race the *new* terrain. Caster line appears over a recorded fact.
3. **0:50–1:30** — "Hug the low road but panic in floods" → doctrine drafts, approve, train. Lesson card leads with **what your brain actually changed**.
4. **1:30–2:00** — Prove: coaching goes dark, held-out board, score delta against the untrained baseline.
5. **2:00–2:30** — "A scuttling hauler" → Forge generates the chassis body, and it drives out onto the world from shot 1. End card: three sentences, three artifacts, every one certified.

Never script around unguaranteed emergent behavior (the Nov 10 amendment still binds): shot 3 shows the drafts, the training and the measured delta — not a promise that the rover obeys the paragraph literally.

### Cut line (only if the clock collapses; user intent is to land all)

Preserve in this order: **E → F+G (the certified generated world) → H's presets → I →
H's spotlight**. If even that is at risk, ship F+G behind the flag with the preset gallery
on the old course, and describe the generated world as verified-but-beta in the write-up
rather than showing a broken surface.

## Submission packet (their required list)

| Deliverable | Status |
| --- | --- |
| Public code repository | ✅ https://github.com/thisyearnofear/clawdy — keep public and stable through judging |
| Hosted browser demo | ✅ https://clawdy.trustfall.xyz — **now runs the forge and the certificate** (auto-deployed from `d652c9f` at 11:10 UTC, prompt-to-world verified in a browser at 11:12 UTC, 18 s to a certified world, no console errors). Must stay up and functional through Nov 25 |
| Demo video **under 3 minutes** | ✅ recorded and cut — `~/Downloads/clawdy-walkthrough-v1.mp4`, 1:34, 1080p30, narrated (macOS `say`) and captioned, `~/Downloads/clawdy-walkthrough.srt`. Beats: title → type the sentence → translator + census → canyon reveal with the receipt strip → 23/23 / 38/38 punched in → race on generated ground → call the next route → round result → evidence board. **Still open: it needs a hosted URL for the form** (YouTube unlisted / Drive anyone-with-link). Sources and the cut list are in [RECORDING_SCRIPT.md](RECORDING_SCRIPT.md) |
| Short written description (what you built, problem/opportunity, how AI is used) | ☐ **OPEN.** Draft below; honesty rules from the Tripothon era still apply — claim only what is on screen |
| Chosen focus category | ⚠ **The submission form has NO category picker** — walked all 5 pages Nov 10 (inspect values, unsubmitted). T&Cs §6.2.5 still requires "the selected focus category", so it must go **in the written description** (e.g. first line: "Focus category: prompt-to-world creation") and possibly Q11/Q12 answers. Recommend "prompt-to-world creation" if F–I land, else "intelligent NPCs or autonomous agents" |
| Submission channel | ✅ `https://forms.cloud.microsoft/e/XJx86qYjcn` — "AI Builder Hackathon - Submission Form", dropped in Discord ~24h warning. 5 pages / 16 questions: (1) team name + lead email **exactly as registered**; (2) project name, description ("briefly describe your project, the problem it solves, and its main functionality"), "what makes your project unique?"; (3) public repo URL, live demo URL, demo video URL (<3 min), demo access instructions; (4) technologies/frameworks, "how does your project transform natural language into interactive 3D experiences?", third-party materials and licenses; (5) four confirmation checkboxes + Submit. Note: repo/demo/video URLs are format-validated |

## Form answers, ready to paste (Nov 11, 10:45 UTC)

Written against `d652c9f`, pushed to `main` and auto-deployed to production at 11:10 UTC.
Every number is either on screen in the video or in `docs/eval-gate.json` / `docs/eval-es.json`.
Replace the one `[fill]` placeholder (the hosted video URL) before sending.

**Prod, verified after the deploy (Nov 11, 11:12 UTC).** Headed Chromium on
`https://clawdy.trustfall.xyz`, no account: typed *"a flooded salt flat under a copper sky"* →
`world generated "Copper Flooded Salt Flat" · 23/23 stations grounded · 38/38 routes cleared`,
certified in **18 s**, then Play — the rover races that ground, the flood timer fires with the
caster line, and the `Call the next route` card offers three legal options. **Zero console
errors, zero failed requests** on that path. The world translator answers on prod through the
`COACH_INTENT_*` fallback chain (there is no `WORLD_INTENT_*` var; the route is designed to fall
back to it), so the LLM path — not the preset gallery — is what produced that spec.

**Re-run at 11:18 UTC against the later production build, and it is the same story:** the same
sentence → `world generated "Flooded Salt Flat" · 23/23 stations grounded · 38/38 routes
cleared`, certified in **6 s**, zero console errors. The generated name differs between takes
because the translator is an LLM, not a template; the census is fixed at 23 and 38 by the
contract. Certification wall time on prod is therefore **6–18 s for a live LLM round trip** —
the 16–160 ms figure quoted elsewhere is the local generate-and-certify cost with the spec
already in hand, and the two should never be conflated in copy.

### Page 2 — project

- **Project name:** Clawdy
- **Description (what you built, the problem, main functionality):**

> Focus category: prompt-to-world creation.
>
> Clawdy is a browser game about teaching a robot instead of driving one, built around a world
> forge. You type one sentence — "a razor-backed basalt canyon with a wide dry riverbed" — and it
> becomes terrain, a race course, and a round you can actually play. Then you never drive: you
> watch the rovers, call a route at a junction, approve what the rover should have done, and train
> real weights on your own corrections. Coaching goes dark for the held-out test, and the replay
> shows whether your teaching held.
>
> Two problems. First, generated 3D content ships on the assumption that it is usable: nothing in
> the pipeline tells you whether an agent can walk the result, so a pretty mesh can be unplayable
> and you find out after you have built a game on it. Second, machine learning is legible only to
> the people who already understand it — the interesting part of training an agent, what actually
> changed in the weights, is invisible to a player.
>
> Main functionality: a plain-language world forge that generates a heightfield and refuses to
> show it until a physics simulator has certified it; an autonomous rover race on that ground
> with a live AI caster; a coaching loop that turns approved corrections into a gradient update on
> a small neural policy and reports which decisions moved; a locked held-out Prove mode; and a
> server-authoritative ladder and league whose results are re-simulated before they are stored.

- **What makes your project unique:**

> Plain language into an interactive 3D scene is what every entry here will claim. Ours is the one
> that proves the scene is playable before it shows it to you — and refuses when it can't.
>
> The model never touches the mesh. It proposes bounded parameters (landform, ridge position and
> height, drainage channel count and depth, rim height and steepness, waterline, palette, rock
> density) inside a JSON contract, and a sanitizer clamps every field. Then the same shipping
> simulator that gates the authored championship runs a census on the generated ground: 23 ground
> probes and 38 route walks through Rapier, using the identical `groundPoint` slope rule and the
> 0.3 m stand test. Refused ground is repaired a point at a time; if it still fails, the relief
> steps down notch by notch and the sim re-runs. The first version the simulator signs is the one
> you see, and the receipt is rendered on screen under the scene — `world generated "Razorback
> Basalt Canyon" · 23/23 stations grounded · 38/38 routes cleared`, generated and certified in
> 16–160 ms once the parameters are in hand; a typed sentence takes 6–18 s end to end on
> production, because that includes the LLM round trip. If no rung certifies, you are not handed
> a broken arena: the refusal quotes its own census and the authored world stays up.
>
> The same propose-then-verify shape runs through the whole entry: coaching sentences become
> structured examples that are legality-checked before they can train anything, and league
> results are re-simulated server-side rather than trusted from the browser.
>
> The honesty we volunteer: the Blender-authored GLB is still the default world, generated courses
> are stamped practice-only and can never satisfy a scored Prove scenario, and our trained
> champion loses to the `weather` bot 35-45. That number is in the repo and in the video.

### Page 3 — links and access

- **Public repository:** https://github.com/thisyearnofear/clawdy (public; the forge, the certificate and the scatter are all pushed. `main` is at `07512fa`; the last code commit is `d652c9f` — everything after it is documentation. Re-read `git rev-parse main` at submit time and put that SHA in the organizer form; keep it stable through judging)
- **Live demo:** https://clawdy.trustfall.xyz
- **Demo video (<3 min):** `[fill — upload ~/Downloads/clawdy-walkthrough-v1.mp4 to YouTube unlisted or Drive "anyone with link" and paste the URL; the form validates URL format, a local file will not do]`
- **Access instructions:**

> No account needed — open the page and press Play, or type a world description into the "Describe
> a world" panel on the left of the arena. GitHub sign-in is optional and only unlocks the ladder,
> the league and Forge. The walkthrough video is 1:34, 1080p, narrated and captioned; the
> certificate receipt is visible at 0:34. The repository is public and `docs/` contains the
> evaluation results, the asset provenance file and the recording script.

### Page 4 — technology

- **Technologies / frameworks:**

> Next.js 16 (App Router, Turbopack) and React 19 on the front; three.js 0.186 with react-three-fiber
> for the scene; Rapier 0.19.2 for the collider, the ground queries and the certificate census; Convex
> for sync, GitHub auth, the server-run ladder and the league; Vercel for hosting. An LLM behind
> OpenAI-compatible chat endpoints (configured model: `qwen/qwen3.8-flash` through an
> OpenAI-compatible aggregator, with a provider fallback chain) for the world translator, coaching
> intent, doctrine drafting and the race caster. Tripo for generated props and chassis bodies, Mint
> for the champion model, Blender for the authored arena terrain. TypeScript throughout, vitest for
> 846 tests, plus a playability gate script (`npm run eval:gate`) that must pass at every merge.

- **How does your project transform natural language into interactive 3D experiences?**

> In five steps, with a deterministic check at each one. (1) The player's sentence is posted to
> `/api/world-intent`, whose system prompt asks for exactly one JSON object and states every range.
> (2) The reply is parsed and clamped by `sanitizeWorldSpec` — an enum or range violation cannot
> reach the mesh, and a reply the caller cannot parse falls through to the next provider instead of
> killing the surface. (3) `services/arenaWorldgen.ts` builds a heightfield analytically from those
> parameters (ridge, drainage channels, rim falloff, waterline), paints it per palette with slope
> blended into the rock colour, and scatters Tripo rock and scrub props from a seed derived from the
> world digest, so the same sentence grows the same rocks in every take. Props are visual only — they
> never enter the collider, which is why a certificate cannot be gamed by decoration. (4) Rapier runs
> the census: 23 ground probes and 38 route walks with the same slope rule and stand test that gate
> the authored course; refused ground is repaired minimally, then the relief steps down, until it
> passes. (5) Only then does the scene mount, with the receipt strip under it. The result is
> interactive immediately — the rovers race the new ground with their existing learned policies, and
> the flood, the route graph and the replay all read the generated course.
>
> The same pattern handles the other language surfaces: coaching sentences and doctrine paragraphs
> are translated into structured, legality-checked examples or bounded parameter drafts, then a
> deterministic resolver decides what is allowed to train or score anything.

- **Third-party materials and licenses:**

> Every bundled third-party asset is declared with provenance in `public/assets/asset-credits.json`:
> the Tripo ground-scatter set (boulder, monolith, scrub — task IDs and full prompts recorded, textures
> recompressed to 512 px with gltf-transform, runtime re-centred and grounded), Kenney Space Kit 2.0
> (base structures) and Kenney Sci-Fi Sounds (all audio), both CC-BY 3.0, and game-icons.net icons
> (Lorc, Delapouite) with their attribution file. Tripo task IDs for the energy cores and the three
> chassis bodies are recorded in `mint-assets.json` alongside the Mint champion rover, and the AI
> race caster, doctrine and world translator calls are runtime API use, not bundled material. The
> default Sandstone Basin terrain is a Blender-authored GLB, SHA-256-pinned in `services/arenaCourse.ts`;
> the earlier World Labs Marble splat world was retired and remains in git history, while World Labs
> Spark (`@sparkjsdev/spark`) still draws the Gaussian-splat celebration bursts on bank and collect.
> Code dependencies are the MIT/Apache-2 licences published on npm. API keys live only in server-side
> Vercel environment variables and are never committed; the free-tier model quota is the reason every
> language surface has a deterministic fallback.

## Draft description beats

Copy for the form lives here; every number below is measured, and the sentences are the
ones we ship. Focus category goes **in the first line of the written description** — the
form has no picker (see packet table).

- **Focus category (first line):** prompt-to-world creation.
- **What we built:** Clawdy, a browser league where you never drive — you coach. A
  physical 3D arena you can rebuild by describing it, autonomous rovers with real learned
  policies, server-authoritative matches on hidden held-out layouts, and a public,
  re-simulatable replay for every contest.
- **The problem we set out to solve:** making machine learning *legible* to a player, and
  making generated 3D content *trustworthy*. Both halves of that are curation problems:
  which corrections to approve, when to train, and whether a machine-made world is
  actually playable before you bet an hour of racing on it.
- **How AI is used (the honest version):** an LLM translates plain language into three
  different kinds of artifact — terrain parameters, coaching doctrine, and a chassis
  description for Tripo text-to-3D — and a trained MLP policy is updated by the player's
  own approved corrections. In every case the model proposes and a deterministic system
  decides: bounded parameter ranges, a sanitizer, and the same physics simulator that
  gates the scored course.
- **What makes it unique (say it exactly this way):** plain language into an interactive
  3D scene is what every entry will claim; ours is the one that **proves the scene is
  playable before showing it, and refuses otherwise**. Before a generated world appears,
  the shipping simulator runs a census on it — 23 ground probes and 38 route walks
  through Rapier, using the same `groundPoint` slope rule and stand-test that gate the
  authored championship course. Refused ground is repaired a point at a time, then the
  relief steps down notch by notch, and the first version the sim signs is the one you
  see. If none certify, you are not handed a broken arena: the refusal is reported with
  its measurements and the authored world stays up. The receipt —
  `23/23 stations grounded · 38/38 routes cleared` — is rendered on screen under the
  scene, generated and certified in 16–160 ms.
- **The honesty we volunteer before a judge finds it:** the Blender-authored GLB is still
  the default world; generated courses are stamped practice-only and can never satisfy a
  scored Prove scenario; the trained champion does not beat the `weather` bot; and the
  free-tier model behind the world translator throttles, which is why every language
  surface runs a provider fallback chain that rejects a reply it cannot parse.
- **Also on screen:** AI race caster over recorded facts, doctrine drafted from a
  sentence, Forge chassis generation via Tripo, World Labs Spark splats, Convex
  server-run ladder with replay-verified results.

## Remaining timeline (deadline Nov 11, 16:30 CEST)

| When | Milestone |
| --- | --- |
| Now | Confirm registration eligibility + exact focus-category list from the organizer form / T&Cs |
| Before freeze | Record <3-min demo (desktop, plus 375×812 mobile pass); final check that prod runs the coaching loop end to end without a console error |
| Deadline − 2h | Written description + category finalized; repo pinned (submission commit SHA recorded); demo uptime confirmed |
| Nov 11, 16:30 CEST | Submit via the organizer channel |
| Nov 11 → 25 | Keep repo + demo accessible through judging; no force-pushes, no breaking deploys |

## Risks

| Risk | Mitigation |
| --- | --- |
| ~~All four NL translator routes are dark in prod~~ — **RESOLVED Nov 10**: `COACH_INTENT_*` primary + fallback chain pushed to Vercel production; post-deploy smoke shows coach-intent and doctrine answering 200 on the LLM path, arena-intent/caster configured (non-503). `WORLD_INTENT_API_KEY` still needed when Track G's route lands — shares the `COACH_INTENT_*` fallback chain if unset | Helper 2's smoke matrix must still prove each surface fires on the LLM path in a real browser, not just at the route level |
| **Generated world is new geometry in the render+physics path** — could be unplayable, ugly, or slow, and it lands hours before a freeze | F is certified by the existing `groundPoint` / `checkRouteGrounding` proof before it can display; authored GLB stays the default behind a flag; grid capped at 200×200; retry→fallback ladder; hard prod freeze at +17:30 |
| **Five people, one repo, ~19h** — merge conflicts and duplicated work are the realistic failure mode, not the code | `WorldSpec` is frozen in this doc before anyone starts; file-ownership map per track; `ArenaScene.tsx` is Dev 3's alone; `eval:gate` runs at every merge, not just at the end |
| Deadline is the day this plan was written | The product already ships and is live; this is a packaging exercise (video + copy + category), not a build sprint. Cut scope ruthlessly — nothing new in prod before submission |
| ~~Registered status unconfirmed~~ — confirmed Nov 10 | Remaining auth-dependent unknowns: exact category names + the submission channel link (see packet) |
| Focus categories unknown from the public post | Read the T&Cs / submission form; choose the closest named direction, do not invent a category |
| Claiming more NL-magic than exists | The rubric rewards innovation *and* functionality; the verifiable-coaching-loop framing above is fully evidenced in-repo (eval gates, server re-simulation). Keep the honesty discipline from [TRIPOTHON.md](TRIPOTHON.md) |
| Demo must stay up through judging (Nov 25) | Vercel + Convex prod are already live; note the uptime obligation in [DEPLOY.md](DEPLOY.md) operations |

## What changed from the Tripothon plan

- Tripothon S1 closed Oct 5 (winners announced Oct 25) — [TRIPOTHON.md](TRIPOTHON.md) is retained as historical record (track claims, tool-use evidence, provenance), not as an active plan.
- No tool-track constraint here: "the tool itself is not the point. What matters is what you build with it." Tripo / Mint / Spark / Marble remain credited, not scored.
- New hard requirement Tripothon did not have: **plain language must be the input surface**. The coaching loop and Forge are the answer — lead the demo with them.
