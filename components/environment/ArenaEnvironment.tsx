'use client'

import { Environment, Lightformer } from '@react-three/drei'

/**
 * Image-based lighting, generated procedurally from the arena's own palette.
 *
 * The scene ran on four analytic lights and no environment, which is the
 * textbook cause of `meshStandardMaterial` reading flat and plasticky: with no
 * IBL, metalness and roughness have nothing to reflect and every surface is lit
 * purely by direct falloff. Metals in particular have no highlight to catch.
 *
 * Built with drei's `<Environment>` + `<Lightformer>` rather than a fetched
 * HDRI, for two reasons that matter here:
 *
 *  - **No network dependency.** `<Environment preset>` fetches from a CDN at
 *    runtime, which would make a judged demo fail with no connection.
 *  - **No licence to track.** A shipped build should not depend on the terms of
 *    an asset nobody on the team verified.
 *
 * The colours match the existing hemisphere light and BasinSun, so the IBL
 * agrees with the direct lighting instead of fighting it.
 *
 * Deliberately `frames={1}`: this is a static studio-style probe, so there is
 * nothing to re-render. It is skipped entirely on the lite tier, where a
 * one-off PMREM bake on first paint is real cost for a device that is already
 * struggling.
 */
export function ArenaEnvironment({ lite }: { lite: boolean }) {
  if (lite) return null
  return (
    <Environment resolution={64} frames={1} environmentIntensity={0.55}>
      {/* Sky dome, inside-out so the probe sees sky rather than void. */}
      <Lightformer
        form="rect"
        intensity={1.1}
        color="#b5d5e0"
        scale={[40, 40, 1]}
        position={[0, 14, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      {/* Warm ground bounce, so downward-facing surfaces are not black. */}
      <Lightformer
        form="rect"
        intensity={0.55}
        color="#9c7960"
        scale={[40, 40, 1]}
        position={[0, -8, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      {/* The key. This is the highlight metals actually catch — without a bright
          patch the roughness on the rover reads uniformly flat. Positioned to
          agree with BasinSun at (-11, 13, -8). */}
      <Lightformer
        form="circle"
        intensity={2.6}
        color="#ffe1ad"
        scale={9}
        position={[-11, 13, -8]}
        target={[0, 0, 0]}
      />
      {/* Cool rim from the opposite side, separating rovers from the ground. */}
      <Lightformer
        form="rect"
        intensity={0.4}
        color="#b0ccdc"
        scale={[14, 8, 1]}
        position={[9, 7, 13]}
        target={[0, 0, 0]}
      />
    </Environment>
  )
}