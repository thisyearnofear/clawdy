# Immersive course rebuild

## Status

- **Phase A (shipped):** splat-primary with strong path ribbons, flood volumes, landmarks, lighting/fog, follow-camera on Play. HQ mesh is optional and **clipped** to the playable AABB because this cloud world exports sky floaters as solid geometry.
- **Phase B (blocked on credits):** `npm run marble:rebuild` → `402 Insufficient API credits` for `marble-1.1`. Top up at https://platform.worldlabs.ai/billing, then regenerate with the solid dual-route prompt.
- **Phase C (partial):** authored landmark props + rival tint. Mint MCP needs Cursor desktop auth for a unique rival GLB.

## Why mesh-first failed on the current world

World Labs docs warn HQ meshes pull artifacts from sky/background/thin structures. Cloudbank was prompted as a cloud arena, so the textured GLB (~126MB) is dominated by floaters. Until we regenerate a **solid ridge + valley** world, splat + game overlays is the readable stack.

## After billing is restored

```bash
export WLT_API_KEY="…"   # from .env.local; do not commit
npm run marble:rebuild
# validate candidates against course grounding tests, then promote
```

Then update `ARENA_WORLD.colliderSha256` / `version` in `services/arenaCourse.ts`, prefer mesh-first if the new terrain is clean, and run `npm test`.
