# Clawdy — Economics and Monetization (working doc)

Drafted Oct 5 alongside the league backend. This is analysis, not commitment — it
records how the format could make money and which boundaries must not be crossed.

## What the format is

Clawdy sits at the intersection of Fantasy sports and Monster Rancher: the player
is a coach/manager, not a pilot. The skill is curation — which examples to
approve, what build to allocate, when to publish — not reflexes.

Two differentiators versus prior attempts (AI Arena, Kaggle bots, auto-battlers):

1. **Verifiable competition.** Server-authoritative `runMatch`, replay
   verification, and public share links make results *trustable*. This is the
   prerequisite for anything involving stakes, sponsors, or prizes.
2. **A physical offramp.** The Forge → GLB → STL → print pipeline turns a
   trained digital artifact into a physical object. Nothing else in the genre
   does this.

## Monetization vectors, ranked by feasibility

### Tier 1 — differentiated, low infra

- **Physical trophies / Forge prints.** "Print your Season 0 champion" — buying
  the artifact of an accomplishment, like a race trophy. Pipeline already exists
  (`scripts/export-print-stl.py`, Heygears kit). Per-unit margin is thin on
  3D-print fulfillment but scales with seasons ("collect every season").
  **Unvalidated:** print quality — nothing has been test-printed.
- **Cosmetic Forge.** Paints and chassis bodies are menu-based already. Extra
  forge slots / premium paints cost nothing to serve. Identity, not power.
- **Sponsored rounds.** Tripothon *is* this model already — a branded league.
  `runRound` + per-chassis leaderboards make a sponsored tournament easy to run.
  Zero regulatory risk.

### Tier 2 — needs product depth first

- **Insight, not power.** Sell scouting/analytics — opponent replay breakdowns,
  per-axis matchup reports, deeper eval runs — never training compute or stat
  budget. The moment paid compute produces stronger brains, the competition
  dies. Existing credit/limit infra (`FORGE_PER_ACCOUNT_LIMIT`, the point-buy
  curve) already enforces this shape; the boundary must stay absolute.
- **Season pass.** Once brains/builds/ratings persist across a season, a pass
  unlocking cosmetic forge slots, league history, badge tiers, share-link
  customisation is sellable. Requires the season primitive first.

### Tier 3 — highest LTV, hardest

- **Education / team leagues (B2B).** The watch → coach → train → replay loop is
  a legible ML-literacy artifact. Classrooms, camps, corporate onboarding —
  "learn supervised learning by playing." Needs private leagues + admin
  dashboards + sales effort. (See *Events* below.)
- **Staked competition.** Entry-fee brackets with prize pools — the
  fantasy-sports model. The server-authoritative match layer is exactly what it
  needs, but triggers skill-gaming legal review and KYC. Park until there is an
  audience worth lawyering for.

## Events — hackathons and AI onboarding sessions

Beyond a persistent league, the format fits **run-it-as-an-event**:

- **Hackathon format.** A hosted Clawdy bracket is a self-contained competition:
  teams get a starter checkpoint, coach it for N hours, then frozen brains race.
  The server-authoritative match + replay layer is the judge — no subjective
  scoring, every result verifiable and rewatchable. Sponsorship slot for the
  terrain/chassis provider (the Tripothon precedent).
- **AI onboarding sessions.** "Learn to interact with agents" as a workshop:
  the coach→approve→train loop teaches supervision, data curation, and
  iteration viscerally — your corrections literally change what the bot does.
  The Forge/print pipeline gives each participant a physical take-away, and a
  plausible arc is trained-brain → printed chassis → real robot kit later.

Event requirements the platform does not have yet: private brackets/leagues,
time-boxed sessions, an organizer dashboard, and per-event branding. All are
additive on the existing league tables (a `leagueId`/`eventId` dimension).

## Honest constraints

- **The core loop is thin.** Approving examples → watching an MLP race is not
  yet TFT/Pokémon depth. Monetization rides on retention; retention needs more
  coach verbs — scouting, matchup prep, richer sim events (the marker
  fallthrough makes new event types cheap to surface).
- **Tripo costs are real.** 40 credits per chassis body; every Forge call spends
  money. The global credit cap bounds it, but per-forge cost accounting must be
  known before the Forge UI opens to everyone. Free-tier + paid-forge-slots is
  the obvious shape and only works with that number.
- **Replays are the distribution.** Every challenge produces a shareable,
  verifiable artifact. Growth loop: replay link → spectate → want a brain of
  your own. Protect this loop over every other initiative.
- **Pay-to-win is the red line.** Sell identity (forge, paint, physical
  trophies), convenience (extra slots, faster polls), and insight (scouting,
  analytics). Never sell strength — stat budget, training compute, chassis
  advantages.

## Suggested sequence

1. **Season structure** — ratings epochs, season badges, hall of fame. Cheapest
   retention engine; everything else attaches to it. (`season` primitive landed
   in the league backend Oct 5.)
2. **Validate the physical loop once** — print one champion STL via Heygears
   before marketing it.
3. **Forge UI + paid forge slots** — first real transaction, cosmetic only.
   (`ForgePanel` landed Oct 5; mount + prod verify.)
4. **A branded tournament round** — reuse the Tripothon playbook; sponsor-
   sellable today.
5. **Event/league dimension** — private brackets for hackathons and workshops.
6. Park staked competition until the audience exists.

## The bet

*Attachment to a trained artifact + verifiable competition* — Pokémon's
merchandising instinct applied to a thing the player actually built. Every
vector above only works if those two properties stay central.
