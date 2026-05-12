# Marble World Assets

Place exported Marble world assets here:

- `arena.spz` — Gaussian splat file (compact format, preferred for hackathon demo)
- `arena.rad` — LoD splat file (for large worlds with streaming)
- `collider.glb` — Physics collider mesh (simplified geometry for Rapier trimesh)

## Asset Pipeline

1. Generate a world in [World Labs Marble](https://marble.worldlabs.ai/)
2. Export the scene as `.spz` (or `.rad` for large worlds)
3. Create or export a collider mesh (simplified geometry that approximates driveable surfaces)
4. Place files here and update `.env.local`:

```env
NEXT_PUBLIC_MARBLE_ENABLED=true
NEXT_PUBLIC_MARBLE_SPLAT_URL=/marble/arena.spz
NEXT_PUBLIC_MARBLE_COLLIDER_URL=/marble/collider.glb
```

## Collider Mesh Guidelines

- Keep triangle count low (< 10k triangles) for physics performance
- Ensure the mesh is watertight where vehicles drive
- Match the scale/origin of the splat export
- Test spawn positions against the collider to avoid stuck starts

## Bounds Configuration

After placing assets, measure the world extents and update env vars:

```env
NEXT_PUBLIC_MARBLE_BOUNDS=60,25,60
NEXT_PUBLIC_MARBLE_SPAWN_BOUNDS=40,5,40
NEXT_PUBLIC_MARBLE_SPAWN_HEIGHT=20
```
