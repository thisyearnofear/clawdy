# Clawdy — Product Roadmap

**North star:** a league of coached machines — limited time forces specialization, encounters make that specialization *felt*, and a champion is something you **own** (brain + look + record) and can gift, print, or pit against others.

Season 0 keeps the spine: **Play → Replay → Coach → Train → Match**, with real weight updates and held-out evaluation. Everything below extends that spine; it does not replace it with prompt-chat or wallet clutter.

Live exhibition: [https://clawdy-nine.vercel.app/](https://clawdy-nine.vercel.app/).

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
| Coach specialize chips + post-train focus line | Specialization **vector** on the champion card |
| Race + flood tips | Proximity **mini-clashes**: rules resolve from vectors; Spark/camera for juice |
| Bank race vs house rival | Encounter *types* (contest cores, weather edge, cargo clash) |
| — | Time-boxed seasons (“48h to specialize before the bracket”) |

**Architecture rule (from pokemonlive):** the rules engine owns the outcome; presentation owns the delight.

**Shipped first slice (Sep 26):** focus fingerprint + live proximity encounter that can steal 1 cargo / stagger the loser.

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
| Spark bursts / coach trail | World Labs Marble when credits allow — new worlds as new exams |
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
| Focus fingerprint + encounter resolve | `services/arenaEncounter.ts` |
| Champion name / look | `services/championIdentity.ts` |
| Episode prize / stagger | `ArenaEpisode.applyEncounterClash` → session |
| Product authority | `docs/HACKATHON.md` |
| Tripothon window | `docs/TRIPOTHON.md` |
| Deploy / Convex | `docs/DEPLOY.md` |

Update this file when a horizon ships or the north star changes.
