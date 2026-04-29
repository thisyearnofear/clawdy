import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { TERRAIN_CONFIG, getTerrainHeight, getTerrainNormal, getSurfaceType } from '../terrain/terrainUtils'

const GRASS_CONFIG = {
  PER_CHUNK_COUNT: 800,
  GRID_RADIUS: 1,
  BLADE_HEIGHT: 1.2,
  BLADE_WIDTH: 0.12,
  LOD_NEAR: 18,
  LOD_FAR: 40,
  WIND_STRENGTH: 0.35,
  WIND_FREQUENCY: 2.2,
  SEED: 90210,
  HEIGHT_UPDATE_INTERVAL: 0.8,
  BLADE_SEGMENTS: 5,
} as const

type GrassInstance = {
  x: number
  z: number
  scale: number
  rotY: number
  rotZ: number
}

const CHUNK_SIZE = TERRAIN_CONFIG.SIZE

const seededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const chunkSeed = (x: number, z: number) => {
  const hash = (x * 73856093) ^ (z * 19349663) ^ GRASS_CONFIG.SEED
  return hash >>> 0
}

const createGrassMaterial = () => {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.3, 0.6, 0.25),
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.05
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uWindStrength = { value: GRASS_CONFIG.WIND_STRENGTH }
    shader.uniforms.uWindFrequency = { value: GRASS_CONFIG.WIND_FREQUENCY }
    shader.uniforms.uTopColor = { value: new THREE.Color(0.50, 0.82, 0.35) }
    shader.uniforms.uMidColor = { value: new THREE.Color(0.28, 0.58, 0.22) }
    shader.uniforms.uBottomColor = { value: new THREE.Color(0.08, 0.22, 0.06) }
    shader.uniforms.uLodNear = { value: GRASS_CONFIG.LOD_NEAR }
    shader.uniforms.uLodFar = { value: GRASS_CONFIG.LOD_FAR }

    // ── Vertex shader: Bézier curve + multi-frequency wind ──
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>

uniform float uTime;
uniform float uWindStrength;
uniform float uWindFrequency;
varying vec3 vWorldPos;
varying vec2 vBladeUv;
varying float vAO;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
`
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>

float t = uv.y; // 0 at root, 1 at tip

// Per-instance variation from instance matrix translation
#ifdef USE_INSTANCING
vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
float iHash = hash21(iPos.xz);
#else
vec3 iPos = vec3(0.0);
float iHash = 0.0;
#endif

// Quadratic Bézier bend: control point pushes tip sideways
float bendAmount = 0.3 + iHash * 0.4;
float bendDir = iHash * 6.2831;
vec2 bendVec = vec2(cos(bendDir), sin(bendDir)) * bendAmount;
transformed.x += bendVec.x * t * t;
transformed.z += bendVec.y * t * t;

// Width taper: wider at base, pointed at tip
float widthTaper = 1.0 - t * t * 0.7;
transformed.x *= widthTaper;

// Multi-frequency wind
float windPhase = iPos.x * 0.3 + iPos.z * 0.2 + iHash * 6.28;
float windSlow = sin(windPhase + uTime * 0.8) * 0.6;
float windFast = sin(windPhase * 2.3 + uTime * 2.4) * 0.25;
float windGust = sin(windPhase * 0.4 + uTime * 0.3) * 0.15;
float wind = (windSlow + windFast + windGust) * uWindStrength;

// Wind only affects upper portion (smoothstep mask)
float windMask = smoothstep(0.1, 0.8, t);
transformed.x += wind * windMask;
transformed.z += wind * windMask * 0.5;

// AO: darker at the root
vAO = smoothstep(0.0, 0.35, t);
vBladeUv = uv;
`
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
#ifdef USE_INSTANCING
vWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`
      )

    // ── Fragment shader: 3-stop gradient + AO + distance fade ──
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>

uniform vec3 uTopColor;
uniform vec3 uMidColor;
uniform vec3 uBottomColor;
uniform float uLodNear;
uniform float uLodFar;
varying vec3 vWorldPos;
varying vec2 vBladeUv;
varying float vAO;
`
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
// 3-stop height gradient: bottom → mid → top
float t = vBladeUv.y;
vec3 bladeColor = t < 0.5
  ? mix(uBottomColor, uMidColor, t * 2.0)
  : mix(uMidColor, uTopColor, (t - 0.5) * 2.0);

// Apply AO darkening at root
bladeColor *= 0.55 + 0.45 * vAO;

diffuseColor.rgb = bladeColor;
`
      )
      .replace(
        '#include <alphamap_fragment>',
        /* glsl */ `#include <alphamap_fragment>
