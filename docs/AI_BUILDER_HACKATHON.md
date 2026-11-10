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

**Honest gaps (do not oversell in the write-up):**

- The NL understanding is keyword/rule-matched, not an open-ended LLM parser. Frame it as a bounded coaching contract, not "prompt-to-anything."
- The arena terrain is authored, not prompt-generated (the Marble-generated first arena was retired Sep 26; see git history). What plain language *does* create here is behavior — and, via Forge, the champion's body.
- Judge-facing risk: "autonomous agents" + "AI-generated gameplay systems" are named directions; we lead with those rather than with prompt-to-world.

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

## Submission packet (their required list)

| Deliverable | Status |
| --- | --- |
| Public code repository | ✅ https://github.com/thisyearnofear/clawdy — keep public and stable through judging |
| Hosted browser demo | ✅ https://clawdy.trustfall.xyz — must stay up and functional through Nov 25 |
| Demo video **under 3 minutes** | ☐ **OPEN — the critical path.** Script exists at [DEMO_SCRIPT.md](DEMO_SCRIPT.md); record the plain-language → train → visible behavior-change beat first |
| Short written description (what you built, problem/opportunity, how AI is used) | ☐ **OPEN.** Draft below; honesty rules from the Tripothon era still apply — claim only what is on screen |
| Chosen focus category | ☐ **OPEN.** The building-period post does not enumerate the categories — pull the exact list from the registration flow / Terms & Conditions and pick (candidate framing: autonomous agents / AI-generated gameplay systems) |

## Draft description beats

- **What we built:** Clawdy, a browser league where you never drive — you coach. A physical 3D arena (Blender-authored terrain shared by renderer and Rapier collider), autonomous rovers with real learned policies, server-authoritative matches with hidden held-out layouts, and a public, re-simulatable replay for every contest.
- **The opportunity we explored:** making machine learning *legible* to a player. The skill is curation — which corrections to approve, when to train — and the payoff is watching your agent use what you taught it after you are no longer allowed to help.
- **How AI is used:** a trained MLP policy updated by the player's own approved corrections; Tripo text-to-3D for the generated chassis bodies and Forge; Spark (World Labs) Gaussian splats for celebration effects; Mint-generated champion rover; LLM-adjacent coaching surfaces. Every tool named here is on screen in a live run or credited in the repo.

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
| Deadline is the day this plan was written | The product already ships and is live; this is a packaging exercise (video + copy + category), not a build sprint. Cut scope ruthlessly — nothing new in prod before submission |
| Registered status unconfirmed | Check email from the organizers / hackathon login before anything else |
| Focus categories unknown from the public post | Read the T&Cs / submission form; choose the closest named direction, do not invent a category |
| Claiming more NL-magic than exists | The rubric rewards innovation *and* functionality; the verifiable-coaching-loop framing above is fully evidenced in-repo (eval gates, server re-simulation). Keep the honesty discipline from [TRIPOTHON.md](TRIPOTHON.md) |
| Demo must stay up through judging (Nov 25) | Vercel + Convex prod are already live; note the uptime obligation in [DEPLOY.md](DEPLOY.md) operations |

## What changed from the Tripothon plan

- Tripothon S1 closed Oct 5 (winners announced Oct 25) — [TRIPOTHON.md](TRIPOTHON.md) is retained as historical record (track claims, tool-use evidence, provenance), not as an active plan.
- No tool-track constraint here: "the tool itself is not the point. What matters is what you build with it." Tripo / Mint / Spark / Marble remain credited, not scored.
- New hard requirement Tripothon did not have: **plain language must be the input surface**. The coaching loop and Forge are the answer — lead the demo with them.
