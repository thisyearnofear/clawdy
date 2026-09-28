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
import { floodFillLevel, floodFootprint, floodWaterY } from '../../services/arenaFlood'
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
uniform float uLevel;
varying vec3 vWorld;

void main() {
  vec2 uv = (vWorld.xz - uBoundsMin) / uBoundsSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  float terrain = texture2D(uHeights, uv).r;
  float depth = uWaterY - terrain;
  if (depth <= 0.0) discard;

  vec3 shallow = vec3(0.44, 0.73, 0.79);
  vec3 deep = vec3(0.07, 0.33, 0.44);
  vec3 foam = vec3(0.92, 0.98, 0.96);
  vec3 sunDir = normalize(vec3(4.0, 16.0, -5.0));

  // Faceted normals from screen-space derivatives — chiseled low-poly water.
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 halfDir = normalize(sunDir + viewDir);
  float spec = pow(max(dot(n, halfDir), 0.0), 42.0) * 0.6;
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0) * 0.25;

  float depthMix = clamp(depth / 1.15, 0.0, 1.0);
  vec3 color = mix(shallow, deep, depthMix) + spec * vec3(1.0, 0.95, 0.8) + fresnel * vec3(0.7, 0.9, 0.95);

  // Animated foam band hugging the shoreline.
  float band = smoothstep(0.16, 0.03, depth) * smoothstep(0.0, 0.02, depth);
  float ripple = 0.55 + 0.45 * sin(uTime * 3.2 + vWorld.x * 8.0 + vWorld.z * 6.0);
  color = mix(color, foam, band * ripple * 0.8);

  float alpha = smoothstep(0.0, 0.05, depth) * (0.55 + 0.4 * depthMix) * uLevel;
  alpha = max(alpha, band * ripple * 0.9 * uLevel);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`

type Props = { session: ArenaSession; course: ArenaCourse }

export function FloodWater({ session, course }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const footprint = useMemo(() => floodFootprint(course), [course])
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
    const data = new Float32Array(nx * nz)
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = minX + ((i + 0.5) / nx) * sizeX
        const z = minZ + ((j + 0.5) / nz) * sizeZ
        let hit: { point: [number, number, number] } | null = null
        try {
          hit = session.sampleGround([x, 60, z])
        } catch {
          hit = null // disposed session — cells stay "no terrain", water stays hidden
        }
        data[j * nx + i] = hit ? hit.point[1] : -1e4
      }
    }
    const tex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.FloatType)
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearFilter
    tex.needsUpdate = true
    heightTex.current = tex
    if (materialRef.current) materialRef.current.uniforms.uHeights.value = tex
    return () => tex.dispose()
  }, [footprint, session])

  const uniforms = useMemo(() => footprint && ({
    // 1×1 "abyss" placeholder until the bake effect installs the real grid —
    // depth = waterY − (−1e4) would flood everything, so seed it far *above*
    // the waterline instead: dry everywhere until the bake lands.
    uHeights: { value: new THREE.DataTexture(new Float32Array([1e4]), 1, 1, THREE.RedFormat, THREE.FloatType) },
    uBoundsMin: { value: new THREE.Vector2(footprint.min[0], footprint.min[1]) },
    uBoundsSize: { value: new THREE.Vector2(footprint.size[0], footprint.size[1]) },
    uWaterY: { value: footprint.dryY },
    uTime: { value: 0 },
    uLevel: { value: 0 },
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
    u.uLevel.value = level
    u.uWaterY.value = floodWaterY(footprint, level)
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
