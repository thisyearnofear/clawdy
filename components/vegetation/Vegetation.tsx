import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { TERRAIN_CONFIG, getTerrainHeight } from '../terrain/terrainUtils'

const GRASS_CONFIG = {
  PER_CHUNK_COUNT: 260,
  GRID_RADIUS: 1,
  BLADE_HEIGHT: 1.2,
  BLADE_WIDTH: 0.12,
  LOD_NEAR: 14,
  LOD_FAR: 34,
  WIND_STRENGTH: 0.35,
  WIND_FREQUENCY: 2.2,
  SEED: 90210,
  HEIGHT_UPDATE_INTERVAL: 0.8
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
    color: new THREE.Color(0.25, 0.6, 0.25),
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.08
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uWindStrength = { value: GRASS_CONFIG.WIND_STRENGTH }
    shader.uniforms.uWindFrequency = { value: GRASS_CONFIG.WIND_FREQUENCY }
    shader.uniforms.uTopColor = { value: new THREE.Color(0.45, 0.8, 0.35) }
    shader.uniforms.uBottomColor = { value: new THREE.Color(0.12, 0.35, 0.12) }
    shader.uniforms.uLodNear = { value: GRASS_CONFIG.LOD_NEAR }
    shader.uniforms.uLodFar = { value: GRASS_CONFIG.LOD_FAR }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n\nuniform float uTime;\nuniform float uWindStrength;\nuniform float uWindFrequency;\nvarying vec3 vWorldPos;\nvarying vec2 vUv;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nfloat sway = sin((position.x + position.y) * uWindFrequency + uTime) * uWindStrength;\ntransformed.x += sway * uv.y;\ntransformed.z += sway * uv.y * 0.6;\nvUv = uv;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\n#ifdef USE_INSTANCING\nvWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n\nuniform vec3 uTopColor;\nuniform vec3 uBottomColor;\nuniform float uLodNear;\nuniform float uLodFar;\nvarying vec3 vWorldPos;\nvarying vec2 vUv;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\nvec3 bladeColor = mix(uBottomColor, uTopColor, vUv.y);\ndiffuseColor.rgb *= bladeColor;`
      )
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>\nfloat alphaMask = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.65, vUv.y);\nfloat distFade = 1.0 - smoothstep(uLodNear, uLodFar, distance(cameraPosition, vWorldPos));\ndiffuseColor.a *= alphaMask * distFade;`
      )

    material.userData.uniforms = shader.uniforms
  }

  material.customProgramCacheKey = () => 'grass-material-v2'
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

  const geometry = useMemo(() => {
    const blade = new THREE.PlaneGeometry(
      GRASS_CONFIG.BLADE_WIDTH,
      GRASS_CONFIG.BLADE_HEIGHT,
      1,
      4
    )
    blade.translate(0, GRASS_CONFIG.BLADE_HEIGHT / 2, 0)
    return blade
  }, [])

  const material = useMemo(() => createGrassMaterial(), [])

  const maxInstances = useMemo(() => {
    const gridSize = GRASS_CONFIG.GRID_RADIUS * 2 + 1
    return gridSize * gridSize * GRASS_CONFIG.PER_CHUNK_COUNT
  }, [])

  const sampleHeight = (x: number, z: number) => {
    if (getHeightAt) return getHeightAt(x, z)
    return getTerrainHeight(x, z)
  }

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

          const density = THREE.MathUtils.clamp((height + 1.5) / 5, 0.1, 1)
          if (random() > density) continue

          const scale = 0.6 + random() * 0.9
          instances.push({
            x,
            z,
            scale,
            rotY: random() * Math.PI,
            rotZ: (random() - 0.5) * 0.2
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
    const uniforms = materialRef.current?.userData.uniforms
    if (uniforms) {
      uniforms.uTime.value = clock.getElapsedTime()
    }

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
      castShadow
      receiveShadow
    />
  )
}
