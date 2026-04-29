# Clawdy: Outsmart the AI

> **vibejam2026 entry** — [Play now: clawdy-nine.vercel.app](https://clawdy-nine.vercel.app) · No wallet needed to drive.

**Outsmart autonomous AI agents in a live 3D arena.** Steal their food, hijack their weather, beat their score. The agents are real opponents — they observe, decide, and spend on-chain in real time. Your job is to be smarter, faster, and meaner than four of them at once.

Clawdy is a decentralized application on 0G where autonomous AI agents are the primary opponents in a high-agency game economy. The environment — the climate — is a tradable asset they will outbid you for if you let them.

## Architecture

Clawdy runs on 0G — contracts and storage on one chain so players connect once and never switch networks:

- **0G Chain (Game Layer):** All game contracts — weather auctions, vehicle rental, and EIP-712 signed meme-ability minting — settle on 0G Galileo Testnet. Fast EVM for real-time bidding.
- **0G Storage (Persistence Layer):** Agent decision rationales and round state persist decentralised-ly — they survive refreshes and sessions, giving agents verifiable memory.
- **Supabase (Real-time Layer):** Handles real-time player presence, leaderboard, and weather state sync across all connected clients.

## Key Features

- **Four AI Opponents With Real Personalities:** Scout hunts the highest-value drops, Weather hijacks the auction, Mobility runs the best routes, Treasury locks in the wins. Each has its own risk tolerance, budget reserve, and cooldowns — they don't all play the same game.
- **You're Not Watching, You're Racing Them:** The agents bid on-chain, lease vehicles on-chain, and collect food in the same arena. They feel beatable but punishing — the AI carries a 20% suboptimal-target rate and ±15% turn wobble, but it never sleeps.
- **Weather Is a Weapon:** Win the auction and you control storms, fog, and gravity. Lose it and you're driving through their mud traps and flood while they collect.
- **Dynamic Terrain:** Storms create mud, rain creates flood, presets shift gravity — every weather state changes how the arena drives.
- **On-Chain Asset Loop:** Collect food, mint signed-proof abilities via EIP-712, deploy them as global game-state boosts — all on 0G.
- **Real-time Multiplayer:** Supabase Presence channels provide instant player count and live leaderboard.
- **Pluggable Skill Layer:** Local policy provider ships today; the same seam upgrades to Onchain OS / MCP without touching the rest of the runtime.

## Quick Start

1. Install dependencies: `npm install`
2. Set your environment:
   ```bash
   cp .env.example .env.local
   # Update with your RPCs, Chain IDs, and Supabase credentials
   ```
3. Run the development server: `npm run dev`

## Development

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # Run ESLint
npm test           # Run Vitest tests (85 tests)

# Smart contract tests (Foundry)
cd foundry && forge test
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Three.js, Rapier Physics |
| State | Zustand, React Query |
| Web3 | Wagmi, Viem, Ethers (0G Storage SDK) |
| Real-time | Supabase Presence + Realtime subscriptions |
| Persistence | localStorage, 0G Storage, Supabase |
| Monitoring | Sentry |
| CI/CD | GitHub Actions |
| Contracts | Solidity 0.8.20+, Foundry |

## Team & Contribution

Clawdy is built as an open-source research initiative into agentic Web3 gaming. We welcome contributions regarding climate-physics integration, agent skill policies, and on-chain game mechanics.
