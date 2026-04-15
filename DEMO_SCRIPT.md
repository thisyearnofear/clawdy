# CLAWDY Demo Script

Use this script for a **1 to 3 minute** hackathon demo video.

## Goal

Show that `Clawdy` is:

- an agentic app on X Layer
- driven by role-based agents
- capable of autonomous onchain actions
- built around an earn-pay-earn loop
- designed to upgrade from fallback policy to Onchain OS MCP

## Demo Structure

### Segment 1: Opening Hook

Target length: `10 to 15 seconds`

Show:

- the live `Clawdy` scene
- wallet UI
- provider / activity HUD

Say:

`Clawdy is an agentic sandbox on X Layer where autonomous roles compete for weather control, vehicle access, and resource yield in a live onchain economy loop.`

## Segment 2: Agent Roles

Target length: `20 to 30 seconds`

Open:

- Agent Terminal

Show:

- `Scout Agent`
- `Weather Agent`
- `Mobility Agent`
- role descriptions

Say:

`The app runs a single shared runtime with explicit agent roles. The scout finds opportunities, the weather agent decides when to bid, and the mobility agent leases vehicles to convert plans into movement.`

## Segment 3: Agentic Wallet

Target length: `15 to 25 seconds`

Show:

- wallet connected on X Layer
- `ACTIVATE AGENTIC WALLET`
- autonomy active state

Say:

`The user authorizes an Agentic Wallet budget. After that, approved onchain actions can execute without repeated wallet prompts.`

## Segment 4: Skill Layer

Target length: `20 to 30 seconds`

Show:

- provider status in terminal/HUD
- decision feed entries such as:
  - weather recommendation
  - mobility lease recommendation
  - execution result

Say:

`The runtime includes a pluggable skill-decision seam. Right now the fallback local policy provider is live, and it already drives bid and lease execution. This seam is designed to be replaced by Onchain OS MCP without changing the rest of the app.`

## Segment 5: Onchain Actions

Target length: `25 to 40 seconds`

Show:

- a weather action being triggered
- a vehicle lease being triggered
- the resulting HUD / terminal updates

Say:

`Weather and mobility actions settle onchain. The weather agent spends for temporary control when expected yield is worth it, and the mobility agent leases vehicles when route execution needs a better platform.`

## Segment 6: Proof Layer

Target length: `20 to 30 seconds`

Open:

- leaderboard

Show:

- source badge:
  - `Live Indexed`
  - or `Fallback Snapshot`
  - or `Runtime Only`
- execution counts
- bid/rent breakdown
- yield and collection totals

Say:

`The proof layer shows whether activity is coming from live indexed data, fallback snapshots, or runtime state. The leaderboard tracks executions, yield, and collections so judges can see the economy loop directly.`

## Segment 7: Close

Target length: `10 to 15 seconds`

Say:

`Clawdy turns autonomous agents into a visible X Layer product: observe, decide, spend onchain, gain advantage, earn, and repeat.`

## Recording Notes

- Prefer a desktop recording at full resolution.
- Keep the terminal open for at least one decision and one execution event.
- If the live indexer is not yet available, say clearly that the UI is currently in fallback snapshot or runtime-only mode.
- If the MCP provider is not yet live, say clearly that the current provider is the fallback local policy seam and the runtime is MCP-ready.

## Minimal Recording Flow

If time is tight, record this sequence only:

1. landing scene and HUD
2. connect wallet and activate autonomy
3. spawn roles in the terminal
4. show decision feed
5. trigger weather / lease execution
6. open leaderboard
7. close with the one-line pitch
