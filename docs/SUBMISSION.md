# Submission Notes (0G APAC Hackathon)

This file is **not** required for users. It exists to make review/submission easy.

## Basic Project Information

**Project name:** CLAWDY  

**One-sentence description (≤30 words):**  
Clawdy is a real-time 3D agentic economy on 0G where autonomous roles bid for weather control, rent vehicles, and persist long-term memory via 0G Storage.

**Short summary**

- **What it does:** A playable 3D world where agents and players compete in an on-chain economy loop (bid → rent → collect → repeat).
- **Problem it solves:** Makes agent autonomy and on-chain impact visible and verifiable, not just “AI chat + wallet”.
- **Which 0G components are used:** 0G Chain (contracts) + 0G Storage (persistent state snapshots).

## Code Repository

- Repo link: (fill)
- Key folders:
  - `contracts/` (WeatherAuction + VehicleRent)
  - `services/` (agent runtime + 0G Storage client)
  - `app/api/0g-storage/route.ts` (0G Storage upload/download proxy)

## 0G Integration Proof (Required)

### 0G Chain

- WeatherAuction: `TBD`
- VehicleRent: `TBD`

Explorer links:
- https://chainscan.0g.ai/address/<WEATHER_AUCTION>#code
- https://chainscan.0g.ai/address/<VEHICLE_RENT>#code

### 0G Storage

Evidence points:
- `/api/0g-storage?health=1` returns `{ ok: true, configured: true, ... }`
- A successful upload returns `{ rootHash, txHash }` (shown in UI under **Control Center → Stats → Persistence**)

## Demo Video (≤3 minutes)

Use: [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)

Required shots:
1) Connect wallet (0G chain)  
2) Trigger a bid + rent (on-chain)  
3) Open **Control Center → Stats** and show:
   - contract addresses + explorer links
   - 0G Storage status + last rootHash/txHash (if configured)

## Reviewer Notes

### Env vars (local)

```bash
NEXT_PUBLIC_USE_0G_TESTNET=true|false
NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS=0x...
NEXT_PUBLIC_VEHICLE_RENT_ADDRESS=0x...

DEPLOYER_PRIVATE_KEY=0x...   # required for 0G Storage uploads (server-side)
ZG_RPC_URL=https://evmrpc.0g.ai
ZG_INDEXER_URL=https://indexer-storage-mainnet-standard.0g.ai
```

