# Clawdy — Generals Arena Inspiration

Source: [https://generals-arena.proudstone-a4a49f60.uksouth.azurecontainerapps.io/docs](https://generals-arena.proudstone-a4a49f60.uksouth.azurecontainerapps.io/docs)

`Generals / Bot Arena` is a hosted, `generals.io`-style bot competition. Players register a bot, connect it over WebSocket to a shared arena, and compete in ranked 1v1 matches. The architecture is clean and intentionally separates humans, bots, observations, queued actions, and replay evidence. This note maps the patterns that are useful to Clawdy and the ones that are not.

## What is useful

### 1. Entrant vs. competitor identity

In the arena, an *entrant* token owns the account and a separate *bot* token actually plays. The entrant can watch while the bot competes, but cannot move for it.

**Clawdy mapping:** the *coach* is the entrant and the *champion* is the bot. The `ArenaSession` should already enforce that a live match is driven only by the selected checkpoint, not by a human clicking controls. We can make this boundary explicit in the event contract: coach messages are `train` / `coach` / `review`; champion messages are `decision` / `action`.

### 2. WebSocket match lifecycle

The arena uses `hello` → `authenticate` → `match_start` → `state` → `match_end`. This makes the match a first-class state machine.

**Clawdy mapping:** the existing `ArenaSession` already has `ready`, `running`, `paused`, `review`, and `finished` phases. We can publish these as an event stream so any future spectator, external coach, or headless evaluator can follow without reaching into React state.

### 3. Queued, sequenced actions with ack and result

A bot sends a `move` with a monotonic `sequence`. The server `ack: accepted` when it enters the queue, then reports `action_result` after the tick resolves. The move can fail at execution without revealing hidden reasons.

**Clawdy mapping:** the policy currently returns an action every 5 ticks and the episode resolves it immediately. We can separate the lifecycle:

1. **Propose/queue:** policy submits `decision` with a sequence number.
2. **Ack:** `ArenaEpisode` validates the action is legal and queues it.
3. **Result:** the next tick reports `action_result`, including `executed`, `blocked`, `cancelled`, or `partial`.

This makes frame-level coaching richer: the coach can see what the policy intended, what the authority accepted, and what actually happened.

### 4. Fog and memory in the observation contract

The bot sees only owned cells and their eight neighbors. Remembered terrain persists, but hidden ownership and army counts are masked. An undiscovered general is indistinguishable from ordinary fog.

**Clawdy mapping:** `ArenaObservation` is already bounded, but it is effectively omniscient within the visible graph. We can add:

- A `fog` flag per node/edge (has the champion actually visited or observed it?)
- A `memory` layer (last-known owner, last-known resource status) that persists after visibility is lost
- A masking rule: nodes the champion has not observed use placeholder or null values instead of the real hidden state

This forces the policy to explore and makes the 24-feature encoder more interesting: it must reason about uncertainty, not just read the world.

### 5. Rule-versioned replays

Replays are pinned to a `rules_version` and are never reinterpreted under a newer engine. The arena supports `classic-1v1-v1` through `v3`.

**Clawdy mapping:** we already use `season-0.reference.2` for simulation rules and `season-0.checkpoint.v1` for checkpoints. The replay file should store `rules_version` and the episode authority must refuse to simulate a replay with a mismatched version. This is mostly a contract discipline; the code path is already close.

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

**Clawdy mapping:** this is future scope, not Season 0. The important architectural point is to keep `ArenaSession` decoupled from any particular pairing service. A future `ArenaLadder` should be able to schedule `champion vs. rival` or `champion vs. champion` matches and write results without changing the episode authority.

### 8. Starter kit pattern

The Python starter exposes `choose_move(frame, player)` and handles the connection boilerplate. The bot author only writes the decision function.

**Clawdy mapping:** `starter/train.ts` already does this for the builder path. We can make the policy interface even clearer: `policy(observation: ArenaObservation, checkpoint: PolicyCheckpoint) => Action`. A future Python or external-language starter would implement the same contract against the WebSocket/HTTP API.

## What is not a fit

- **Grid/turn-based generals rules:** cities, generals, army growth, capture combat, and tile ownership do not map to continuous 3D traversal.
- **Trust-based identity (name list, no passwords):** the hackathon demo is browser-first and single-player; this can be deferred.
- **Hosted multi-entrant matchmaking service:** not in the September 5 critical path.

## Proposed minimal `clawdy:arena` event contract (Season 0)

A sketch of the message surface if we expose `ArenaSession` over a channel:

```json
// server → client
{
  "type": "match_start",
  "match_id": "...",
  "scenario_id": "builder-course-01",
  "rules_version": "season-0.reference.2",
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

This is not an implementation plan. It is a reference shape to keep the existing `ArenaSession`/`ArenaEpisode` contract clean as we add coach UI, headless evaluation, and possibly external policy clients later.

## Priority

1. **Now / Season 0:** queued action lifecycle (`decision → ack → result`), rule-versioned replays, and course-generation invariants in `arenaScenarios.ts`.
2. **Next:** fog and memory in `ArenaObservation` if it improves the MLP without exploding the 24-feature encoder.
3. **Later:** a public `clawdy:arena` WebSocket surface, Elo leaderboard, and external-language starters.
