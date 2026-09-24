# Clawdy Print Kit — Champion Rover (Heygears)

A physical gift from the world: the in-game champion rover as a 3D-printable STL,
exported from the Mint-generated "Emerald Canopy Rover" GLB that the game renders.

## Files

| File | Source | Triangles | Size |
| --- | --- | --- | --- |
| `public/prints/champion-rover.stl` | `public/assets/mint/champion-rover.glb` (binary STL, +Y-up) | 4,745 | ~232 KB |

Regenerate any time (stdlib Python only, refuses Draco inputs rather than guessing):

```bash
python3 scripts/export-print-stl.py public/assets/mint/champion-rover.glb public/prints/champion-rover.stl
# or
npm run print:stl
```

## Model dimensions (model units)

- X: −0.376..0.376 (dx 0.752)
- Y: −0.314..0.314 (dy 0.627)
- Z: −0.499..0.499 (dz 1.000, longest axis)

## Recommended print profile (FDM)

- **Scale:** longest axis to **120 mm** (uniform ×120). About palm-sized; details survive.
- **Layer height:** 0.15–0.2 mm.
- **Walls / infill:** 3 walls, 15% gyroid infill. A display piece, not load-bearing.
- **Supports:** yes — overhangs under the canopy and wheel arches. Tree supports preferred.
- **Material:** PLA. Bed 60 °C, nozzle per filament maker.
- **Orientation:** wheels-down as exported. Raft not needed on a level bed.

These settings were chosen from the mesh's wall thicknesses at 120 mm scale;
they were not exhaustively test-printed on every Heygears model. If you print
on an UltraCraft Reflex series, run Heygears' AI Box auto-repair + auto-support
pass first and prefer its suggestion where it differs.

## What this is (and isn't)

- A visual display model of the game's champion. No electronics, no moving parts.
- Credit the Mint generation pipeline when exhibiting the print next to the game.
- The STL is derived from the pinned in-game asset; if the GLB is regenerated,
  re-run the export so the print and the game never disagree.
