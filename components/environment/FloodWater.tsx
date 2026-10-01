/**
 * FloodWater — stylized water surface over the floodable valley corridor.
 *
 * Replaces the old static teal slabs: a single shader plane whose waterline
 * is a pure function of simulation tick (services/arenaFlood.ts), so floods
 * rise into the basin, hold, and recede — including the drain action's
 * early recede — deterministically under replay and fast-forward.
 *
 * Shore behavior comes from a height texture baked once at mount by
 * raycasting the live physics collider (session.sampleGround): the shader
 * fades alpha at the waterline, tints by depth, and draws a thin animated
 * foam band — no depth-buffer plumbing or extra render pass.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import type { ArenaCourse } from '../../services/arenaCourse'
import type { ArenaSession } from '../../services/arenaSession'
import { createFloodCorridorMask, floodFillLevel, floodFootprint, floodWakes, floodWaterY } from '../../services/arenaFlood'
import { ARENA_RULES } from '../../services/arenaEpisode'

const HEIGHT_TEX_RES = 160 // samples along the longer axis; cells stay ~square

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  // Gentle stylized swell — the baked -90° rotation puts world-up on local y.
  float w = 0.028 * sin(2.0 * p.x + uTime * 1.7)
          + 0.022 * sin(3.1 * p.z - uTime * 1.3)
          + 0.015 * sin(4.7 * (p.x + p.z) + uTime * 2.4);
  p.y += w;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const FRAG = /* glsl */ `
uniform sampler2D uHeights;
uniform vec2 uBoundsMin;
uniform vec2 uBoundsSize;
uniform float uWaterY;
uniform float uTime;
uniform float uHeightMin;
uniform float uHeightRange;
uniform vec4 uWakes[2];
uniform float uWakeCount;
varying vec3 vWorld;

void main() {
  vec2 uv = (vWorld.xz - uBoundsMin) / uBoundsSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec4 ground = texture2D(uHeights, uv);
  float corridor = ground.g;
  if (corridor < 0.01) discard;
  float terrain = uHeightMin + ground.r * uHeightRange;
  float depth = uWaterY - terrain;
  if (depth <= 0.0) discard;

  vec3 shallow = vec3(0.32, 0.77, 0.85);
  vec3 deep = vec3(0.04, 0.29, 0.42);
  vec3 foam = vec3(0.94, 0.99, 0.96);
  vec3 sunDir = normalize(vec3(4.0, 16.0, -5.0));

  // Faceted normals from screen-space derivatives — chiseled low-poly water.
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 halfDir = normalize(sunDir + viewDir);
  float spec = pow(max(dot(n, halfDir), 0.0), 42.0) * 0.6;
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0) * 0.25;

  // Approximate absorption from the known terrain clearance: clear shallows,
  // increasingly saturated deep water, while the valley stays visible.
  float absorption = 1.0 - exp(-max(depth, 0.0) * 1.15);
  vec3 color = mix(shallow, deep, absorption) + spec * vec3(1.0, 0.95, 0.8) + fresnel * vec3(0.7, 0.9, 0.95);

  // A bright, continuous shoreline makes the advancing waterline legible
  // against sandstone; animated foam gives it movement without breaking up the edge.
  float shore = (1.0 - smoothstep(0.04, 0.28, depth)) * smoothstep(0.0, 0.025, depth);
  float ripple = 0.75 + 0.25 * sin(uTime * 3.2 + vWorld.x * 8.0 + vWorld.z * 6.0);
  color = mix(color, foam, shore * ripple * 0.9);

  // Twin, fading V-shaped highlights trail only moving rovers on wet routes.
  float wake = 0.0;
  for (int i = 0; i < 2; i++) {
    if (float(i) >= uWakeCount) break;
    vec2 direction = uWakes[i].zw;
    vec2 offset = vWorld.xz - uWakes[i].xy;
    float behind = -dot(offset, direction);
    float side = abs(dot(offset, vec2(-direction.y, direction.x)));
    float arms = exp(-pow((side - 0.16 - behind * 0.22) / 0.13, 2.0));
    wake = max(wake, arms * smoothstep(0.0, 0.3, behind) * (1.0 - smoothstep(1.1, 2.6, behind)));
  }
  color = mix(color, foam, wake * 0.4);

  // Keep the terrain and route choices visible beneath the water, while
  // the advancing shoreline remains bright enough to read at a glance.
  float alpha = smoothstep(0.0, 0.06, depth) * (0.34 + 0.28 * absorption + fresnel * 0.6);
  alpha = max(alpha, shore * ripple * 0.84);
  alpha *= corridor;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`

