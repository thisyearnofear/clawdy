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

## Chassis bodies and forged rovers (league plan, Stream D)

The three chassis bodies are Tripo P1 text-to-model assets (task IDs and prompts
in `mint-assets.json`, keys `chassis.scout`, `chassis.hauler`, `chassis.raider`).
Their print files sit next to the champion STL:

| File | Source | Triangles | Size |
| --- | --- | --- | --- |
| `public/prints/chassis-scout.stl` | `public/assets/tripo/chassis-scout.glb` | 7,287 | ~364 KB |
| `public/prints/chassis-hauler.stl` | `public/assets/tripo/chassis-hauler.glb` | 6,832 | ~342 KB |
| `public/prints/chassis-raider.stl` | `public/assets/tripo/chassis-raider.glb` | 7,542 | ~377 KB |

```bash
npm run print:stl:chassis
```

The in-game GLBs are resized and quantized (`KHR_mesh_quantization`) to stay
around 1 MB. The exporter reads quantized meshes, and its output matches the
un-quantized source to under 0.01 mm at a 120 mm print (triangle counts are
identical), so the STL is faithful to what the game renders.

**Forged rovers.** A forged champion is stored by the Forge (Convex file storage)
and shown to its owner as a URL. Export it for printing straight from that URL,
scaled to a real size:

```bash
python3 scripts/export-print-stl.py "<forged rover url>" forged-rover.stl --scale-mm 120
```

`--scale-mm N` scales the longest axis to N mm (STL has no units; slicers read mm).
Use the same FDM profile as above.

**Limits, stated plainly.** Tripo meshes are multi-shell (wheels, plates and
body are separate pieces) and are not guaranteed watertight. Nothing here was
test-printed. Run Heygears' AI Box auto-repair and auto-support pass before
printing. The scout had a detached sensor dish in the raw generation; it was
removed from the shipped model, but a freshly forged rover is used as generated
and may contain loose pieces, so check the preview in the slicer first.

## What this is (and isn't)

- A visual display model of the game's champion. No electronics, no moving parts.
- Credit the Mint generation pipeline when exhibiting the print next to the game.
- The STL is derived from the pinned in-game asset; if the GLB is regenerated,
  re-run the export so the print and the game never disagree.