// Soft tip and base alpha
float tipAlpha = 1.0 - smoothstep(0.85, 1.0, vBladeUv.y);
float baseAlpha = smoothstep(0.0, 0.05, vBladeUv.y);
// Distance fade
float distFade = 1.0 - smoothstep(uLodNear, uLodFar, distance(cameraPosition, vWorldPos));
diffuseColor.a *= tipAlpha * baseAlpha * distFade;
`
      )

    material.userData.uniforms = shader.uniforms
  }

  material.customProgramCacheKey = () => 'grass-material-v3'
  return material
}

export function Vegetation({
  getHeightAt
}: {
  getHeightAt?: ((x: number, z: number) => number) | null
}) {
  const { camera } = useThree()
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const instancesRef = useRef<GrassInstance[]>([])
  const centerCoordRef = useRef({ x: 0, z: 0 })
  const lastHeightUpdateRef = useRef(0)
  const timeRef = useRef<number | undefined>(undefined)

  const geometry = useMemo(() => {
    const blade = new THREE.PlaneGeometry(
      GRASS_CONFIG.BLADE_WIDTH,
      GRASS_CONFIG.BLADE_HEIGHT,
      1,
      GRASS_CONFIG.BLADE_SEGMENTS
    )
    blade.translate(0, GRASS_CONFIG.BLADE_HEIGHT / 2, 0)
    return blade
  }, [])

  const material = useMemo(() => createGrassMaterial(), [])

  const maxInstances = useMemo(() => {
    const gridSize = GRASS_CONFIG.GRID_RADIUS * 2 + 1
    return gridSize * gridSize * GRASS_CONFIG.PER_CHUNK_COUNT
  }, [])

  const sampleHeight = useCallback((x: number, z: number) => {
    if (getHeightAt) return getHeightAt(x, z)
    return getTerrainHeight(x, z)
  }, [getHeightAt])

  const rebuildInstances = useCallback((centerX: number, centerZ: number) => {
    const instances: GrassInstance[] = []
    for (let gz = -GRASS_CONFIG.GRID_RADIUS; gz <= GRASS_CONFIG.GRID_RADIUS; gz += 1) {
      for (let gx = -GRASS_CONFIG.GRID_RADIUS; gx <= GRASS_CONFIG.GRID_RADIUS; gx += 1) {
        const chunkX = centerX + gx
        const chunkZ = centerZ + gz
        const random = seededRandom(chunkSeed(chunkX, chunkZ))

        let chunkCount = 0
        let attempts = 0
        while (chunkCount < GRASS_CONFIG.PER_CHUNK_COUNT && attempts < GRASS_CONFIG.PER_CHUNK_COUNT * 6) {
          attempts += 1

          const x = (random() - 0.5) * CHUNK_SIZE + chunkX * CHUNK_SIZE
          const z = (random() - 0.5) * CHUNK_SIZE + chunkZ * CHUNK_SIZE
          const height = sampleHeight(x, z)

          if (height < -0.4) continue

          // Skip road and mud surfaces — grass only on grass/sand
          const surface = getSurfaceType(x, z)
          if (surface === 'road' || surface === 'mud') continue

          const density = THREE.MathUtils.clamp((height + 1.5) / 5, 0.1, 1)
          // Reduce density on sand
          const surfaceDensity = surface === 'sand' ? density * 0.3 : density
          if (random() > surfaceDensity) continue

          // Slope-aware tilt from terrain normal
          const [nx, , nz] = getTerrainNormal(x, z)
          const slopeTiltX = Math.atan2(nx, 1) * 0.4
          const slopeTiltZ = Math.atan2(nz, 1) * 0.4

          const scale = 0.6 + random() * 0.9
          instances.push({
            x,
            z,
            scale,
            rotY: random() * Math.PI,
            rotZ: slopeTiltX + (random() - 0.5) * 0.15
          })
          chunkCount += 1

          if (instances.length >= maxInstances) break
        }
      }
    }

    instancesRef.current = instances
  }, [maxInstances, sampleHeight])

  const applyMatrices = useCallback(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const instances = instancesRef.current

    for (let i = 0; i < instances.length; i += 1) {
      const item = instances[i]
      const height = sampleHeight(item.x, item.z)
      dummy.position.set(item.x, height + 0.02, item.z)
      dummy.rotation.set(0, item.rotY, item.rotZ)
      dummy.scale.set(item.scale, item.scale, item.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.count = instances.length
    mesh.instanceMatrix.needsUpdate = true
  }, [sampleHeight])

  useLayoutEffect(() => {
    materialRef.current = material
  }, [material])

  useEffect(() => {
    const centerX = Math.floor(camera.position.x / CHUNK_SIZE)
    const centerZ = Math.floor(camera.position.z / CHUNK_SIZE)
    centerCoordRef.current = { x: centerX, z: centerZ }
    rebuildInstances(centerX, centerZ)
    applyMatrices()
  }, [camera, applyMatrices, rebuildInstances])

  useFrame(({ clock }) => {
    // Update time uniform for shader animation (THREE.js requires this pattern)
    const uniforms = materialRef.current?.userData.uniforms
    if (uniforms && timeRef.current !== undefined) {
      // eslint-disable-next-line react-hooks/immutability
      uniforms.uTime.value = timeRef.current
    }
    timeRef.current = clock.getElapsedTime()

    if (!camera || !camera.position) return;

    const centerX = Math.floor(camera.position.x / CHUNK_SIZE)
    const centerZ = Math.floor(camera.position.z / CHUNK_SIZE)

    if (centerX !== centerCoordRef.current.x || centerZ !== centerCoordRef.current.z) {
      centerCoordRef.current = { x: centerX, z: centerZ }
      rebuildInstances(centerX, centerZ)
      applyMatrices()
      lastHeightUpdateRef.current = clock.getElapsedTime()
      return
    }

    if (clock.getElapsedTime() - lastHeightUpdateRef.current > GRASS_CONFIG.HEIGHT_UPDATE_INTERVAL) {
      lastHeightUpdateRef.current = clock.getElapsedTime()
      applyMatrices()
    }
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, maxInstances]}
      frustumCulled
      castShadow={false}
      receiveShadow
    />
  )
}
