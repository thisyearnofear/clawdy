# CLAWDY

Agentic sandbox on X Layer where autonomous roles compete for weather control, vehicle access, and reward capture in a live onchain game loop.

## Submission Status

This repo is being actively aligned for the **X Layer Arena** track of the X Layer / Onchain OS hackathon.

Current focus:

- X Layer chain pivot
- explicit agent role framing
- Agentic Wallet flow
- Onchain OS / MCP integration
- leaderboard and onchain activity visibility

## Project Intro

`Clawdy` is a real-time 3D sandbox where players and autonomous agents interact with a shared world economy.

Agents can:

- observe world state
- bid on weather changes to influence food/resource density
- rent vehicles to improve mobility and control
- route themselves toward profitable opportunities
- operate under a wallet-authorized autonomy budget

The submission goal is to turn `Clawdy` into an **X Layer-native agentic economy loop**:

1. observe
2. decide
3. spend onchain
4. gain advantage
5. earn
6. repeat

## Architecture Overview

### Frontend

- Next.js App Router frontend
- React Three Fiber powered 3D world
- in-browser HUD for wallet, agent roles, and economy state

### Agent Runtime

- `window.clawdy` public bridge for world state and agent controls
- role-based agent sessions managed in `services/AgentProtocol.ts`
- wallet-authorized autonomy flow via execution-permission style calls

### Onchain Layer

- `WeatherAuction.sol`
  - agents bid for temporary weather control
- `VehicleRent.sol`
  - agents pay for temporary vehicle access

### Indexing Layer

- Envio-based indexer for weather and vehicle activity
- intended for leaderboard, activity proof, and judge-facing metrics

## Agent Roles

The current submission architecture uses a single runtime with multiple documented roles.

- `Operator`
  - supervises the session and authorizes agent budgets
- `Scout Agent`
  - scans world state and identifies profitable routes
- `Weather Agent`
  - bids for climate states that improve expected yield
- `Mobility Agent`
  - leases vehicles and executes movement strategy
- `Treasury Agent`
  - manages spend policy and preserves the earn-pay-earn loop

## Agentic Wallet

`Clawdy` uses an Agentic Wallet style flow for autonomous execution:

1. user connects a wallet on X Layer
2. user grants session-like execution permissions
3. the runtime uses those permissions to submit eligible onchain actions
4. the UI shows whether autonomous execution is active

## Onchain OS / Uniswap Skill Usage

### Current State

The project now includes a **pluggable skill-decision layer** inside the existing agent runtime.

Available providers (toggle via `NEXT_PUBLIC_SKILL_PROVIDER`):

- `onchain-os` — routes skill evaluation through the Onchain OS MCP endpoint; falls back to local policy transparently when the endpoint is unreachable
- `local-policy` — lightweight, deterministic policy engine used as a fallback

Role in the loop:

- MCP-backed skill evaluation helps agents decide when to bid, rent, or route
- skill outputs are surfaced in the terminal and agent status HUD
- provider label and MCP latency are visible for judges to verify

Executable paths:

- weather bid recommendation → weather bid execution
- mobility lease recommendation → vehicle rent execution

## Working Mechanics

### Weather Control

Agents place bids to win temporary control over the weather profile. Weather affects resource conditions in the sandbox, creating a direct economic tradeoff between cost and opportunity.

### Vehicle Rental

Agents pay for temporary access to vehicles with different mobility or combat profiles. Better vehicle access can improve route efficiency and resource capture.

### Resource Collection

Agents and players collect food/resources with different reward and burden effects. This creates a strategic balance between short-term earnings and long-term performance.

### Economy Loop

The target loop for the hackathon submission is:

1. scout identifies opportunity
2. skill layer evaluates expected value
3. treasury approves spending threshold
4. weather or mobility agent executes onchain action
5. agent gains better collection efficiency
6. leaderboard and metrics reflect the outcome

## Deployment Addresses (X Layer Testnet — chain 1952)

- WeatherAuction: `0x723e444ee6d7da19fade372f85da06dd849bf1e0`
- VehicleRent: `0xea88bd6121d181cfd6f60997b4bdd0297ca432fe`
- Deployer: `0x5912d140b58c62ff007D803D25ea7CcC818548D3`
- Frontend: `http://localhost:3000` (local dev)
- Indexer endpoint: `http://localhost:8080/v1/graphql` (local Envio)

## Project Positioning in the X Layer Ecosystem

`Clawdy` is positioned as an **agentic consumer app** for X Layer:

- a game-like interface that turns agent actions into visible user value
- repeated onchain actions that fit X Layer activity and ecosystem goals
- a reusable pattern for agent wallets, skill invocation, and live economic loops

This is not just a static demo contract. The intended value is a persistent, playable, agent-driven environment where X Layer transactions materially affect what happens in the world.

## Team Members

- udingethe — design, product, and contracts

## Repo Structure

```text
app/                  Next.js app shell
components/           3D world, HUD, vehicles, and UI
contracts/            Weather and vehicle game contracts
indexer/              Envio indexing project
services/             Agent runtime, chain config, queueing, contract ABIs
HACKATHON_PIVOT_PLAN.md  Phase-by-phase execution plan
```

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Optional env for indexer-backed leaderboard data:

```bash
NEXT_PUBLIC_USE_XLAYER_TESTNET=true|false
NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS=0x...
NEXT_PUBLIC_VEHICLE_RENT_ADDRESS=0x...
NEXT_PUBLIC_INDEXER_GRAPHQL_URL=https://your-indexer-endpoint/graphql
```

If this is unset, the app falls back to runtime metrics plus placeholder indexed snapshots.

Indexer templates and chain-specific setup live in [indexer/README.md](/Users/udingethe/Dev/clawdy/indexer/README.md:1).

## Current Status

- ✅ Contracts deployed on X Layer testnet
- ✅ Onchain OS / MCP skill provider wired with local-policy fallback
- ✅ Indexer configs updated with deployed addresses and correct chain ID
- ✅ Deployment addresses and team fields filled in
- ⬜ Record a 1–3 minute demo video
- ⬜ Submit via Google Form

## Submission Assets

- demo script: [DEMO_SCRIPT.md](/Users/udingethe/Dev/clawdy/DEMO_SCRIPT.md:1)
- submission checklist: [SUBMISSION_CHECKLIST.md](/Users/udingethe/Dev/clawdy/SUBMISSION_CHECKLIST.md:1)
- X post draft: [X_POST_DRAFT.md](/Users/udingethe/Dev/clawdy/X_POST_DRAFT.md:1)

## Parallel Work Reference

See [HACKATHON_PIVOT_PLAN.md](/Users/udingethe/Dev/clawdy/HACKATHON_PIVOT_PLAN.md:1) for the full phased plan and parallel workstreams.
