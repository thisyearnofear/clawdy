# World Assets for Clawdy Season 0

World Labs supplies the environment for the [agent-training league](../../docs/HACKATHON.md). The world is a training and evaluation space, not a separate splat-viewer or human-driving product.

## Existing Assets and Code

This directory currently contains:

- `arena.spz`: the existing Gaussian splat environment.
- `collider.glb`: the existing collider mesh export.
- `world.json`: generation metadata, not a complete Season 0 scenario or rules manifest.

The application has a Spark loader, a Rapier collider loader, and `services/marbleWorld.ts` configuration code. Their presence does not establish that loading, alignment, navigation, or the current scene is playable.

## Existing Generation Script

The root script is `scripts/marble-generate-world.mjs`, exposed through `npm run marble:generate`. It requests a World Labs generation, polls for completion, downloads an SPZ and a collider when supplied, and writes metadata.

Important operating details verified from the script:

- It reads `WLT_API_KEY` or `WORLDLABS_API_KEY` from the process environment. It does not load `.env.local` itself.
- Optional inputs include `MARBLE_WORLD_PROMPT`, `MARBLE_WORLD_DISPLAY_NAME`, `MARBLE_WORLD_MODEL`, and `MARBLE_SPZ_RESOLUTION`.
- Output paths can be overridden with `MARBLE_SPLAT_OUTPUT`, `MARBLE_COLLIDER_OUTPUT`, and `MARBLE_METADATA_OUTPUT`.
- The defaults write to the three asset paths above and can overwrite existing files.
- If no collider is returned, the script does not remove a previously existing collider file. Do not accidentally pair a new world with an old collider.
- The script's default prompt still describes the legacy arena. Choose a prompt supporting the two-route Season 0 testbed rather than assuming the default produces it.
- The current external API/model availability has not been reverified by this documentation update.

Generation can spend credits. Obtain approval, confirm the selected model and output locations, and supply credentials through a secure process environment before invoking it. Keep credentials out of command history, documentation, browser bundles, and committed files. Prefer a separate candidate output location over overwriting the validated competition world.

Manual export from [World Labs Marble](https://marble.worldlabs.ai/) is also an option. The existing guide referenced the [Splat Collider Builder](https://splat-collider-builder.netlify.app/) and its [source](https://github.com/icurtis1/splat-collider-builder) for authored collision volumes; verify suitability before adopting it.

## Current Client Configuration Surface

The existing configuration service expects these public keys:

```env
NEXT_PUBLIC_MARBLE_ENABLED=true
NEXT_PUBLIC_MARBLE_SPLAT_URL=/marble/arena.spz
NEXT_PUBLIC_MARBLE_COLLIDER_URL=/marble/collider.glb
```

Bounds and spawn settings are represented by `NEXT_PUBLIC_MARBLE_BOUNDS`, `NEXT_PUBLIC_MARBLE_SPAWN_BOUNDS`, and `NEXT_PUBLIC_MARBLE_SPAWN_HEIGHT`. Derive their values from the actual world; do not copy arbitrary dimensions from an old example.

The configuration service now uses explicit public environment references suitable for the Next.js client build. Unit tests cover parsing, invalid extents, and detached default bounds. Setting these keys alone is not proof that the generated world renders correctly; runtime/browser verification remains deferred.

`services/worldSurface.ts` now supplies tested world-space queries over all static collider meshes and can return copied vertex/index buffers for a physics adapter. `checkRouteGrounding()` detects sampled missing or overly steep ground; it is not swept-volume collision or vehicle-clearance validation. A Node test parses this directory's committed collider through `GLTFLoader`. The existing `MarbleCollider` component has not yet been migrated to this shared helper.

## Season 0 Validation Gate

Before accepting a world for training or evaluation:

1. Verify the splat and collider come from the intended world and use the same origin, rotation, and scale.
2. Check all necessary collider meshes are loaded; the current loader only selects the first mesh.
3. Drive the actual collection, banking, low-route, and high-route paths with the shared controller. Validate spawn clearance, recovery, collision, and camera framing.
4. Author and disclose the waypoint graph. Traversal costs and flood effects must agree with physical accessibility.
5. Measure browser loading and rendering performance; simplify collision geometry and expensive assets when necessary.
6. Freeze and identify the splat, collider, route graph, scenario definitions, and runtime/rules configuration together.
7. Keep training and held-out scenario sets distinct, even when they share this world.
8. Record asset provenance and required attribution. Do not expose private generation credentials or signed download links in public manifests.
9. Package stable asset URLs before the demo; no generation request or expiring remote output should be necessary during a match.

Generating a new environment does not automatically create a fair, traversable course. Start with one validated world and controlled scenario variation, not an unlimited world-generation feature.
