# Rung-1 Experiment: Does the Coaching Loop Retain?

Status: designed Oct 7, 2026 — **not yet run**. This is the human validation
gate the playbook audit identified. Code and simulation tests cannot prove it;
only measured human sessions count.

## Question

Does a first-time player complete the core loop —
**Clash → Call → Replay → Coach → Train → Prove** — and come back for a second
session?

## Activation definition

A player is *activated* when, within one session, the local funnel log shows:

1. `run.finished` — a completed Clash round
2. `studio.open` — they opened review/lessons at least once
3. `example.draft` or `mistake.coach` — they engaged a coaching moment
4. `train.done` — they completed a training run

Share events are instrumented but not required for activation:

- `share.result` / `share.card` — an every-session artifact was shared
- `share.copy` — a published replay link was copied from the ladder
- `share.open` / `share.open-fail` — an inbound `?replay=` link was loaded
  (this is the only spread-rung signal we have)
- `session.return` — a boot ≥20h after a completed run (day-2 read; a bounce
  never counts because it requires `hasCompletedRun`)

## Cohort

~30 seeded players recruited directly. No paid traffic. Each gets a link and
one sentence: *"train your rover, beat the house rival."* Funnel data is the
local `clawdy_funnel_v1` log — players export it via Help → copy debug log.

## Pre-agreed thresholds (fixed before looking)

- **YES** — ≥40% finish a Clash round, ≥20% reach `train.done`, and ≥10% return
  within 48h or share at least one artifact.
- **NO** — <20% finish Clash, <10% reach `train.done`, zero returns or shares.
- **UNCLEAR** — between those bands.

## Decision by outcome

- **YES** → build the session-2 surface (async challenges, "your champion raced
  overnight") — retention has a hook worth feeding.
- **NO** → the loop doesn't pull. Redirect effort from league/Forge toward the
  first 60 seconds (guarantee one legible beat per first run — e.g. a
  poach-forced encounter — so "it did the thing" always happens). Rerun.
- **UNCLEAR** → fix the weakest measured step, rerun with the same thresholds.

## What is not evidence

Deterministic replay, eval-gate parity, bracket runs, and internal demos are
rigor about correctness — they say nothing about whether a human wants run 2.
Do not cite them here.
