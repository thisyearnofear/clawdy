# Clawdy: one-week plan to an incredible live demo

Date: 2026-10-01 · Team: 2 developers · Window: 7 days · Status: DRAFT for review (no code changed)
Supersedes the scheduling in `hackathon_plan.md`; the strategy there still applies.

## TL;DR

In a week we can't build the whole vision, so we build **one complete loop that feels great**:

> **Teach a rover** (chat, code, or an AI agent) → **train it so it visibly gets better** → **it races and fights other people's rovers** on hidden maps → **watch it win on a big screen**.

Two tracks, split by file ownership so nobody blocks the other:

- **Dev A: Brain and Arena.** Rush mode (race + battle, authoritative in the sim), real training, server ladder, code-coaching backend.
- **Dev B: Experience.** Everything players see and touch: graphics overhaul, Rush visuals and HUD, path picker, code editor, ladder UI, live-event screen, demo polish.

Not in this week: Clash v2, open-field physics, real-money stakes, phone spectator. They go on the roadmap slide.

## What "incredible" means (the wow moments we're building toward)

1. **First 10 seconds:** two rovers racing across a believable desert basin with dust, tyre tracks, warm low sun, a rising flood. No UI clutter.
2. **First collision:** two rovers hit the same contested core cluster; a visible bump, a slow-mo replay cut, and cargo spills.
3. **First "it learned":** press Train, watch a live fitness curve climb, then watch the trained rover beat the one you started with on a map it's never seen.
4. **First code run:** paste 20 lines (or let an AI agent write them), hit Submit, and watch it appear on the ladder with a rating.
5. **The finale:** a 16-rover cup on the big screen with a cinematic camera, live standings, and a shareable winner card.

## Current-state facts the plan depends on

| Fact | Evidence | Consequence |
|---|---|---|
| Trained rover doesn't beat its teacher | `docs/eval-holdout.json` 19 vs 18; `docs/eval-gate.json` family 73 vs 63 | Training work is on the critical path (A, Day 1-3) |
| Clash/sighting are detected in the UI layer, not the sim | `ArenaWorldView.tsx` `fxCue` prop ("detected by the scene"); `arenaEpisode.ts:446` `applyEncounterClash` is called from outside | Headless/server matches have no clashes. Rush must move contact into the sim step or ladder results won't match what people watch. **Verify in Day 1 spike** |
| Episode can run without physics | `arenaEpisode.ts:275` falls back to `route-reference-v2` when no motion adapter | Server matches can run route-only (cheap, deterministic). Replay still looks good because paths are grounded |
| Transport contract has a bot role but no server | `arenaTransport.ts:1-22` | We don't need it. Bots run client-side in a worker; the ladder runs checkpoints only |
| Collider hash is pinned | `arenaCourse.ts:12` | **Don't change terrain geometry.** Do all terrain beauty as visual-only (textures, shading, decals) |
| Pinned Haul tests and evals exist | `services/__tests__/*`, `docs/eval-*.json` | New rules go in **optional scenario fields**; default Haul behaviour must stay byte-identical |
| `starter/README.md` is stale (24-dim vs 36) | `services/policyModel.ts:82-189` | Fix in a 15-min task (A, Day 1) so agents and builders aren't misled |

## Day-1 contracts (both devs, first 90 minutes, before anyone codes)

Agree these in writing (a short `docs/adal/contracts.md`), so each side can mock the other.

1. **Scenario additions (optional fields, default = Haul):** `mode: 'haul' | 'rush'`, `resources[].spawnTick?`, `resources[].value` up to 3, `rules.contactRadius?`. Dev A implements; Dev B reads them for visuals.
2. **Sim events:** `bump` (ids, position, winner, cargoLost), `coreSpawn` (resource id, tick), `extract` (bank). Dev B subscribes to these in the presentation layer; Dev A emits them from the session.
3. **Convex API (Dev A builds, Dev B mocks first):**
   - `rovers.publish({ name, look, checkpoint }) → roverId`
   - `ladder.list() → [{ roverId, name, look, rating, wins, losses }]` (live query)
   - `ladder.challenge({ roverId, opponentId? }) → matchId` (server picks opponent and hidden seed)
   - `matches.get(matchId) → { recording, result, ratingDelta }`
