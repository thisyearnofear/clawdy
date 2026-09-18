# Clawdy — Train Your Champion

**Coach an agent. Train its policy. Unleash it in the arena. Watch it adapt — or fail.**

Clawdy is an agent-training league inside a physical world. You coach a rover through practice, approve training examples, run real backpropagation to produce a versioned policy checkpoint, and then unleash that checkpoint in a held-out scenario where the coaching controls go dark. The arena throws variables your bot was never trained on — flooding, resource scarcity, rival adaptation, terrain costs — and you find out whether your coaching held.

> The payoff is watching your agent use something you taught it when you are no longer allowed to help — and finding out whether your coaching held when the arena throws something it has never seen.

## The Loop

**Play → Replay → Coach → Train → Match.**

1. Press **Play** and watch two autonomous rovers race for cores (highlighted amber routes are flood-sensitive).
2. Open **Replay**, scrub a mistake, and queue a fix.
3. Open **Coach**, approve examples, and train a real checkpoint.
4. Switch to **Match** for a scored held-out layout with coaching locked.

## Two Entry Paths, One Entrant Format

- **Player path** — web app. Practice/Match modes, replay scrub, Coach panel, browser `localStorage` checkpoints, JSON import/export.
- **Builder path** — `npm run starter:train`. Headless train/eval, export `starter/champion-checkpoint.json`, import in the web app.

Both paths produce the same checkpoint artifact and run under the same match rules.

## Quick Start

```bash
npm ci
npm run dev              # web app at http://localhost:3000
npm test                 # unit/integration suites
npm run build            # static Next.js build
npm run starter:train    # headless trainer, exports a checkpoint
```

Requires Node.js 20+ and npm 10+.

**World visuals:** since September 18 the playable course is a mesh-first Blender-authored terrain (`public/terrain/sandstone-basin.glb` — included, no Blender needed to run the app; explicit rebuild `blender --background --factory-startup --python scripts/build-arena-terrain.py -- --force` with Blender 4.5 LTS on PATH, then re-pin the printed SHA in `services/arenaCourse.ts`), used identically for rendering and physics collision, plus path/landmark overlays. The earlier generated-world strategy is superseded — see [public/marble/IMMERSIVE_REBUILD.md](public/marble/IMMERSIVE_REBUILD.md); Marble and Mint candidate assets are retained but not active.

## Documentation

Product, contract, demo, and submission materials live in `/docs`:

- [Product and implementation plan](docs/HACKATHON.md) — direction, scope, architecture, status.
- [Implementation contract](AGENT.md) — module boundaries and verification rules.
- [Current opportunity plan](docs/TRIPOTHON.md) — the active external opportunity, timeline, and risk register.
- [Submission materials](docs/SUBMISSION_CHECKLIST.md).
- [Two-minute demo script](docs/DEMO_SCRIPT.md).
- [Immersive world rebuild notes](public/marble/IMMERSIVE_REBUILD.md).

Additional references: [deploy guide](docs/DEPLOY.md), [starter kit notes](docs/MARBLE_STARTER_KIT.md), [Mint integration](docs/MINT_INTEGRATION.md), [inspiration](docs/INSPIRATION.md).

## Credits

Assets and tooling used by this project — generated worlds, vehicles, physics, and rendering — are credited in [docs/HACKATHON.md](docs/HACKATHON.md).
