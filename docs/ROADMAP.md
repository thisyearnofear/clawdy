# Clawdy — Product Roadmap

**North star:** a league of coached machines — limited time forces specialization, encounters make that specialization *felt*, and a champion is something you **own** (brain + look + record) and can gift, print, or pit against others.

Season 0 keeps the spine: **Play → Replay → Coach → Train → Match**, with real weight updates and held-out evaluation. Everything below extends that spine; it does not replace it with prompt-chat or wallet clutter.

Live exhibition: [https://clawdy.trustfall.xyz/](https://clawdy.trustfall.xyz/).

---

## Status ledger — October 10, 2026

This is a repository-status ledger, not a deployment report. “Implemented locally / in repo” means code exists; it does not mean the complete production journey has been verified. Deferred options below are exploratory references, not approved feature commitments. The learning loop and shared match authority remain the product spine.

| Status | Work | Remaining boundary |
| --- | --- | --- |
| Implemented locally | Kenney CC0 base equipment and gesture-gated sampled audio; Game-icons.net cargo/flood icons and Help credits | Final anchoring verified by code tests; not deployed by this pass; audible review, mobile and final visual verification not performed. |
| Implemented in repo | GitHub/Convex Auth, published brains, ladder evaluation, challenges, scheduled rounds and stored shareable replays (`convex/auth.ts`, `convex/league.ts`, `convex/leagueRun.ts`, `LadderDrawer`) | Existing feature-specific deployment evidence lives in [LEAGUE_PLAN.md](LEAGUE_PLAN.md); no fresh production verification in this update. Authenticated end-to-end checks remain distinct from having code. |
| Partly implemented | Replay library backend (`league.myReplays` and `replayParticipants`) plus shared-replay loading | Dedicated replay-library drawer, return-session heartbeat and overnight-results experience remain open. |
| Open | Guided first coaching loop, first-publish ceremony, heartbeat, replay-library UI and independent disclosure triggers | Follow U2/U3 in [LEAGUE_PLAN.md](LEAGUE_PLAN.md); keep Clash/Prove player labels and monotonic disclosure. |
| Open | Event join codes/private pools, event-scoped rounds, environment profiles and host board | Follow U1/U3 in [LEAGUE_PLAN.md](LEAGUE_PLAN.md); no claim these server/UI paths already exist. |
| Open validation | Human retention experiment | [RUNG1_EXPERIMENT.md](RUNG1_EXPERIMENT.md) remains marked not run; code/funnel instrumentation is not human evidence. Preserve its pre-agreed thresholds unchanged. |
| Open verification | Signed-in production Forge journey; Skirmish evaluation/deployment checks | Follow open items in [LEAGUE_PLAN.md](LEAGUE_PLAN.md) and [RULESETS_PLAN.md](RULESETS_PLAN.md); this docs pass does not close them. |
| Deferred | Unified settings drawer; Rive overlays; broader authored curriculum/season content | Add only after the core loop/validation justifies scope; see [LEAGUE_PLAN.md](LEAGUE_PLAN.md) and [SCENES.md](SCENES.md). |

### Deferred asset options (not commitments)

| Source | Potential role | Gate before use |
| --- | --- | --- |
| [Freesound](https://freesound.org) | Gravel/terrain-contact and flood ambience | Individual licensing + loop/mix/readability needed; no Freesound files imported. |
| [itch.io](https://itch.io) / [OpenGameArt](https://opengameart.org) | One cohesive industrial/desert pack or a specific missing prop/texture, only if the current kit proves insufficient | Pack license/performance/coherence audit first; none imported. |
| [Game-icons.net](https://game-icons.net) expansion | Chassis abilities/energy/route actions | Currently only cargo/flood icons; retain Lucide ordinary controls and per-author CC BY credits. |
| [Lospec](https://lospec.com) | Palette reference for terrain/team/hazard readability, not a pixel-art pivot | No palette change in this pass. |
| [Mixamo](https://mixamo.com) / [Godot](https://godotengine.org) | Not pursuing for the current rover/R3F game; humanoid rigging/Godot plugins not needed | Standalone asset re-use only if a future specific need and license are verified. |

Kenney remains the current supporting-prop/audio source; the terrain and custom rover/chassis assets remain the signature surfaces. Generated worlds, humanoid characters and engine migration are not implied by this list.

---

## What we will not become

- A prompt RPG with no weight update
- Wallet / auction / lease product (retired)
- Live Mint-gen as first-run onboarding
- Ranked ladder before auth + scored-match isolation

---

## Arc 1 — Identity becomes the product

| Now | Next |
| --- | --- |
| Name, look tint, guest key, JSON export | Persistent roster of brains with focus fingerprints |
| Selected Tripo chassis with legacy Mint/procedural fallback; optional Forge backend/panel | Curated skins and a verified signed-in Forge journey; uploads only if separately scoped |
| Share PNG / print STL | “Gift a world” card → shareable run + brain stub |

**Why:** retention attaches to characters, not chrome.

---

## Arc 2 — Specialization → encounters

| Now | Next |
| --- | --- |
| Recorded corrections + approved-notes focus | Checkpoint-bound measured behavior profiles |
| Clash/Rush contact rules plus separate non-scoring proximity cues | Richer encounter types under versioned rules |
| Cargo bumps/steals in Clash alongside collection/banking | Additional contest/weather objectives only after design and evaluation |
| — | Time-boxed seasons (“48h to specialize before the bracket”) |

**Architecture rule (from pokemonlive):** the rules engine owns the outcome; presentation owns the delight.

**Historical Sep 30 baseline (superseded for Rush/Skirmish contact):** Implemented locally (Sep 30; deployment verification pending): focus fingerprint + live proximity cue. Contested-ground proximity is non-scoring — it never transfers cargo or staggers an entrant; score comes only from actual route/pickup/bank behavior. Coached-vs-parent **matched practice comparisons** (same scenario, rival, controller) are evidence of learning, not a held-out ranking.

**Coaching-first rework (Sep 30):** controls precede the arena; Practice replay corrections draft from the recorded pre-decision observation with explicit Approve → Train; `practiceComparison` captures parent/child runs and `LessonComparison`/`PracticeGhost` present them read-only. Keyword guidance is secondary and limited; pickup and full-cargo return stay shared-controller rules. Arena graph, flood behavior, model architecture, versions, trainer settings, and the eval pin are unchanged.

---

## Arc 3 — From exhibition to league

| Now | Next |
| --- | --- |
| Convex Auth, published brains, challenges and scheduled rounds in repo | Authenticated production-journey verification |
| Stored replays + replay participants | Heartbeat + dedicated replay library |
| Local bracket + server rounds | Event join codes / scoped pools / host board |
| Shared replay links + share text/PNG + opt-in clip | Spectate-to-play guided journey |
| — | Ranked only when isolation is real |

---

## Arc 4 — The world as curriculum

| Now | Next |
| --- | --- |
| Sandstone basin + practice/held-out layouts | Course family as seasons (flood calendars, scarcity, rival archetypes) |
| Spark bursts / coach trail | Authored course family with explicit learning challenges |
| — | Explicit syllabus: “this layout punishes X” |

---

## Arc 5 — Two doors, one entrant (then a third)

Keep **player path** (web coach) and **builder path** (`npm run starter:train`) on the same checkpoint format.

Validated JSON checkpoint import/export and frozen Match weights are implemented. Later: an external-language builder/transport interface over the same entrant format, with no arbitrary uploaded code on the physics/inference path.

---

## Horizons

| Horizon | Bet |
| --- | --- |
| **Current gate** | Human rung-1 experiment + first-loop clarity; close verification gaps before expanding scope |
| **Season 0.5** | Authenticated production journey, return surfaces, curated skins |
| **Season 1** | Richer encounters + overnight challenge experience + gift runs (challenge backend exists) |
| **Season 2** | Multi-world syllabus + open entrant format + league ops |

---

## Implementation map

| Concern | Code / docs |
| --- | --- |
| Specialization chips / focus summary / vectors | `services/coachingEngine.ts` |
| Approved-notes fingerprint + proximity presentation gates | `services/arenaEncounter.ts` |
| Champion name / look | `services/championIdentity.ts` |
| Matched practice evidence / replay ghost | `services/practiceComparison.ts` + LessonComparison / PracticeGhost |
| Sampled audio cues + base-equipment props | `services/arenaSound.ts` + `services/arenaDecor.ts` + `components/environment/ArenaProps.tsx` |
| Cargo/flood icons + asset credits | `components/workbench/ViewportHud.tsx` + `public/assets/asset-credits.json` |
| League auth / brains / challenges / rounds / replay library | `convex/auth.ts` + `convex/league.ts` + `convex/leagueRun.ts` + `services/ladderRunner.ts` |
| Product authority | `docs/HACKATHON.md` |
| Tripothon window | `docs/TRIPOTHON.md` |
| Deploy / Convex | `docs/DEPLOY.md` |

Update this file when a horizon ships or the north star changes.
