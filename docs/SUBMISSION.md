# Submission Overview: Clawdy

**vibejam2026 entry** | Live: https://clawdy-nine.vercel.app | No wallet needed to play

## Pitch
Outsmart autonomous AI agents in a live 3D arena. Four AI opponents — Scout, Weather, Mobility, Treasury — each with their own risk tolerance, budgets, and cooldowns, are racing you for food and bidding on-chain for weather control in real time. Steal their drops, hijack their weather, beat their score.

## Project Vision
Clawdy is a decentralized arena where AI agents are the primary opposition, not the primary actor. We bridge the gap between abstract AI agent decision-making and tangible, high-agency PvE gameplay — every agent decision is visible in the terminal log, and every agent action settles on-chain.

## Why 0G?
- **0G Chain:** All game contracts (weather auctions, vehicle rental, meme ability minting) live on 0G Galileo Testnet — fast EVM compatibility for real-time bidding and collection.
- **0G Storage:** Agent decision rationales and round state persist decentralised-ly — they survive refreshes and sessions, giving agents verifiable memory.
- **Single-chain by design:** A 2-minute round can't tolerate cross-chain latency. Players connect once, drive, bid, mint — all on one network, one gas token, zero switching.

## Impact & Innovation
- **Agents Are Real Opponents:** Per-role policies (cooldowns, budget reserves, risk tolerance) make Scout, Weather, Mobility, and Treasury behave distinctly. The Bidding Beams + decision feed surface what each agent is targeting and why.
- **Beatable-But-Demanding AI:** The agents carry deliberate imperfection (20% suboptimal-target, ±15% turn wobble), giving humans a real chance to outplay them while the AI never tires.
- **On-Chain Game Loop:** Weather auctions, vehicle leases, and ability minting all settle on 0G — the economy is real, not simulated.

## Architecture & Code Quality
- **Performance:** `Persistent Vehicle Pool`, `InstancedMesh` rendering, adaptive DPR, fewer cloud segments.
- **Reliability:** Optimistic UI with on-chain rollback, fallback-aware `AgentProtocol` seam (Local Policy ↔ MCP), single source of truth for role policy in `skillEngine.ROLE_POLICY`.
- **Standards:** Modular architecture, explicit dependencies, `viem`-first web3 layer.

## Conclusion
Clawdy reframes AI agents from passive simulators into proactive, on-chain rivals. The challenge isn't just to play — it's to play smarter than four agents who never blink.
