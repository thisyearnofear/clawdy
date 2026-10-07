# Clawdy — Train Your Champion

**Coach an agent. Train its policy. Unleash it in the arena. Watch it adapt — or fail.**

Clawdy is a **Clash-first** agent league inside a physical world: Clash is the game; Prove is the held-out test. Race an unranked Clash, Call a route that steers the run and queues a lesson, then Replay → Coach → Train when you want weight updates. Prove on a held-out Match where coaching goes dark. Player doors are Clash vs Prove only. The arena throws flooding, scarcity, rivals, and terrain costs — and you find out whether your coaching held.

> The payoff is watching your agent use something you taught it when you are no longer allowed to help — and finding out whether your coaching held when the arena throws something it has never seen.

**What is proven (gate pin `53f3d95c3d9b`):** the coached champion **matches the careful teacher's outcomes on unseen abstract layouts** — every leg within 1 banked, the same champion-win legs (3 = 3) — and **beats the untrained baseline on all four held-out boards** (+21 banked). On physical courses it now leads the teacher on the grounded course (28 vs 27) while still trailing on held-out family layouts (56 vs 68) — every leg clearing the harness-enforced no-collapse floor. This paragraph mirrors the CI-enforced claims block in `scripts/eval-gate.ts` — docs may never claim more than the gate checks.

## The Loop

**Play → Call → Replay → Coach → Train → Match.**

1. Press **Play** and watch two autonomous rovers race for cores (highlighted amber routes are flood-sensitive).
2. **Call the next route** — once per unranked Clash, at a junction, pick the route your champion should take. Call **steers this race** for the rest of the run via a sticky route preference, and queues an approved Train lesson. Scored Prove stays locked — nothing you call can touch a scored result.
3. Open **Replay** — watch it back as an event-driven cinematic, or scrub a mistake and queue a fix; the review frame ranks the top-3 outcome-measured alternatives beside the coach's keyword match.
4. Open **Coach**, approve examples, and train a real checkpoint.
5. Switch to **Match** for a scored held-out layout with coaching locked.

After training, the lesson card leads with **what your brain actually changed** — how many decisions moved, which route swaps account for it, and whether it got stuck less — alongside the score delta. The weights are a small MLP and cannot be read directly, so this is where the learning becomes visible.

## Two Entry Paths, One Entrant Format

- **Player path** — web app. Clash / Prove doors, replay scrub + cinematic reel, seeded tournament brackets vs the house field, Coach panel, browser `localStorage` checkpoints, JSON import/export.
- **Builder path** — `npm run starter:train`. Headless train/eval, export `starter/champion-checkpoint.json`, import in the web app.

Both paths produce the same checkpoint artifact and run under the same match rules.

## Live

**Play:** [https://clawdy.trustfall.xyz/](https://clawdy.trustfall.xyz/) — Clash → Call → Replay → Coach → Train → Prove. No wallet. Checkpoints sync to Convex under a browser guest key when configured; `localStorage` + JSON export always work offline.

### Saving your progress

Your progress is saved in this browser as you play. When cloud sync is available, it keeps a guest-keyed copy in Convex; if you go offline or sync hits a snag, you can keep playing and your local progress remains safe. The Coach panel shows whether changes are waiting to sync or need attention. Export a checkpoint as JSON from **Coach → Brains, storage & sync** to back it up or move it to another browser.

## Quick Start

```bash
npm ci
npm run dev              # web app at http://localhost:3000
npx convex dev           # optional — dual-write coaching lineage & auth
npm test                 # unit/integration suites
npm run build            # static Next.js build
npm run starter:train    # headless trainer, exports a checkpoint
npm run teacher:run      # local code coach harness (e.g. starter/teachers/ridge-runner.ts)
npm run eval:es          # evaluate Rush champion against house field
npx tsx scripts/train-es.ts --init starter/rush-champion.json --chassis scout   # train a brain for a chassis (scout|hauler|raider)
npx tsx scripts/bench-chassis.ts     # chassis bench with house bots
```

Requires Node.js 20+ and npm 10+. Production Convex + Vercel env notes: [docs/DEPLOY.md](docs/DEPLOY.md).

**World visuals:** since September 18 the playable course is a mesh-first Blender-authored terrain (`public/terrain/sandstone-basin.glb` — included, no Blender needed to run the app; explicit rebuild `blender --background --factory-startup --python scripts/build-arena-terrain.py -- --force` with Blender 4.5 LTS on PATH, then re-pin the printed SHA in `services/arenaCourse.ts`), used identically for rendering and physics collision, plus path/landmark overlays. An enhanced visual twin (`public/terrain/sandstone-basin-visual.glb`) authored via pinned Docker Blender 4.2.3 provides procedural detail textures without altering collision geometry. The earlier generated-world (Marble) pipeline was retired and removed on September 26, 2026; git history holds it.

## Documentation

Product, contract, demo, and submission materials live in `/docs`:

- [Product and implementation plan](docs/HACKATHON.md) — direction, scope, architecture, status.
- [Implementation contract](AGENT.md) — module boundaries and verification rules.
- [Compatibility policy](docs/COMPATIBILITY.md) — versioned rules, schemas, worlds, and checkpoints.
- [Authentication and ladder](docs/AUTH.md) — Convex Auth (GitHub OAuth), guest claims, and server-verified Rush ladder.
- [Current opportunity plan](docs/TRIPOTHON.md) — the active external opportunity, timeline, and risk register.
- [Product roadmap](docs/ROADMAP.md) — identity → encounters → league → curriculum horizons.
- [Submission materials](docs/SUBMISSION_CHECKLIST.md).
- [Scene layer architecture](docs/SCENES.md) — how recorded matches become replay cinematics and a live Orbis-generated broadcast (needs server-side `REACTOR_API_KEY`).
- [Two-minute demo script](docs/DEMO_SCRIPT.md).

Additional references: [deploy guide](docs/DEPLOY.md), [Mint integration](docs/MINT_INTEGRATION.md), [inspiration](docs/INSPIRATION.md).

## Credits

Assets and tooling used by this project — generated worlds, vehicles, physics, and rendering — are credited in [docs/HACKATHON.md](docs/HACKATHON.md).
