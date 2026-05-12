# Clawdy: Play Inside a Marble-Generated World

> **World Labs Marble submission** — [Play now: clawdy-nine.vercel.app](https://clawdy-nine.vercel.app) · No wallet needed to drive.

**Autonomous AI rivals race through a Marble-generated 3D world rendered with Spark.** This isn't a splat viewer — it's a browser-playable agent game inside a generated, spatially consistent environment.

Marble generates the arena. Spark renders it. Rapier makes it driveable. Four AI opponents observe, decide, and compete in real time. Your job is to outsmart them.

## What Makes This a Marble Submission

1. **Marble generates the arena** — the 3D world is exported from World Labs Marble as a Gaussian splat scene
2. **Spark renders it in-browser** — the `@sparkjsdev/spark` renderer displays the splat with LoD streaming, running alongside traditional Three.js meshes
3. **The world is physically playable** — a collider mesh derived from the Marble export gives vehicles real surfaces to drive on via Rapier physics
4. **AI agents respond inside the generated world** — four autonomous opponents observe world state, bid on weather, and compete for resources within the Marble environment
5. **Weather affects the generated world** — storms, fog, and gravity shifts layer gameplay on top of the splat scene

## Architecture

```
Marble export (.spz / .rad)
  └─ rendered by Spark (MarbleWorldLayer.tsx)

Collider mesh (.glb)
  └─ loaded into Rapier physics (MarbleCollider.tsx)

services/marbleWorld.ts
  └─ single source of truth for world config, bounds, spawn zones

Experience.tsx
  ├─ vehicles, agents, weather, collection loop
  ├─ conditionally renders Marble world OR procedural fallback
  └─ all gameplay systems work in both modes
```

## Key Features

- **Marble-Generated Arena:** The playable world comes from World Labs Marble — not hand-modeled geometry
- **Four AI Opponents:** Scout, Weather, Mobility, and Treasury each have distinct strategies, risk tolerances, and on-chain budgets
- **Weather Is a Weapon:** Win the auction and control storms, fog, and gravity. Lose it and drive through their mud traps
- **Vehicle Physics:** Rapier-powered driving with surface friction, gravity modes, and handling profiles
- **On-Chain Economy:** Weather auctions, vehicle rental, and EIP-712 ability minting on 0G Chain
- **Adaptive Fallback:** When no Marble asset is configured, the full procedural arena runs as before

## Quick Start

```bash
npm install
cp .env.example .env.local
# Configure your Marble world assets (see below)
npm run dev
```

### Enabling the Marble World

1. Export a scene from [World Labs Marble](https://marble.worldlabs.ai/) as `.spz`
2. Create or export a simplified collider mesh as `.glb`
3. Place both in `public/marble/`
4. Update `.env.local`:

```env
NEXT_PUBLIC_MARBLE_ENABLED=true
NEXT_PUBLIC_MARBLE_SPLAT_URL=/marble/arena.spz
NEXT_PUBLIC_MARBLE_COLLIDER_URL=/marble/collider.glb
NEXT_PUBLIC_MARBLE_BOUNDS=60,25,60
NEXT_PUBLIC_MARBLE_SPAWN_BOUNDS=40,5,40
NEXT_PUBLIC_MARBLE_SPAWN_HEIGHT=20
```

Without these env vars, the app runs the full procedural arena as a fallback.

## Development

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # Run ESLint
npm test           # Run Vitest tests

# Smart contract tests (Foundry)
npm run contracts:test
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| World Generation | World Labs Marble |
| Splat Rendering | @sparkjsdev/spark 2.0 (Three.js integration) |
| Frontend | Next.js 16, React 19, React Three Fiber |
| Physics | Rapier 0.19 via @react-three/rapier |
| State | Zustand, React Query |
| Web3 | Wagmi, Viem, 0G Chain + 0G Storage |
| Real-time | Supabase Presence |
| Monitoring | Sentry |
| Contracts | Solidity 0.8.20+, Foundry |

## Project Structure

```
services/marbleWorld.ts          — Marble world config resolution
components/environment/
  MarbleWorldLayer.tsx           — Spark splat renderer (lazy-loaded)
  MarbleCollider.tsx             — GLB → Rapier trimesh collider
  Experience.tsx                 — Main game loop (marble-aware)
  CloudScene.tsx                 — Canvas + UI shell
public/marble/                   — Marble asset placement
docs/MARBLE_PIVOT_PLAN.md       — Full pivot design document
```

## Demo Script

1. Open the app — the Marble-generated world renders immediately via Spark
2. Drive through the arena — vehicles have real physics on the generated surfaces
3. Watch AI agents compete — they observe, decide, and collect within the same world
4. Trigger weather — storms visually layer on top of the splat scene and affect gameplay
5. The world is generated, not modeled — that's the Marble differentiator

## Team & Contribution

Clawdy is built as an open-source research initiative into agentic gaming within AI-generated worlds. Contributions welcome around Marble asset pipelines, collider authoring, and agent observation of splat environments.
