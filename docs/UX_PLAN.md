# Clawdy UX — Implementation Plan

Goal: turn the working league into a product people *understand on arrival*,
keep discovering at the right moments, and can run as an event for ~100
concurrent players. Sits on top of the league backend (docs/LEAGUE_PLAN.md,
Stream C) and the monetization analysis (docs/MONETIZATION.md § Events).

## Ground rules (carry over from the league plan)

1. **Pins stay frozen.** Eval pins, the Haul gate, the champion's frozen
   trainer config. UX work touches presentation and backend reads — never
   scoring.
2. **Additive and versioned.** New schema fields optional; old rows keep
   working. localStorage schema bumps migrate, never wipe.
3. **Monotonic disclosure.** A player must never lose something they already
   unlocked. Every new surface goes through a pure flag-map module (the
   `engagement.ts` pattern), never an ad-hoc conditional in JSX.
4. **Honest claims.** SUBMISSION_CHECKLIST stays truthful; nothing marked done
   without a test or a documented manual run.
5. **Small commits, tests green** (`vitest`, `tsc`, `eslint`) before each push.
6. **File-boundary discipline.** `ArenaScene.tsx` and `CoachPanel.tsx` are
   multi-owner contention hotspots: put logic in pure `services/` modules and
   keep render-side edits to a single owner per stream where possible.

## Shared interfaces (settle in hour 0–2, then streams diverge)

- `EngagementInput` v2 (`services/engagement.ts`): add `hasChallenged`,
  `hasSubmittedLadder`, `hasWatchedSharedReplay`, `hasForged` to the existing
  two signals. Stage list extends past `trained` (see Stream C).
- `EnvironmentProfile = 'player' | 'spectator' | 'host'` (`services/environment.ts`,
  new): a pure flag-map identical in shape to `engagementView`. Orthogonal to
  engagement — a spectator can also be a first-time visitor.
- `events` table + `eventId` optional field on `brains`/`replays`/
  `tournamentRounds`/`challenges` (Stream A owns the schema diff; everyone
  else consumes the generated types).
- `userActivity` (or a `lastSeenAt` column on an existing per-user row): the
  timestamp the heartbeat compares against.
- Replay indexing: add `userIds: v.array(v.id('users'))` to `replays` (Convex
  can index arrays) so a player's tournament replays are queryable like their
  challenge replays.

## Stream A — League data layer (backend developer)

- **Events.** `events` table: slug/code, name, hostUserId, createdAt, endsAt.
  `joinEvent(code)` mutation stamps `eventId` on the caller's brain.
  `lobby(eventSlug)` query: listed brains, live pairings, standings by rating,
  recent replay share links — one round-trip for the board.
  `runRound`/`challenge` accept an optional `eventId` and scope the pool to it;
  absent = the open league (backwards compatible).
- **Heartbeat.** `league.sinceLastVisit`: challenges + tournament replays
  involving the caller's brains since `lastSeenAt`, compact shape (opponent
  name, result, shareId, tick counts). `league.markSeen` bumps the stamp on
  dismiss.
- **Replay library.** `league.myReplays`: union of challenges-by-user and
  replays-by-`userIds`, sorted desc, share links joined. Powers the library UI.
- Extend `sinceLastVisit`/`lobby`/`myReplays` with tests in
  `convex/__tests__/league.test.ts`: authz negatives (cannot read someone
  else's heartbeat), event isolation (open-league pool excludes event brains
  and vice versa), the `userIds` index returning tournament replays.

Acceptance: convex tests green; `lobby` returns standings for a seeded event;
heartbeat returns only post-`lastSeenAt` items and is idempotent.

## Stream B — Workbench surfaces (frontend developer, owns CoachPanel column)

- **Guided first loop** ("Try it" on first visit): a canned recording boots
  into `reviewFrom` → prompts exactly one coaching action → shows the
  behaviour-change beat (reuse `LessonComparison` framing). The recording can
  be generated headlessly at build/test time (`runArenaEpisode` on the
  practice scenario) or shipped as a small fixture — either way it's an
  asset, not a live sim dependency. This is the role-comprehension fix: the
  aha ("my teaching changed its behaviour") arrives in ~60 seconds.
