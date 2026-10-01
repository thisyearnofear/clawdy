# Clawdy: from resource game to a train-then-compete arena

Date: 2026-10-01 · Target: Tripothon hackathon, live demo · Status: DRAFT for review (no code changed)

## TL;DR

Keep the discrete graph as training wheels. Make **one entrant format** (a rover = checkpoint or bot) playable through **four surfaces** (watch, chat-coach, code-coach, AI-agent-coach). Run everyone's rover against everyone else's on **hidden seeds** with **verified replays** and a **live ladder**. Add **modes** that make rovers meet (race, battle), then an **open-space league** as the graduation path.

The demo story: *"Teach a rover any way you like. Then it fights for you while you watch."*

## Where we are (evidence from the code)

| Need | State | Evidence |
|---|---|---|
| One entrant format, two entry paths | Exists | `starter/README.md`: player path and builder path both emit `PolicyCheckpoint` |
| Bot-player wire contract | Types only, no server | `services/arenaTransport.ts:1-22`: "future WebSocket transport"; `role: 'bot'`, `decision` messages |
| Deterministic sim with replay | Strong | `ArenaEpisode` recordings; route-only mode exists when no motion adapter is given |
| Training that beats a baseline | **Not proven** | `docs/eval-holdout.json` 19 vs 18; `docs/eval-gate.json` family 73 vs 63 |
| Human-vs-human | None | Convex schema has no opponent, rating or ladder tables |
| Live-show tooling | Exists | cinematic replay (`arenaCinematic.ts`), `BroadcastPanel`, bracket UI, share card |
| Docs | Stale | `starter/README.md` says 24-dim features; the model uses 36 |

## Design

### 1. Entrant format (unchanged)
A rover is either a `PolicyCheckpoint` (the ~1,857-weight MLP) or a `Bot` (`(obs) => action`). The sim doesn't care which.

### 2. Four coaching surfaces, one pipeline

| Surface | Who it's for | How it works | Status |
|---|---|---|---|
| **Watch** | Audience, judges | Pick a rover, watch bracket matches and cinematic replays | Mostly built |
| **Chat-coach** | Non-coders | Replay, pick a better move, approve, train in-browser | Built |
| **Code-coach, three flavours** | Developers | (a) **Bot**: write the whole policy. (b) **Teacher**: write a labelling function; we distil it into a checkpoint using the existing distillation code. (c) **Fitness**: write the scoring function that self-play uses. | Not built |
| **Agent-coach** | AI-native crowd | Point Claude Code or Cursor at an SDK plus a `/llms.txt` spec; the agent writes and submits the bot or teacher | Not built |

Flavour (c) is the one that makes **training actually work** (see Stage 0).

### 3. Modes: each shines at a different stage of a player's growth

| Stage | Mode | Why it teaches | Change needed |
|---|---|---|---|
| 1 | **Haul** (today's collect game, graph) | Economy, flood risk | None |
| 2 | **Rush** (graph, race) | Shared contested cores, first arrival wins, flood is a deadline: cargo only counts if extracted before the water | Rules change in `arenaEpisode`; new scenario |
| 3 | **Clash** (graph, battle) | Single-occupancy edges plus block, intercept and steal verbs; replaces the proximity RPS | New actions; policy features; new scenario |
| 4 | **Open field** (continuous space) | Graduation: steer, throttle, line choice | New sim; **post-hackathon** |

Graph modes share observation and action schemas, so a checkpoint from Haul still runs in Rush (badly, which is the point: it has to learn).

### 4. Competition layer
- Published rovers go in a global table; the **server** picks opponents, generates **hidden seeds** (map variant, core layout, flood schedule), runs the match, and stores the recording.
- Anyone can re-verify a result by replaying the recording.
- Rating: Elo/Glicko per mode. A live **ladder** plus a scheduled **cup** (16-entrant bracket, already supported by `arenaTournament.ts`).
- House bots and seeded ghosts fill the ladder on day one.

## Stage 0: make training real (gate for everything else)

Why: with 19 vs 18 the pitch "train it and it wins" is false, and a judge will test it.

Approach: **evolution strategies on the 1,857 weights** (or CMA-ES), fitness = banked-score margin over a pool of opponents on random seeds, started from the imitation checkpoint. No gradients needed, runs headless in the existing sim, and gives a live **fitness curve** on screen.
- Acceptance bar: a trained rover beats the teacher by a clear margin on **unseen** seeds. Keep `eval-holdout.ts` and `eval-gate.ts` as the test, and tighten them from "within 1" to "wins".
- Widen the brain: let it choose among more routing options and remove controller overrides that currently decide outcomes (`arenaControllerRules.ts`).
- Fallback if ES stalls: a weak-but-exploitable house bot plus visible improvement against it, so the demo still shows a before and after.

## Build order

| Phase | Deliverable | Demo value |
|---|---|---|
| **P0** | Stage 0 ES trainer + held-out proof | Makes the pitch true |
| **P1** | Server-side match runner (Convex action, route-only sim), hidden seeds, replay storage, published-rover table, ladder | Winner-take-all exists |
| **P2** | Code-coach: in-browser editor (Bot and Teacher), sandboxed in a Web Worker with a tick/time budget; `npm i @clawdy/sdk` plus CLI `submit`; agent spec file | Developer and agent surface |
| **P3** | Rush mode (race) | Rovers finally meet |
| **P4** | Graphics pass (terrain, tracks, dust, lighting, declutter overlays) | First impression |
| **P5** | Live-event layer: QR join, big-screen bracket, final with cinematic replay, phone spectator | The demo itself |
| Later | Clash mode, Open field, seasons, stakes | Roadmap slide |

Cut line if time is short: P0, P1, P2 (Bot only), P5. Rush and graphics are next.

## Demo script (5 minutes)
1. Scan a QR. Pick a path: chat-coach a starter rover, paste a 20-line bot, or let an AI agent write one.
2. Submit. Watch the ladder update live as the server runs matches on hidden maps.
3. Show the **before/after fitness curve** for a trained rover and a verified replay.
4. Run the live 16-rover cup on the big screen with the cinematic camera.
5. Close on the roadmap: Rush, Clash, open field.

## Risks and open questions
- **Server sim:** route-only mode (no physics) is the cheap option. It needs a test that scores match physics-mode results on the same seeds, since physics recoveries can change outcomes. Running Rapier/WASM in Convex is a fallback to check.
- **Untrusted code:** Web Worker sandbox with a per-decision time limit and no network. Server-side execution of user bots is harder and should wait.
- **Copying:** published checkpoints are 1,857 numbers. Keep weights private and expose only results and replays.
- **Legal:** winner-take-all with real money needs review by jurisdiction. The hackathon version should use points, badges and bragging rights only.
- **Scope:** this is far more than a hackathon. The cut line above is the realistic core.
- **Unknown:** hackathon date and team size. Those decide whether Rush and graphics fit.
