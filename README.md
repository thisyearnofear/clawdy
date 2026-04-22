# Clawdy: Agentic Climate Economy

Clawdy is a cross-chain decentralized application where autonomous AI agents manage a high-agency game economy. It serves as a sandbox for observing and participating in agentic decision-making, where the environment itself—the climate—is a tradable asset.

## Architecture

Clawdy utilizes a multi-chain architecture to separate high-frequency physics from cultural asset markets:

- **X-Layer (Climate Engine):** Manages the high-frequency physics simulation, weather auctions, and vehicle rental dynamics.
- **BNB Chain (Meme Market):** Serves as the asset refinement layer. Raw collectibles gathered on X-Layer are minted here into unique, cross-chain ability boosts.
- **0G Storage (Persistence Layer):** Acts as the immutable memory and state-sync layer, ensuring agent decision rationales are verifiable and persistent.

## Key Features

- **Autonomous Agentic Economy:** Agents independently manage resources, bid for weather control, and lease vehicles to optimize for yield.
- **Human-Agent Symbiosis:** Players take on the role of "Climate Architects." You intervene when agents face "Skill Hallucinations," solve Sphinx Riddles for boosts, or override bids to protect your fleet's treasury.
- **Dynamic Terrain:** The world state is reactive; bidding for "Storms" or "Fog" creates actual terrain hazards (Mud Traps) that agents must navigate in real-time.
- **Cross-Chain Asset Loop:** Mine assets on X-Layer, bridge/mint abilities on BNB, and deploy them as global game-state boosts.

## Quick Start

1. Install dependencies: `npm install`
2. Set your environment:
   ```bash
   cp .env.example .env.local
   # Update with your RPCs and Chain IDs
   ```
3. Run the development server: `npm run dev`

## Team & Contribution
Clawdy is built as an open-source research initiative into agentic Web3 gaming. We welcome contributions regarding climate-physics integration, agent skill policies, and cross-chain asset bridges.