- **Publish ceremony.** First successful `leagueRun.publish` gets a dedicated
  surface: brain name, season badge, "you're in the pool", suggested first
  challenge from `league.pool`. Replaces the silent list-append.
- **Heartbeat card.** On load (signed in, has brains): "While you were away —
  2W 1L" with replay links; dismiss calls `markSeen`. Renders nothing when
  empty — it must never become a permanent empty widget.
- **Replay library.** A drawer listing `myReplays` — past challenges +
  tournament matches with share links and result labels. Replaces
  "challenges history" as the primary archive surface.
- **Unified settings drawer.** One surface for: sound, camera prefs, forge
  look choice, training config, checkpoint import/export. Pulls the scattered
  localStorage keys into one place; the keys themselves don't move (no
  migration needed — the drawer reads/writes the same services).

Acceptance: first-visit path shows the guided loop; publish → ceremony →
challenge is one continuous flow; heartbeat renders only with real deltas;
settings drawer round-trips every existing key.

## Stream C — Disclosure + environments (frontend developer, owns engagement)

- **Signal extension.** Wire the four new signals into `engagementProgress.ts`
  (storage v2, additive parse — old `clawdy_progress_v1` payloads upgrade in
  place). Update every call site in `ArenaScene.tsx` that can set a signal:
  challenge accepted, ladder submit succeeded, shared replay viewed, forge
  ready.
- **Kill the stage-3 cliff.** Split `AFTER_TRAIN` so broadcast, tournament and
  agent detail reveal on *their own* triggers (e.g. tournament appears after
  first publish, agent detail after first challenge) rather than all firing
  at `hasOwnBrain`. Extend the stage enum; keep monotonicity — write the
  migration test that proves no previously-visible flag regresses.
- **Environment profiles.** `services/environment.ts`: `environmentView(profile)`
  maps `player`/`spectator`/`host` onto render flags (coach column, chrome,
  next-step bar, broadcast). `?replay=` loads apply `spectator`;
  `?env=host` applies `host`; default `player`. Kiosk = spectator + hidden
  chrome.
- **Spectate→play CTA.** On a shared replay: "Train your own brain" button
  that exits review into the first-visit flow — completes the
  QR → spectate → convert funnel. Sets `hasWatchedSharedReplay`.
- **Host board.** `?env=host&event=<slug>`: standings, live pairings, recent
  replays from `league.lobby` — read-only, auto-refresh via the query.

Acceptance: storage v2 upgrades v1 payloads in a test; each post-`trained`
surface has its own trigger documented in `engagement.ts`; the same URL
renders spectator vs host vs player correctly.

## Sequencing

| Window | Work |
| --- | --- |
| 0–2 h | Land shared interfaces: `EngagementInput` v2, `EnvironmentProfile`, `events`/`userIds`/`lastSeenAt` schema. One commit, all tests green, streams branch from it. |
| 2–8 h | A: events + heartbeat + replay library queries. B: guided loop + publish ceremony + heartbeat card. C: signals + environment profiles + share CTA. |
| 8–11 h | B: replay library + settings drawer. C: host board. Integration: wire `eventId` through publish/join UI. |
| 11–13 h | Full gates + a scripted 3-user event smoke (join code → bracket → replay links). Deploy, update checklists, freeze. |

## Risks

- **Guided-loop fixture size.** A canned recording is ~1 MB if naive — trim to
  the beats (or generate headlessly and cache). Don't ship a 1 MB onboarding
  asset to every visitor.
- **Event scope creep.** v1 events = private bracket + join code + board. No
  prizes, no brackets-with-byes UI, no organiser admin panel — those follow.
- **Heartbeat noise.** Only material results (challenges/tournament, not
  practice). If a brain races 50 tournament matches, summarise ("3W 2L across
  5 rounds"), don't list 50 rows.
- **Signal honesty.** `hasChallenged` means a *completed* challenge, not a
  click — read it from server state (matchesPlayed > 0), not a local flag,
  where possible.

## The ambition check

Done right, this is the 100-person event product: QR on a screen → share
link → spectate (environment profile) → "train your own" (CTA) → guided loop
(teaches the role) → publish ceremony (joins the bracket) → host board shows
their brain racing → heartbeat brings them back. Every piece reuses the
disclosure machinery and the verifiable-match backend that already exist.
