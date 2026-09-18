# Scene Layer: Match Authority → Storyboard → Cinematic

Status: **partially implemented**. The deterministic storyboard planner and replay-cam renderer exist (`services/arenaCinematic.ts`, `components/environment/ArenaWorldView.tsx`). AI-generated video scenes are a designed extension point, not implemented or budgeted. No browser QA has run on the cinematic pass.

This document defines how Clawdy turns recorded matches into immersive scenes for live tournament presentation. The reference architecture is the Pocket Battle Lab pattern: **the match authority owns the outcome; the scene layer owns the presentation.**

## Governing Rules

1. **Scenes are artifacts of the recording, never inputs to it.** Every scene is a pure function of an `ArenaRecording` plus presentation configuration. Scene generation can never change a match result, feed observations back to a policy, or influence evaluation.
2. **Prompts are rebuilt from recorded facts.** Any generative stage (AI video, narration, shot planning) receives compact fields and the application reconstructs prompts from the recording. A shot may only reference events that actually appear in the recording: a rover that was never flooded is never shown flooded; a recovery cut requires a real `recoveries` increment.
3. **The degradation ladder always lands on something free.** AI clips → deterministic replay-cam cinematic → manual replay scrub → scoreboard text. A live tournament must keep working when every external API fails.
4. **Generation is never on the match critical path.** Matches run, record, and replay with zero generative dependencies. Scenes amplify a finished recording; they never gate it.
5. **Cost discipline is explicit.** Cache keys are (rover identity, checkpoint id, recording hash). Identical recordings never regenerate. Confirmed retryable failures get at most one retry; unknown outcomes are never blindly resubmitted. A tournament budget cap is set before generation is enabled.

## Pipeline

```
ArenaRecording (checkpoints + batches)
        │
        ▼
planCinematicShots()          deterministic storyboard — pure function of the recording
        │
        ▼
   ┌───────────────┬────────────────────┐
   ▼               ▼                    ▼
Replay-cam      AI video clips        (future: narration,
renderer       (unimplemented)         overlays, share cards)
   │
   ▼
R3F canvas / saved artifact
```

### Stage 1 — Storyboard (implemented)

`planCinematicShots(recording)` scans consecutive recording checkpoints and emits an ordered, contiguous partition of `[0, checkpointCount)` into `CinematicShot`s:

| Shot kind | Triggered by recorded fact |
| --- | --- |
| `establish` | Always opens the reel; wide course framing. |
| `flood` | `weather.flooded` flips false → true. |
| `collect` | A resource's `collectedBy` transitions null → agent id. |
| `bank` | An agent's `banked` increases. |
| `recovery` | An agent's `recoveries` increments. |
| `follow` | Default coverage between events; focuses whichever entrant is in transit most. |
| `finish` | Final checkpoint with `status === 'finished'`; closes the reel. |

When multiple events land on the same checkpoint, one shot wins by drama priority (recovery > flood > bank > collect). The planner validates its output: non-empty, ordered, contiguous shots covering the full frame range. An unfinished or empty recording still yields a valid storyboard — `finish` is only emitted when the recording actually finished.

### Stage 2 — Renderers

**Replay-cam (implemented).** `CinematicCamera` inside the world canvas looks up the active shot for the current `replayIndex`, resolves its focus from the live course (agent position, flood zone, or course center), and cuts or drifts the camera accordingly. `CinematicPlayback` advances `session.seek()` at a fixed frames-per-second, so the reel is the real recorded simulation — deterministic, offline, and free. Hard cuts happen on shot boundaries, mirroring edit grammar rather than camera interpolation.

**AI video (designed, unimplemented).** A future stage consumes the same `CinematicShot[]` and produces short clips, with each shot's `reason` and the recorded facts as the only prompt inputs. Identity anchoring uses a rendered frame of the entrant's actual rover GLB, matching the reference-frame pattern. Approval for any paid generation is required before implementation — see the session/budget rules in `AGENT.md`.

## Variables That Feed Scenes

All scene content derives from fields already in `ArenaSnapshot` / `ArenaRecording`:

- weather transitions (`weather.flooded` boundaries)
- per-agent `banked`, `cargo`, `recoveries`, `transit.edgeId`, `lastOutcome`
- resource `collectedBy` transitions
- `status` / `winner` at termination
- scenario layout (`floods` schedule, edge floodability) for framing context

A scene descriptor (shot kind, span, focus, reason) is itself serializable, so a generated artifact can be audited back to the exact recording span that motivated it.

## Tournament Envelope

- **Prewarm the predictable.** Entrant identities and checkpoints are known before each match; intro/idle assets can be generated before the event and cached on disk.
- **Generate between matches, not during.** A 60 s match yields a ~30 s reel; act boundaries are known the moment the match ends.
- **Assume hostile networking.** The replay-cam path has zero network dependency and is the on-stage floor; generative stages must degrade to it silently.
- **Never claim determinism for generated media.** A fixed seed does not guarantee identical output across providers or prompts. Scenes are presentation artifacts versioned by recording hash, not evidence.

## Non-Goals

- Scenes are not observations and never enter policy inputs, coaching examples, or evaluation.
- Camera choreography is engineered presentation; it must not be attributed to learned-policy behavior.
- No per-decision scene generation — a 1200-tick match has ~5 watchable acts, not 240 shots.
- No live match generation that could stall a tournament schedule.
