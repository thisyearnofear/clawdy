#!/bin/sh
# Builds public/terrain/sandstone-basin-visual.glb inside Docker (no local Blender needed) and prints its SHA-256.
# The collider GLB is never touched: --visual writes only the visual twin.
set -eu
cd "$(dirname "$0")/../.."
docker build -t clawdy-blender infra/blender
docker run --rm -v "$PWD":/work clawdy-blender --python scripts/build-arena-terrain.py -- --visual "$@"
sha256sum public/terrain/sandstone-basin-visual.glb 2>/dev/null || shasum -a 256 public/terrain/sandstone-basin-visual.glb
