# Mint Three.js Skills Integration

The `mintdotgg/mint-threejs-skills` agent skill has been installed into `.devin/skills/mint-threejs-skills/`. This is a documentation-only scaffold; no runtime dependency or Mint MCP server has been wired yet.

## What is installed

- `.devin/skills/mint-threejs-skills/SKILL.md` — top-level skill instructions.
- `.devin/skills/mint-threejs-skills/skills/` — specialized director skills:
  - `threejs-app-director` — for viewers, configurators, simulations, and walkthroughs.
  - `threejs-game-director` — for game-like experiences with objectives, scoring, and progression.
  - `threejs-asset-viewer` — for one-off model, material, or world deliveries.
- `.devin/skills/mint-threejs-skills/references/` — runtime compatibility, asset pipeline, verification policy, and request templates.
- `.devin/skills/mint-threejs-skills/scripts/` — optional helper scripts for syncing Mint assets.
- `.devin/skills/mint-threejs-skills/LICENSE` — MIT license from the original repo.

## How to use it

When you want to generate a 3D asset or a full Mint world for Clawdy:

1. Ensure you have a [Mint MCP](https://mcp.mint.gg) account and API key.
2. Resolve or create a Mint Project for Clawdy and persist it in `mint-assets.json`.
3. Ask the agent to use the appropriate Mint Three.js route:
   - **One asset or world:** `Read .devin/skills/mint-threejs-skills/SKILL.md, then use the asset-viewer route to generate and integrate <description>.`
   - **Game/arena UI polish:** `Read .devin/skills/mint-threejs-skills/skills/threejs-game-director/SKILL.md and improve the Clawdy arena feel.`
   - **General 3D viewer/configurator:** `Read .devin/skills/mint-threejs-skills/skills/threejs-app-director/SKILL.md and build <description>.`

## Important constraints

- **No runtime code has been added yet.** The skill is available to the agent but is not imported or executed by the Clawdy application.
- **MCP calls must stay out of browser runtime code.** Any generated Mint assets should be downloaded/exported as `.glb`, `.spz`, `.ply`, etc. and then loaded by the existing Spark + Three.js pipeline.
- **The current Clawdy course is still pinned to `services/arenaCourse.ts` and the committed collider.** If Mint generates a replacement world, the new collider must be validated and versioned before it replaces the pinned Course 01.
- **Do not overwrite `arenaScenarios.ts` practice/held-out split with Mint-generated scenarios without explicit approval.** Generated worlds should be treated as a new course version, not as a silent replacement.

## Suggested first Mint experiments

1. **Generate a themed rover or champion avatar** as a `.glb` and swap the current sphere proxy in `ArenaWorldView` while keeping the same Rapier kinematic body.
2. **Generate a single Marble world** and use it alongside the existing `course-01-v2` as a new `course-02` held-out scenario, manually authoring the collider.
3. **Generate a title/loading screen asset** for the main page without touching the simulation authority.

## When to keep using the hand-built pipeline

- The local training loop, physics, and held-out evaluation must keep working.
- The pinned `course-01-v2` graph and collider should remain the default Season 0 reference.
- Mint should only augment assets, not replace the validated rules, episode authority, or checkpoint pipeline.
