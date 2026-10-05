# Clawdy — Train Your Champion

**Coach an agent. Train its policy. Unleash it in the arena. Watch it adapt — or fail.**

Clawdy is an agent-training league inside a physical world. You coach a rover through practice, approve training examples, run real backpropagation to produce a versioned policy checkpoint, and then unleash that checkpoint in a held-out scenario where the coaching controls go dark. The arena throws variables your bot was never trained on — flooding, resource scarcity, rival adaptation, terrain costs — and you find out whether your coaching held.

> The payoff is watching your agent use something you taught it when you are no longer allowed to help — and finding out whether your coaching held when the arena throws something it has never seen.

**What is proven (gate pin `525eba353d75`):** the coached champion **matches the careful teacher's outcomes on unseen abstract layouts** — every leg within 1 banked, the same champion-win legs (3 = 3) — and **beats the untrained baseline on all four held-out boards** (+21 banked). On physical courses it still trails the teacher (grounded 35 vs 36; layout family 63 vs 73) while clearing the harness-enforced no-collapse floor on every leg. This paragraph mirrors the CI-enforced claims block in `scripts/eval-gate.ts` — docs may never claim more than the gate checks.

## The Loop

**Play → Call → Replay → Coach → Train → Match.**

1. Press **Play** and watch two autonomous rovers race for cores (highlighted amber routes are flood-sensitive).
2. **Call the next route** — once per Practice run, at a junction, pick the route your champion should take. It records an approved lesson without steering the current race, so nothing you call can touch a scored result.
3. Open **Replay** — watch it back as an event-driven cinematic, or scrub a mistake and queue a fix; the review frame ranks the top-3 outcome-measured alternatives beside the coach's keyword match.
4. Open **Coach**, approve examples, and train a real checkpoint.
5. Switch to **Match** for a scored held-out layout with coaching locked.

After training, the lesson card leads with **what your brain actually changed** — how many decisions moved, which route swaps account for it, and whether it got stuck less — alongside the score delta. The weights are a small MLP and cannot be read directly, so this is where the learning becomes visible.

## Two Entry Paths, One Entrant Format

- **Player path** — web app. Practice/Match modes, replay scrub + cinematic reel, seeded tournament brackets vs the house field, Coach panel, browser `localStorage` checkpoints, JSON import/export.
- **Builder path** — `npm run starter:train`. Headless train/eval, export `starter/champion-checkpoint.json`, import in the web app.

Both paths produce the same checkpoint artifact and run under the same match rules.

## Live

**Play:** [https://clawdy.trustfall.xyz/](https://clawdy.trustfall.xyz/) — Practice → Call → Replay → Coach → Train → Match. No wallet. Checkpoints sync to Convex under a browser guest key when configured; `localStorage` + JSON export always work offline.

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
