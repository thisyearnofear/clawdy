# Clawdy — Generals Arena Inspiration

Source: [https://generals-arena.proudstone-a4a49f60.uksouth.azurecontainerapps.io/docs](https://generals-arena.proudstone-a4a49f60.uksouth.azurecontainerapps.io/docs)

`Generals / Bot Arena` is a hosted, `generals.io`-style bot competition. Players register a bot, connect it over WebSocket to a shared arena, and compete in ranked 1v1 matches. The architecture is clean and intentionally separates humans, bots, observations, queued actions, and replay evidence. This note maps the patterns that are useful to Clawdy and the ones that are not.

Status refreshed October 10, 2026. This is design inspiration, not the runtime specification; `services/arenaProtocol.ts`, `services/arenaTransport.ts` and [COMPATIBILITY.md](COMPATIBILITY.md) own current contracts. A public WebSocket/external-policy service remains future scope.

## What is useful

### 1. Entrant vs. competitor identity

In the arena, an *entrant* token owns the account and a separate *bot* token actually plays. The entrant can watch while the bot competes, but cannot move for it.

**Clawdy mapping:** the *coach* is the entrant and the *champion* is the bot. The `ArenaSession` should already enforce that a live match is driven only by the selected checkpoint, not by a human clicking controls. We can make this boundary explicit in the event contract: coach messages are `train` / `coach` / `review`; champion messages are `decision` / `action`.

### 2. WebSocket match lifecycle

The arena uses `hello` → `authenticate` → `match_start` → `state` → `match_end`. This makes the match a first-class state machine.

**Clawdy mapping:** ArenaSession already emits a typed event stream; `arenaTransport.ts` supplies a transport-agnostic codec/bridge. This is not a deployed WebSocket service.

### 3. Queued, sequenced actions with ack and result

A bot sends a `move` with a monotonic `sequence`. The server `ack: accepted` when it enters the queue, then reports `action_result` after the tick resolves. The move can fail at execution without revealing hidden reasons.

**Clawdy mapping:** The policy decides every five ticks. `ArenaSession` emits sequenced `decision` and `decision_ack` events and accepted/rejected `action_result` events from the in-process authority. `arenaTransport.ts` mirrors those events. A hosted queue, external decision budget and delayed execution-status vocabulary are future transport design, not guarantees of the current runner.

### 4. Fog and memory in the observation contract

The bot sees only owned cells and their eight neighbors. Remembered terrain persists, but hidden ownership and army counts are masked. An undiscovered general is indistinguishable from ordinary fog.

**Clawdy mapping:** `ArenaObservation` is already bounded, but it is effectively omniscient within the visible graph. We can add:

- A `fog` flag per node/edge (has the champion actually visited or observed it?)
- A `memory` layer (last-known owner, last-known resource status) that persists after visibility is lost
- A masking rule: nodes the champion has not observed use placeholder or null values instead of the real hidden state

Fog/memory are a possible future learning challenge for the 36-feature encoder; any observation/architecture change requires versioning and new evaluation evidence.

### 5. Rule-versioned replays

Replays are pinned to a `rules_version` and are never reinterpreted under a newer engine. The arena supports `classic-1v1-v1` through `v3`.

**Clawdy mapping:** Current simulation rules are `season-0.reference.3` and executable checkpoints `season-0.checkpoint.v3`. `arenaReplay.ts` checks recording schema/rules/controller compatibility and mandatory state checkpoints and reports divergence; explicitly supported rotation-equivalent controllers are the documented exception to exact controller matching. Public wire naming is owned by `arenaTransport.ts`, not the historical sketch below.

### 6. Course generation invariants

The generals map generator rejects disconnected passable areas, unfair starts, or starts without exits. It would rather cancel allocation than run an invalid game.

**Clawdy mapping:** `arenaScenarios.ts` can adopt explicit invariants for held-out courses:

- Every start node has at least two reachable exits
- Resource distribution is within a bounded range of the practice scenario
- Flood windows do not isolate the entire course
- Champion and rival starts are not placed in mutually unreachable regions

Rejecting invalid generated courses is stronger than trying to rescue them at runtime.

### 7. Scoring and ladder framing

The arena has ranked matchmaking rounds, Elo, a public leaderboard, and optional casual human challenges.

**Clawdy mapping:** The Convex league now contains published brains, ladder evaluation, challenges, scheduled rounds and shareable replay storage. Production readiness and complete player journeys remain separate checks ([LEAGUE_PLAN.md](LEAGUE_PLAN.md)); no ranked-isolation claim follows from the browser or a backend implementation.

### 8. Starter kit pattern

The Python starter exposes `choose_move(frame, player)` and handles the connection boilerplate. The bot author only writes the decision function.

**Clawdy mapping:** `starter/train.ts` already does this for the builder path. We can make the policy interface even clearer: `policy(observation: ArenaObservation, checkpoint: PolicyCheckpoint) => Action`. A future Python or external-language starter would implement the same contract against the WebSocket/HTTP API.

## What is not a fit

- **Grid/turn-based generals rules:** cities, generals, army growth, capture combat, and tile ownership do not map to continuous 3D traversal.
- **Trust-based identity (name list, no passwords):** unauthenticated name-only identity is not our account boundary; current code uses GitHub/Convex Auth while signed-out practice remains available.
- **Hosted multi-entrant matchmaking service:** a public arbitrary-code bot-hosting/WebSocket service remains outside the current runtime; the existing Convex league runs validated JSON checkpoints.

## Proposed minimal `clawdy:arena` event contract (Season 0)

Illustrative historical sketch only (not valid JSON or the current wire schema). Use `services/arenaTransport.ts` for integrations; this sketch is not evidence of a deployed channel:

```json
// server → client
{
  "type": "match_start",
  "match_id": "...",
  "scenario_id": "builder-course-01",
  "rules_version": "season-0.reference.3",
  "players": ["champion", "rival"],
  "player_index": 0
}

// server → client, every tick
{
  "type": "state",
  "tick": 120,
  "total_ticks": 1200,
  "phase": "running",
  "observation": { ... },
  "action_result": { "decision": "north_low", "status": "executed" }
}

// client → server (bot only, not coach)
{
  "type": "decision",
  "match_id": "...",
  "sequence": 24,
  "action": { "target": "north_low" }
}

// server → client
{
  "type": "match_end",
  "match_id": "...",
  "outcome": "finished",
  "score": { "champion": 12, "rival": 4 },
  "replay_id": "..."
}
```

Illustrative historical sketch only (not valid JSON or the current wire schema); use typed contracts for integrations. It is a reference shape to keep the existing `ArenaSession`/`ArenaEpisode` contract clean as we add coach UI, headless evaluation, and possibly external policy clients later.

## Priority

1. **Implemented foundation:** typed session decisions/acks/results, version-checked replay, starter CLI and Convex league primitives.
2. **Deferred design:** fog/memory and stronger adversarial course invariants, with versioning/evaluation before adoption.
3. **Later:** public authenticated WebSocket transport, external-language starters, and expanded league journeys; no arbitrary uploaded code.
