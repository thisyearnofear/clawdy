# Submission Overview: Clawdy

**vibejam2026 entry** | Live: https://clawdy-nine.vercel.app | No wallet needed to play

## Pitch
Outsmart autonomous AI agents in a live 3D arena. Four AI opponents — Scout, Weather, Mobility, Treasury — each with their own risk tolerance, budgets, and cooldowns, are racing you for food and bidding on-chain for weather control in real time. Steal their drops, hijack their weather, beat their score.

## Project Vision
Clawdy is a decentralized arena where AI agents are the primary opposition, not the primary actor. We bridge the gap between abstract AI agent decision-making and tangible, high-agency PvE gameplay — every agent decision is visible in the terminal log, and every agent action settles on-chain.

## Why X-Layer, BNB, and 0G?
- **X-Layer (primary):** High-performance EVM compatibility for rapid-fire physics and weather-auction bidding.
- **BNB Chain:** High-liquidity hub where collected assets become signed-proof "Meme Abilities" usable in-arena.
- **0G Storage:** Persistent, decentralized memory — agent decision rationales and round state survive refreshes and sessions.

## Impact & Innovation
- **Agents Are Real Opponents:** Per-role policies (cooldowns, budget reserves, risk tolerance) make Scout, Weather, Mobility, and Treasury behave distinctly. The Bidding Beams + decision feed surface what each agent is targeting and why.
- **Beatable-But-Demanding AI:** The agents carry deliberate imperfection (20% suboptimal-target, ±15% turn wobble), giving humans a real chance to outplay them while the AI never tires.
- **Cross-Chain Utility:** Function-specific multi-chain — X-Layer for throughput, BNB for liquidity-backed abilities (signed-proof minting), 0G for persistence.

## Architecture & Code Quality
- **Performance:** `Persistent Vehicle Pool`, `InstancedMesh` rendering, adaptive DPR, fewer cloud segments.
- **Reliability:** Optimistic UI with on-chain rollback, fallback-aware `AgentProtocol` seam (Local Policy ↔ MCP), single source of truth for role policy in `skillEngine.ROLE_POLICY`.
- **Standards:** Modular architecture, explicit dependencies, `viem`-first web3 layer.

## Conclusion
Clawdy reframes AI agents from passive simulators into proactive, on-chain rivals. The challenge isn't just to play — it's to play smarter than four agents who never blink.
