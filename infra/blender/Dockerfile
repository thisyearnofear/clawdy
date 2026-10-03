# Headless Blender for the deterministic terrain pipeline (scripts/build-arena-terrain.py).
# The version is pinned: exported GLB bytes (and therefore their SHA-256) can change between Blender releases.
FROM ubuntu:24.04
ARG BLENDER_VERSION=4.2.3
ARG BLENDER_SERIES=4.2
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils libxi6 libxkbcommon0 libgl1 libxxf86vm1 libxfixes3 libxrender1 libsm6 libegl1 \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://download.blender.org/release/Blender${BLENDER_SERIES}/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
      | tar -xJ -C /opt \
    && ln -s "/opt/blender-${BLENDER_VERSION}-linux-x64/blender" /usr/local/bin/blender
WORKDIR /work
ENTRYPOINT ["blender", "--background", "--factory-startup"]