type Props = { session: ArenaSession; course: ArenaCourse }

export function FloodWater({ session, course }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const footprint = useMemo(() => floodFootprint(course), [course])
  const corridorMask = useMemo(() => createFloodCorridorMask(course), [course])
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const heightTex = useRef<THREE.DataTexture | null>(null)

  // Bake the terrain-height texture once — sampleGround reads the live
  // collider, so the shoreline conforms to the authored basin exactly.
  useEffect(() => {
    if (!footprint || heightTex.current) return
    const [minX, minZ] = footprint.min
    const [sizeX, sizeZ] = footprint.size
    const aspect = sizeZ / Math.max(sizeX, 1e-6)
    const nx = Math.max(8, Math.round(HEIGHT_TEX_RES / Math.max(aspect, 1e-6)))
    const nz = HEIGHT_TEX_RES
    // Pack sampled heights and the corridor mask into a standard RGBA texture.
    const data = new Uint8Array(nx * nz * 4)
    const heightMin = footprint.dryY - 1
    const heightRange = footprint.waterY - heightMin + 1
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = minX + ((i + 0.5) / nx) * sizeX
        const z = minZ + ((j + 0.5) / nz) * sizeZ
        let hit: { point: [number, number, number] } | null = null
        try {
          // sampleGround casts at most 20 units; starting at y=60 misses the basin.
          hit = session.sampleGround([x, footprint.waterY + 8, z])
        } catch {
          hit = null // disposed session — cells stay "no terrain", water stays hidden
        }
        const height = hit ? hit.point[1] : footprint.waterY + 1
        const offset = (j * nx + i) * 4
        data[offset] = Math.round(255 * Math.min(1, Math.max(0, (height - heightMin) / heightRange)))
        data[offset + 1] = Math.round(255 * corridorMask(x, z))
        data[offset + 3] = 255
      }
    }
    const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.UnsignedByteType)
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearFilter
    tex.needsUpdate = true
    heightTex.current = tex
    if (materialRef.current) materialRef.current.uniforms.uHeights.value = tex
    return () => tex.dispose()
  }, [footprint, corridorMask, session])

  const uniforms = useMemo(() => footprint && ({
    // Dry placeholder until the ground and corridor bake completes.
    uHeights: { value: new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType) },
    uBoundsMin: { value: new THREE.Vector2(footprint.min[0], footprint.min[1]) },
    uBoundsSize: { value: new THREE.Vector2(footprint.size[0], footprint.size[1]) },
    uWaterY: { value: footprint.dryY },
    uHeightMin: { value: footprint.dryY - 1 },
    uHeightRange: { value: footprint.waterY - footprint.dryY + 2 },
    uWakes: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uWakeCount: { value: 0 },
    uTime: { value: 0 },
  }), [footprint])

  const geometry = useMemo(() => {
    if (!footprint) return null
    const geo = new THREE.PlaneGeometry(footprint.size[0], footprint.size[1], 48, 48)
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [footprint])
  useEffect(() => () => geometry?.dispose(), [geometry])

  useFrame((state) => {
    if (!footprint || !materialRef.current || !meshRef.current) return
    const ep = session.liveEpisode()
    const level = floodFillLevel(ep.tick, course.scenario.floods, ep.weather.drainedUntilTick, ARENA_RULES.drainTicks)
    const u = materialRef.current.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uWaterY.value = floodWaterY(footprint, level)
    const wakes = level > 0.002 ? floodWakes(ep, course, u.uWaterY.value, corridorMask) : []
    u.uWakeCount.value = wakes.length
    for (let i = 0; i < wakes.length; i++) {
      u.uWakes.value[i].set(...wakes[i])
    }
    // The surface rides the waterline — the visible rise IS the flood event.
    meshRef.current.position.y = u.uWaterY.value
    meshRef.current.visible = level > 0.002
  })

  if (!footprint || !uniforms || !geometry) return null
  const center: [number, number, number] = [
    footprint.min[0] + footprint.size[0] / 2,
    footprint.dryY,
    footprint.min[1] + footprint.size[1] / 2,
  ]
  return (
    <mesh ref={meshRef} geometry={geometry} position={center} visible={false} renderOrder={5} frustumCulled={false}>
      <shaderMaterial ref={materialRef} vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} transparent depthWrite={false} />
    </mesh>
  )
}
