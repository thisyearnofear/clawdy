# Marble / Spark Starter Kit Reference

Source: [World Labs Starter Kit Notion page](https://www.notion.so/Starter-Kit-30d8950a1bef806e90a5e030c6382297)

This document captures the resource links and concepts from the World Labs Starter Kit that are relevant to Clawdy's generated-world pipeline.

## What is Marble?

Marble is World Labs' generative world model and API for building persistent, spatially consistent 3D worlds.

- **Marble home:** https://marble.worldlabs.ai
- **Marble docs:** https://docs.worldlabs.ai
- **API platform:** https://platform.worldlabs.ai
- **API docs:** https://docs.worldlabs.ai/api
- **Tutorials:** https://www.youtube.com/@WorldLabsAI
- **Case studies:** https://www.worldlabs.ai/labs
- **Community showcase:** https://www.worldlabs.ai/labs/showcase

**Inputs:** text, image, multi-image, video.  
**Outputs:** Gaussian splats, collider meshes, video.

## File Types

| Extension | Purpose | Notes for Clawdy |
|---|---|---|
| `.spz` | Compressed splat format | Smallest web format; prefer this for web rendering. |
| `.ply` | Raw point cloud | Large, mainly for tooling or conversion. |
| `.rad` | Streaming-optimized splats | LOD-enabled; best for massive, 1M+ splat scenes. |
| `.glb` | Mesh export | Use for collider meshes exported from Marble or the Splat Collider Builder. |

## Spark 2.0 (Web Renderer)

Spark is World Labs' Gaussian Splat renderer for the web, built on Three.js.

- **Spark docs:** https://sparkjs.dev/2.0.0-preview
- **Examples:** https://sparkjs.dev/examples

Clawdy already uses Spark 2.1.0 for rendering. The official examples can serve as a reference for LOD, loading lifecycle, and R3F integration.

## Quickstarts and Example Controllers

These projects use the same stack as Clawdy: SparkJS + Three.js + Rapier.

- **Third-person character controller (SparkJS + Three.js + Rapier)**  
  https://icurtis1.notion.site/third-person-controller-splat
- **First-person character controller (SparkJS + Three.js + Rapier + Game Controller API)**  
  https://icurtis1.notion.site/gaussian-splat-character-controller
- **Splat Collider Builder (browser-based)**  
  https://splat-collider-builder.netlify.app  
  Load any `.spz`, draw simple collision volumes, then export the colliders as a `.glb`.
- **React + React Three Fibre starter project**  
  https://sparkjsdev.notion.site/spark-react-r3f
- **Vanilla JS examples**  
  https://sparkjs.dev/examples/#hello-world

## Splat Toolbox

### SPZ → PLY Conversion

- C++ (official): https://github.com/nianticlabs/spz
- JavaScript wrapper: https://github.com/arrival-space/spz-js
- Python (recommended / easiest): https://github.com/worldlabsai/worldlabs-api-python/blob/main/examples/export_ply.py

### Viewers

- **Gsplat / Spark Editor (RAD-enabled):** drag & drop `.spz`, `.ply`, and `.rad` files  
  https://storage.googleapis.com/forge-dev-public/asundqui/editor/test.html

## Example Repos and Projects

- **API examples (web):** https://github.com/worldlabsai/worldlabs-api-examples  
  Minimal scripts and a simple web app for generating worlds using the raw API.
- **Python client and utilities:** https://github.com/worldlabsai/worldlabs-api-python  
  For saving/loading splats and rendering videos.
- **Spark example library:** https://sparkjs.dev/examples
- **Interactive Marble Physics Demo (Spark + Rapier + Three.js):** https://github.com/bmild/spark-physics  
  Demonstrates combining splat rendering with a collider mesh for simple physics.
- **Rapier Physics Engine:** https://rapier.rs
- **WebXR first steps:** https://developers.meta.com/horizon/documentation/web/webxr-first-steps

## Marble Product Features

- **Chisel:** precise 3D layout control, including via imported 3D object assets.
- **Compose:** tweak specific elements or reshape the entire 3D world.
- **Mesh export:** export Marble worlds as 3D meshes for game engines and other apps.

## Example Large Stitched Worlds

These are example worlds downloadable as `.rad`, `.spz`, and `.ply`. They do **not** come with collider meshes; for experimental collider generation see the starter page.

| World | Splat count | .rad | .spz | .ply |
|---|---|---|---|---|
| Hobbiton | 24M | 616 MB | 355 MB | 1.5 GB |
| Spaceship | 6M | 126 MB | 80 MB | 377 MB |
| Cozy Cottage | 5M | 115 MB | 71 MB | 321 MB |
| Haunted House | 2.5M | 54 MB | 34 MB | 131 MB |
| Spaceship 2 | 3M | 66 MB | 37 MB | 194 MB |
| Sunken Pirate Ship | 16M | 351 MB | 229 MB | 1.0 GB |

## Actionable Insights for Clawdy

1. **Use the right splat format for the job.**  
   For the current single-course build, `.spz` keeps the asset small. If we move to world-scale stitched environments, `.rad` becomes the better format.

2. **Collider authoring is the blocking UX for user-generated worlds.**  
   The [Splat Collider Builder](https://splat-collider-builder.netlify.app) is the best-known browser tool for drawing `.glb` colliders over a splat. We can point builders to it, or eventually integrate a similar volume-authoring step into the Clawdy world editor.

3. **Marble mesh export is an alternative to runtime collider extraction.**  
   Instead of deriving collision from the splat in code, we can ask Marble to export a collider mesh and validate it against the committed course graph. This is likely more reliable than a hand-rolled splat → surface heuristic.

4. **The Spark + Rapier + Three.js examples validate our stack.**  
   The third-person controller and `spark-physics` demo prove the exact combination we are using (Spark splat rendering + Rapier physics) works. We can use them as a debugging reference if the rover/camera interaction in `ArenaWorldView` misbehaves.

5. **Programmatic world generation is possible via `worldlabs-api-python`.**  
   We can script course generation and export `.ply`/`.glb`/`.spz` from Marble. This opens the door to generating training scenarios and held-out evaluation courses procedurally.

6. **Large stitched worlds are available but collider-less.**  
   The showcase worlds are beautiful, but Clawdy cannot use them as-is until a collider pipeline exists. Keep the course small and pinned for Season 0; do not chase large stitched worlds until collision is solved.

7. **WebXR is supported by Marble export but is not Season 0 scope.**  
   If the hackathon demo wants an immersive mode later, the World Labs pipeline can export a WebXR-ready ZIP and the Meta first-steps tutorial is the starting point.
