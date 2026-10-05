# Clawdy — Product Roadmap

**North star:** a league of coached machines — limited time forces specialization, encounters make that specialization *felt*, and a champion is something you **own** (brain + look + record) and can gift, print, or pit against others.

Season 0 keeps the spine: **Play → Replay → Coach → Train → Match**, with real weight updates and held-out evaluation. Everything below extends that spine; it does not replace it with prompt-chat or wallet clutter.

Live exhibition: [https://clawdy.trustfall.xyz/](https://clawdy.trustfall.xyz/).

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
| Shared Mint champion GLB | Curated skins, then optional Mint-gen / upload (gated) |
| Share PNG / print STL | “Gift a world” card → shareable run + brain stub |

**Why:** retention attaches to characters, not chrome.

---

## Arc 2 — Specialization → encounters

| Now | Next |
| --- | --- |
| Recorded corrections + approved-notes focus | Checkpoint-bound measured behavior profiles |
| Race + non-scoring proximity cues | Contested objectives resolved by policy actions under versioned rules |
| Bank race vs house rival | Encounter *types* (contest cores, weather edge, cargo clash) |
| — | Time-boxed seasons (“48h to specialize before the bracket”) |

**Architecture rule (from pokemonlive):** the rules engine owns the outcome; presentation owns the delight.

**Implemented locally (Sep 30; deployment verification pending):** focus fingerprint + live proximity cue. Contested-ground proximity is non-scoring — it never transfers cargo or staggers an entrant; score comes only from actual route/pickup/bank behavior. Coached-vs-parent **matched practice comparisons** (same scenario, rival, controller) are evidence of learning, not a held-out ranking.

**Coaching-first rework (Sep 30):** controls precede the arena; Practice replay corrections draft from the recorded pre-decision observation with explicit Approve → Train; `practiceComparison` captures parent/child runs and `LessonComparison`/`PracticeGhost` present them read-only. Keyword guidance is secondary and limited; pickup and full-cargo return stay shared-controller rules. Arena graph, flood behavior, model architecture, versions, trainer settings, and the eval pin are unchanged.

---

## Arc 3 — From exhibition to league

| Now | Next |
| --- | --- |
| Practice / Match / local bracket | Convex Auth (or equivalent) → portable champions |
| Guest-key dual-write | Async challenges: drop a brain into someone’s arena overnight |
| Exhibition labeling | Seeded tournaments with pinned rules/world versions |
| Race feed + opt-in clip | Spectator + short clips as the social object |
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

**Later:** validated **imported policies** frozen for Match — no arbitrary uploaded code on the physics/inference path. Endgame: a small open entrant format others can train against Clawdy rules.

---

## Horizons

| Horizon | Bet |
| --- | --- |
| **Now → Oct 5 (Tripothon)** | Polish loop, playtest, demo packet; fingerprint + encounter slice live; encounter *types* designed, not fully content-complete |
| **Season 0.5** | Auth + portable champions; skin packs; fingerprint on share card |
| **Season 1** | Richer encounter set + async challenges + gift runs |
| **Season 2** | Multi-world syllabus + open entrant format + league ops |

---

## Implementation map

| Concern | Code / docs |
| --- | --- |
| Specialization chips / focus summary / vectors | `services/coachingEngine.ts` |
| Approved-notes fingerprint + proximity presentation gates | `services/arenaEncounter.ts` |
| Champion name / look | `services/championIdentity.ts` |
| Matched practice evidence / replay ghost | `services/practiceComparison.ts` + LessonComparison / PracticeGhost |
| Product authority | `docs/HACKATHON.md` |
| Tripothon window | `docs/TRIPOTHON.md` |
| Deploy / Convex | `docs/DEPLOY.md` |

Update this file when a horizon ships or the north star changes.