4. **Code-coach shape (one function type for everything):** `type Teacher = (obs: ArenaObservation) => ArenaAction`. A Teacher is either run as a live Bot (showmatch) or used to label states and distilled into a checkpoint (ladder).
5. **Training stream:** `trainES(config) → AsyncIterable<{ gen, best, mean, checkpoint }>` for the UI curve.
6. **Ownership:** Dev A owns `services/`, `convex/`, `scripts/`, `starter/`, `docs/eval-*`. Dev B owns `components/`, `app/`, `public/`, `scripts/build-arena-terrain.py` (visual only), CSS. **`ArenaScene.tsx` (1,734 lines) is Dev B's alone**; Dev A exposes hooks in `services/` and never edits it. One PR per day each, rebase on `main` every morning.

## Dev A: Brain and Arena

| Day | Work | Done when |
|---|---|---|
| **1** | Spike 1: confirm where clash is triggered and how to make contact authoritative in `ArenaEpisode.step`. Spike 2: time a full route-only match (target < 50 ms). Fix stale `starter/README.md`. Write contracts with B. | Written answers; go/no-go on route-only server sim |
| **2** | **Rush scenarios.** Add the optional fields, validation and a symmetric Rush layout: a centre station, timed core spawns, high-value contested cores, cargo-at-risk when the flood arrives. Move contact (bump: real-radius overlap, loser staggered, cargo spills) into the sim step, emitting events. Haul stays identical. | All pinned tests green; new Rush unit tests (symmetry, determinism, bump) pass |
| **3** | **ES trainer.** Evolution strategies (or CMA-ES) over the 1,857 weights, fitness = banked margin over a pool of opponents on random family seeds, warm-started from the imitation checkpoint. `trainES` async stream; runs in a Web Worker. | Trained beats the teacher on 8 unseen Rush seeds (acceptance bar below) |
| **4** | **Ladder backend.** Convex tables `rovers`, `ladderMatches`, ratings (Glicko-lite); `challenge` action runs the match route-only with a server-generated hidden seed and stores the recording; seed 6-8 house rovers and ghost entrants. | Challenge via API produces a replayable, re-verifiable match |
| **5** | **Code-coaching backend.** `Teacher` type + distillation moved from `scripts/eval-lib.ts` into `services/` (browser-safe). CLI `npm run coach -- teacher.ts` trains and submits. `POST /submit` HTTP action with checkpoint validation. Write `public/llms.txt` + `docs/AGENTS.md` so an AI agent can do it unaided. | An agent given only `llms.txt` can submit a working rover |
| **6** | Hardening: rate limits, payload size caps, duplicate-name rules, replay verification endpoint, eval gate updated (Rush held-out). Help B with integration bugs. | CI green (existing suites + new) |
| **7** | Freeze. Pre-seed the ladder, run full rehearsal, fix only blockers. | Dress rehearsal passes twice |

Fallbacks: if route-only can't match physics results, make route-only the **only** scoring mode and physics purely visual. If Convex can't import `services/`, run challenge matches client-side and re-verify on the server in a mutation.

## Dev B: Experience

