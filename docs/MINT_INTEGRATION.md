# Mint Three.js Skills Integration

The `mintdotgg/mint-threejs-skills` agent skill has been installed into `.devin/skills/mint-threejs-skills/`. Runtime wiring is now in place so the first generated asset can be dropped in and loaded automatically; no Mint MCP server is connected yet.

## What is installed

- `.devin/skills/mint-threejs-skills/SKILL.md` — top-level skill instructions.
- `.devin/skills/mint-threejs-skills/skills/` — specialized director skills:
  - `threejs-app-director` — for viewers, configurators, simulations, and walkthroughs.
  - `threejs-game-director` — for game-like experiences with objectives, scoring, and progression.
  - `threejs-asset-viewer` — for one-off model, material, or world deliveries.
- `.devin/skills/mint-threejs-skills/references/` — runtime compatibility, asset pipeline, verification policy, and request templates.
- `.devin/skills/mint-threejs-skills/scripts/` — helper scripts, including `sync-mint-assets.mjs`.
- `.devin/skills/mint-threejs-skills/LICENSE` — MIT license from the original repo.

## Runtime wiring in Clawdy

- `mint-assets.json` at the project root is the durable registry. It starts empty; the sync script will fill in `mintProject` and `assets` after the first generation.
- `services/mintAssets.ts` reads the registry and exposes helpers for finding the right `.glb` artifact and its public URL.
- `components/environment/MintModel.tsx` is a Draco-capable `<primitive>` loader. It uses a shared `DRACOLoader` pointed at the Mint CDN.
- `components/environment/ArenaWorldView.tsx` now swaps each rover's procedural geometry for a Mint-generated model when `mint-assets.json` contains `championRover` or `rivalRover` entries. If no asset is registered, the existing procedural rover is shown.
- `package.json` adds `mint:sync` to run `.devin/skills/mint-threejs-skills/scripts/sync-mint-assets.mjs` against a saved artifact manifest.
- `public/assets/mint/` is the default download target for synced assets.

## How to generate the first asset

1. Get a [Mint MCP](https://mcp.mint.gg) account connected to this workspace.
2. Ask the agent to generate a rover for the active player (champion), e.g.:
   ```
   Read .devin/skills/mint-threejs-skills/SKILL.md and generate a low-poly sci-fi rover model for the Clawdy champion, then sync it into the mint-assets.json registry under the key "championRover".
   ```
3. The agent should:
   - Resolve or create a Mint Project.
   - Start a `model` generation with project/chat IDs.
   - Follow `nextSteps` until the manifest is ready.
   - Save the manifest and run `npm run mint:sync -- --manifest <manifest.json> --key championRover`.
4. The runtime will then load `/assets/mint/championRover/<artifactId>.glb` automatically on the next page load.

## Important constraints

- **MCP calls stay out of browser runtime code.** `MintModel` only loads a local/public `.glb`; generation and sync happen through agent tooling or the `mint:sync` CLI.
- **The current Clawdy course is still pinned to `services/arenaCourse.ts` and the committed collider.** If Mint generates a replacement world, the new collider must be validated and versioned before it replaces Course 01.
- **Do not overwrite `arenaScenarios.ts` practice/held-out split with Mint-generated scenarios without explicit approval.** Generated worlds should be treated as a new course version, not as a silent replacement.
- **The hand-built procedural rover remains the fallback** when no Mint asset is synced, so the simulation never depends on a generated asset being present.

## Suggested first Mint experiments

1. **Generate a themed rover or champion avatar** as a `.glb` and let `ArenaWorldView` swap the procedural rover for it while keeping the same Rapier kinematic body.
2. **Generate a single Marble world** and use it alongside the existing `course-01-v2` as a new `course-02` held-out scenario, manually authoring the collider.
3. **Generate a title/loading screen asset** for the main page without touching the simulation authority.

## When to keep using the hand-built pipeline

- The local training loop, physics, and held-out evaluation must keep working.
- The pinned `course-01-v2` graph and collider should remain the default Season 0 reference.
- Mint should only augment assets, not replace the validated rules, episode authority, or checkpoint pipeline.
