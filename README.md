# CLAWDY

Clawdy is a real-time 3D agentic economy on **0G** where autonomous roles bid for weather control, rent vehicles, and persist long-term memory via **0G Storage**.

## What it does / Problem it solves

Most “AI x Web3” demos are either (a) pure AI chat, or (b) pure DeFi bots. **Clawdy** makes autonomy *visible* and *verifiable* by embedding agents into a playable economy loop where:

- decisions are surfaced in UI (agent roles + terminal logs)
- actions settle **on-chain** (weather bids + vehicle rentals on **0G Chain**)
- state persists across sessions (agent economy state saved to **0G Storage**)

## 0G Components Used

- **0G Chain**: smart contracts for weather auctions + vehicle rentals.
- **0G Storage**: persistent agent memory / economy state snapshots (upload + download).

> Optional (nice-to-have): **0G Compute** for inference-backed decisioning. The codebase currently runs a deterministic policy engine with a provider seam for upgrading.

## Architecture (high level)

```mermaid
flowchart LR
  UI[Next.js + R3F 3D World] --> AP[Agent Protocol Runtime]
  AP -->|bid/rent tx| OC[0G Chain<br/>WeatherAuction + VehicleRent]
  AP -->|state snapshots| SAPI[/api/0g-storage (Next.js Route)/]
  SAPI -->|upload/download| OS[0G Storage + Indexer]
  OC -->|events| M[Metrics / Leaderboard]
  AP --> M
```

### Key modules

- Frontend: `app/`, `components/` (Next.js + React Three Fiber)
- Agent runtime & economy: `services/AgentProtocol.ts`, `services/EconomyEngine.ts`, `services/skillEngine.ts`
- On-chain: `contracts/WeatherAuction.sol`, `contracts/VehicleRent.sol`
- 0G Storage integration: `app/api/0g-storage/route.ts`, `services/zgStorage.ts`, `services/PersistenceService.ts`

## Agent Roles (judge-facing)

- **Operator**: connects wallet + enables Agentic Wallet permissions
- **Scout Agent**: identifies best nearby opportunities
- **Weather Agent**: bids when expected yield justifies cost
- **Mobility Agent**: rents vehicles to convert plans into movement
- **Treasury Agent**: enforces spend thresholds and budget policy

## How to run locally

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

### Environment variables

Create `.env.local`:

```bash
# Wallet / chain
NEXT_PUBLIC_USE_0G_TESTNET=true|false
NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS=0x...
NEXT_PUBLIC_VEHICLE_RENT_ADDRESS=0x...

# 0G Storage (server-side route needs a funded key to upload)
DEPLOYER_PRIVATE_KEY=0x...
ZG_RPC_URL=https://evmrpc.0g.ai
ZG_INDEXER_URL=https://indexer-storage-mainnet-standard.0g.ai
```

## Deploy contracts on 0G

This repo includes a minimal deploy script:

```bash
# mainnet (default)
node scripts/deploy.js

# testnet (Galileo)
USE_0G_TESTNET=true node scripts/deploy.js
```

Then copy the printed addresses into `.env.local` and redeploy your frontend.

## Demo Video

Use: [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)

## Submission / Review

If you need the full submission-oriented checklist (contracts, explorer links, proof fields), see: **[SUBMISSION.md](./SUBMISSION.md)**.