| Day | Work | Done when |
|---|---|---|
| **1** | Contracts with A. Set up mocks for ladder and events. **Visual baseline:** sky (gradient or `Sky`/`Environment`), ACES tone mapping, warm low sun, fog tinted away from the terrain colour, shadow map 2048 with a frustum fitted to the camera. | Overview screenshot that's clearly better than today |
| **2** | **Terrain look (visual-only).** Procedural sand albedo + normal/bump via triplanar shader on the loaded GLB; vertex-colour blending between zones instead of per-triangle flat colours; rock material variety. No geometry change. Declutter: route ribbons and base discs hidden by default, shown on hover or in Coach view. Scale the rover visually ×1.5 for readability (physics untouched). | Side-by-side with Day 1 looks like a real place |
| **3** | **Rover feel.** Two persistent tyre-track decals (ring buffer stamped at the wheel positions), wheel-position dust that scales with speed and drifts with wind, speed-based body lean and spring-smoothed pitch/roll, wheel spin tied to speed. Auto "broadcast" camera for matches, reusing `CinematicCamera`. | A rover visibly digs in, kicks dust and leans into turns |
| **4** | **Rush presentation.** Core-spawn beacon (light pillar + sound), contested-centre marker, bump VFX with a short slow-mo and a replay cut, cargo-spill particles, flood as a visible rising wall with countdown, tug-of-war score bar HUD. Subscribes to A's events (use mock events until they land). | Rush looks and reads clearly with the sound off |
| **5** | **Front door and surfaces.** Landing scene with a live match in the background and "Choose your path": Watch / Chat-coach / Code / Agent. Code screen: editor for the `Teacher` (CodeMirror or Monaco), sample templates, Run-in-worker with a visible decision timeout, Submit button. Ladder screen (live query, challenge button, replay viewer). | A new user can get from landing to a submitted rover in under 3 minutes |
| **6** | **Live event mode.** Big-screen cup view: bracket, live standings, auto-director camera, winner reveal, share card (reusing the existing capture). QR join link. Audio pass (synth cues already exist). Integration bug fixing with A. | 16-rover cup runs end to end |
| **7** | Freeze. Record a backup video of the full demo. Rehearse with a stopwatch. | Backup video exists; rehearsal under 5 min |

Performance guardrails: desktop target 60 fps, "lite" path for projector laptops; post-processing (bloom, SSAO) is a stretch and off by default.

## Integration gates

| Gate | When | Pass criteria | If it fails |
|---|---|---|---|
| **G1** | End of Day 1 | Contracts signed; route-only match timed; clash-in-sim approach confirmed | Reduce Rush to "shared centre + proximity clash moved into sim"; drop timed spawns |
| **G2** | End of Day 3 | Trained rover beats teacher on 8 unseen Rush seeds by ≥ 20% banked | Use the fallback: weak but exploitable house opponents, so the demo still shows a clear before/after |
| **G3** | End of Day 4 | Server challenge works; B's UI can play a returned recording | Client-run matches + server verification |
| **G4** | End of Day 5 | A new user can reach the ladder via chat, code and agent paths | Drop the in-browser editor; keep file upload + CLI |
| **G5** | End of Day 6 | **Feature freeze.** Full dress rehearsal on the real demo machine and network | Cut per the order below |

## Cut order (if we fall behind, cut from the top)

1. Post-processing (bloom/SSAO), 2. Agent `llms.txt` polish (keep CLI), 3. Slow-mo bump replay, 4. Server-run ladder → client-run + verify, 5. In-browser editor → upload/CLI only, 6. Timed core spawns in Rush, 7. Tyre-track decals → simple ribbon fix.

Never cut: real training proof (G2), Rush contact in the sim, the ladder, the live cup.

## Acceptance tests for the demo

- Trained rover beats the imitation starter on unseen seeds (≥ 20% banked margin over 50 matches).
- A ladder match reproduces exactly from its recording on a second machine.
- Existing suites stay green: `arenaEpisode`, `versions`, `rolloutPhysics`, `eval-gate`.
- A fresh user completes chat path, code path and agent path from the landing page without help.
- Cold start to first match on screen under 15 seconds on the demo laptop.
- 16-rover cup finishes within 4 minutes on the big screen.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ES doesn't beat the teacher in time | Medium | G2 at Day 3; fallback opponents; widen action set before tuning |
| Rush changes break pinned Haul evals | Medium | Optional fields only; Haul tests run in CI on every PR |
| Terrain visuals tempt a geometry change | Medium | Hard rule: no geometry edits (hash is pinned) |
| Convex can't run the sim | Low-Medium | Client-run + verification fallback |
| Shared hot-file conflicts | Medium | File ownership; A never touches `ArenaScene.tsx` |
| Live demo network failure | Medium | Pre-seeded local ladder mode plus backup video |
| Users' code misbehaves | Medium | Worker sandbox, per-decision timeout, no network; ladder runs checkpoints only |
| Scope creep | High | Cut order above; feature freeze at G5 |

## Open questions

- Demo date and whether Day 7 is a rehearsal day or demo day.
- Which developer takes which track (A is sim/ML/backend-leaning; B is graphics/UI-leaning).
- Is the demo machine online? That decides how far we lean on the hosted ladder.
