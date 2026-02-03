import { useMemo, useRef, useLayoutEffect, useCallback } from 'react'
import * as THREE from 'three'
import { RigidBody, HeightfieldCollider, useRapier } from '@react-three/rapier'
import { useFrame, useThree } from '@react-three/fiber'
import type { Collider } from '@dimforge/rapier3d-compat'
import { TERRAIN_CONFIG, getTerrainHeight } from './terrainUtils'

const GRID_RADIUS = 1
const CHUNK_SIZE = TERRAIN_CONFIG.SIZE
const SEGMENTS = TERRAIN_CONFIG.SEGMENTS
const CHUNK_Y_OFFSET = -0.1
const DEFORMATION_CACHE_LIMIT = 12
const HEIGHTFIELD_ROWS = SEGMENTS + 1
const HEIGHTFIELD_COLS = SEGMENTS + 1
const COLLIDER_UPDATE_INTERVAL = 0.2
const CURVATURE = {
  STRENGTH: 0.00018,
  RADIUS: 120
} as const

type ChunkState = {
  coordX: number
  coordZ: number
  geometry: THREE.PlaneGeometry
  colors: Float32Array
  deformer: TerrainDeformer
  heightfield: Float32Array
  dirty: boolean
}

type DeformationCacheEntry = {
  positions: Float32Array
}

const keyFor = (x: number, z: number) => `${x},${z}`

// Terrain deformation manager
class TerrainDeformer {
  private originalPositions: Float32Array

  constructor(originalPositions: Float32Array) {
    this.originalPositions = originalPositions.slice()
  }

  setBasePositions(basePositions: Float32Array) {
    this.originalPositions = basePositions.slice()
  }

  deformAtPoint(
    geometry: THREE.BufferGeometry,
    point: THREE.Vector3,
    strength: number = TERRAIN_CONFIG.DEFORMATION_STRENGTH
  ) {
    const positionAttr = geometry.attributes.position as THREE.BufferAttribute
    const vertices = positionAttr.array as Float32Array
    const tempVertex = new THREE.Vector3()

    let hasDeformation = false

    for (let i = 0; i < positionAttr.count; i++) {
      tempVertex.fromArray(vertices, i * 3)

      const distance = tempVertex.distanceTo(point)

      if (distance < TERRAIN_CONFIG.DEFORMATION_RADIUS) {
        const influence = Math.pow(
          (TERRAIN_CONFIG.DEFORMATION_RADIUS - distance) / TERRAIN_CONFIG.DEFORMATION_RADIUS,
          3
        )

        const deformationOffset = influence * strength
        tempVertex.y += deformationOffset

        tempVertex.toArray(vertices, i * 3)
        hasDeformation = true
      }
    }

    if (hasDeformation) {
      positionAttr.needsUpdate = true
      geometry.computeVertexNormals()
    }

    return hasDeformation
  }

  resetDeformation(geometry: THREE.BufferGeometry) {
    const positionAttr = geometry.attributes.position as THREE.BufferAttribute
    positionAttr.array.set(this.originalPositions)
    positionAttr.needsUpdate = true
    geometry.computeVertexNormals()
  }
}

const applyBaseToGeometry = (
  geometry: THREE.PlaneGeometry,
  colors: Float32Array,
  coordX: number,
  coordZ: number
) => {
  const positionAttr = geometry.attributes.position as THREE.BufferAttribute
  const count = positionAttr.count
  const offsetX = coordX * CHUNK_SIZE
  const offsetZ = coordZ * CHUNK_SIZE

  for (let i = 0; i < count; i++) {
    const localX = positionAttr.getX(i)
    const localZ = positionAttr.getZ(i)

    const worldX = localX + offsetX
    const worldZ = localZ + offsetZ

    const height = getTerrainHeight(worldX, worldZ)
    positionAttr.setY(i, height)

    const colorIndex = i * 3
    if (height < -2) {
      colors[colorIndex] = 0.1
      colors[colorIndex + 1] = 0.3
      colors[colorIndex + 2] = 0.8
    } else if (height < -0.5) {
      colors[colorIndex] = 0.9
      colors[colorIndex + 1] = 0.8
      colors[colorIndex + 2] = 0.6
    } else if (height < 2) {
      colors[colorIndex] = 0.2
      colors[colorIndex + 1] = 0.6
      colors[colorIndex + 2] = 0.2
    } else if (height < 5) {
      colors[colorIndex] = 0.5
      colors[colorIndex + 1] = 0.5
      colors[colorIndex + 2] = 0.5
    } else {
      colors[colorIndex] = 1
      colors[colorIndex + 1] = 1
      colors[colorIndex + 2] = 1
    }
  }

  positionAttr.needsUpdate = true
  geometry.computeVertexNormals()

  let colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute | null
  if (!colorAttr) {
    colorAttr = new THREE.BufferAttribute(colors, 3)
    geometry.setAttribute('color', colorAttr)
  } else {
    colorAttr.array.set(colors)
    colorAttr.needsUpdate = true
  }
}

const applyColorsFromGeometry = (geometry: THREE.PlaneGeometry, colors: Float32Array) => {
  const positionAttr = geometry.attributes.position as THREE.BufferAttribute
  const count = positionAttr.count

  for (let i = 0; i < count; i++) {
    const height = positionAttr.getY(i)
    const colorIndex = i * 3
    if (height < -2) {
      colors[colorIndex] = 0.1
      colors[colorIndex + 1] = 0.3
      colors[colorIndex + 2] = 0.8
    } else if (height < -0.5) {
      colors[colorIndex] = 0.9
      colors[colorIndex + 1] = 0.8
      colors[colorIndex + 2] = 0.6
    } else if (height < 2) {
      colors[colorIndex] = 0.2
      colors[colorIndex + 1] = 0.6
      colors[colorIndex + 2] = 0.2
    } else if (height < 5) {
      colors[colorIndex] = 0.5
      colors[colorIndex + 1] = 0.5
      colors[colorIndex + 2] = 0.5
    } else {
      colors[colorIndex] = 1
      colors[colorIndex + 1] = 1
      colors[colorIndex + 2] = 1
    }
  }

  let colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute | null
  if (!colorAttr) {
    colorAttr = new THREE.BufferAttribute(colors, 3)
    geometry.setAttribute('color', colorAttr)
  } else {
    colorAttr.array.set(colors)
    colorAttr.needsUpdate = true
  }
}

const buildHeightfieldHeights = (geometry: THREE.PlaneGeometry) => {
  const positionAttr = geometry.attributes.position as THREE.BufferAttribute
  const stride = SEGMENTS + 1
  const heights = new Float32Array(stride * stride)

  for (let row = 0; row < stride; row++) {
    for (let col = 0; col < stride; col++) {
      const idx = row * stride + col
      const height = positionAttr.getY(idx)
      heights[col * stride + row] = height
    }
  }

  return heights
}

const sampleHeightFromGeometry = (
  geometry: THREE.PlaneGeometry,
  localX: number,
  localZ: number
) => {
  const half = CHUNK_SIZE / 2
  const segments = SEGMENTS
  const step = CHUNK_SIZE / segments

  const u = (localX + half) / step
  const v = (localZ + half) / step

  const ix = THREE.MathUtils.clamp(Math.floor(u), 0, segments)
  const iz = THREE.MathUtils.clamp(Math.floor(v), 0, segments)
  const fx = THREE.MathUtils.clamp(u - ix, 0, 1)
  const fz = THREE.MathUtils.clamp(v - iz, 0, 1)

  const stride = segments + 1
  const idx = iz * stride + ix
  const idxX = Math.min(ix + 1, segments)
  const idxZ = Math.min(iz + 1, segments)
  const idxRight = iz * stride + idxX
  const idxDown = idxZ * stride + ix
  const idxDiag = idxZ * stride + idxX

  const positionAttr = geometry.attributes.position as THREE.BufferAttribute
  const h00 = positionAttr.getY(idx)
  const h10 = positionAttr.getY(idxRight)
  const h01 = positionAttr.getY(idxDown)
  const h11 = positionAttr.getY(idxDiag)

  const hx0 = THREE.MathUtils.lerp(h00, h10, fx)
  const hx1 = THREE.MathUtils.lerp(h01, h11, fx)
  return THREE.MathUtils.lerp(hx0, hx1, fz)
}

export function Terrain({
  onSamplerReady
}: {
  onSamplerReady?: (sampler: (x: number, z: number) => number) => void
}) {
  const { camera } = useThree()
  const { rapier } = useRapier()
  const meshRefs = useRef<THREE.Mesh[]>([])
  const rigidBodyRefs = useRef<any[]>([])
  const colliderRefs = useRef<Collider[]>([])
  const chunkStateRef = useRef<ChunkState[]>([])
  const deformationCacheRef = useRef<Map<string, DeformationCacheEntry>>(new Map())
  const chunkCoordMapRef = useRef<Map<string, number>>(new Map())
  const centerCoordRef = useRef({ x: 0, z: 0 })
  const vehiclesRef = useRef<THREE.Object3D[]>([])
  const tempVehiclePos = useMemo(() => new THREE.Vector3(), [])
  const tempLocalPoint = useMemo(() => new THREE.Vector3(), [])
  const lastColliderUpdateRef = useRef(0)

  const chunkSlots = useMemo(() => {
    const slots: ChunkState[] = []
    for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz += 1) {
      for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx += 1) {
        const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, SEGMENTS, SEGMENTS)
        geometry.rotateX(-Math.PI / 2)
        const colors = new Float32Array(geometry.attributes.position.count * 3)
        applyBaseToGeometry(geometry, colors, gx, gz)
        const heightfield = buildHeightfieldHeights(geometry)
        const deformer = new TerrainDeformer(geometry.attributes.position.array as Float32Array)
        slots.push({ coordX: gx, coordZ: gz, geometry, colors, deformer, heightfield, dirty: false })
      }
    }
    return slots
  }, [])

  const terrainMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.8,
      metalness: 0.1,
      wireframe: false
    })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uCurvatureStrength = { value: CURVATURE.STRENGTH }
      shader.uniforms.uCurvatureRadius = { value: CURVATURE.RADIUS }

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>\n\nuniform float uCurvatureStrength;\nuniform float uCurvatureRadius;`
        )
        .replace(
          '#include <project_vertex>',
          `vec4 worldPos = modelMatrix * vec4(transformed, 1.0);\nfloat dist = length(worldPos.xz - cameraPosition.xz);\nfloat curveMask = smoothstep(0.0, uCurvatureRadius, dist);\nworldPos.y -= (dist * dist) * uCurvatureStrength * curveMask;\nvec4 mvPosition = viewMatrix * worldPos;\ngl_Position = projectionMatrix * mvPosition;`
        )
    }
    material.customProgramCacheKey = () => 'terrain-material-v2'
    return material
  }, [])

  const registerVehicle = useCallback((vehicle: THREE.Object3D) => {
    if (!vehiclesRef.current.includes(vehicle)) {
      vehiclesRef.current.push(vehicle)
    }
    return () => {
      vehiclesRef.current = vehiclesRef.current.filter((v) => v !== vehicle)
    }
  }, [])

  const getHeightAt = useCallback((x: number, z: number) => {
    const coordX = Math.floor(x / CHUNK_SIZE)
    const coordZ = Math.floor(z / CHUNK_SIZE)
    const key = keyFor(coordX, coordZ)
    const chunkIndex = chunkCoordMapRef.current.get(key)
    if (chunkIndex === undefined) {
      return getTerrainHeight(x, z) + CHUNK_Y_OFFSET
    }

    const chunk = chunkStateRef.current[chunkIndex]
    const localX = x - coordX * CHUNK_SIZE
    const localZ = z - coordZ * CHUNK_SIZE
    const height = sampleHeightFromGeometry(chunk.geometry, localX, localZ)
    return height + CHUNK_Y_OFFSET
  }, [])

  useLayoutEffect(() => {
    chunkStateRef.current = chunkSlots
    chunkCoordMapRef.current.clear()
    chunkSlots.forEach((chunk, index) => {
      chunkCoordMapRef.current.set(keyFor(chunk.coordX, chunk.coordZ), index)
    })
    onSamplerReady?.(getHeightAt)
  }, [chunkSlots, getHeightAt, onSamplerReady])

  useFrame((state) => {
    const centerX = Math.floor(camera.position.x / CHUNK_SIZE)
    const centerZ = Math.floor(camera.position.z / CHUNK_SIZE)

    if (centerX !== centerCoordRef.current.x || centerZ !== centerCoordRef.current.z) {
      centerCoordRef.current = { x: centerX, z: centerZ }
      chunkCoordMapRef.current.clear()

      let index = 0
      for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz += 1) {
        for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx += 1) {
          const targetX = centerX + gx
          const targetZ = centerZ + gz
          const chunk = chunkStateRef.current[index]

          if (chunk.coordX !== targetX || chunk.coordZ !== targetZ) {
            const oldKey = keyFor(chunk.coordX, chunk.coordZ)
            const currentPositions = (chunk.geometry.attributes.position.array as Float32Array).slice()
            const cache = deformationCacheRef.current
            if (cache.has(oldKey)) cache.delete(oldKey)
            cache.set(oldKey, { positions: currentPositions })
            if (cache.size > DEFORMATION_CACHE_LIMIT) {
              const oldestKey = cache.keys().next().value
              if (oldestKey !== undefined) cache.delete(oldestKey)
            }

            chunk.coordX = targetX
            chunk.coordZ = targetZ

            const newKey = keyFor(targetX, targetZ)
            const cached = deformationCacheRef.current.get(newKey)
            if (cached) {
              const positionAttr = chunk.geometry.attributes.position as THREE.BufferAttribute
              positionAttr.array.set(cached.positions)
              positionAttr.needsUpdate = true
              chunk.geometry.computeVertexNormals()
              applyColorsFromGeometry(chunk.geometry, chunk.colors)
              deformationCacheRef.current.delete(newKey)
              deformationCacheRef.current.set(newKey, cached)
            } else {
              applyBaseToGeometry(chunk.geometry, chunk.colors, targetX, targetZ)
            }

            chunk.heightfield = buildHeightfieldHeights(chunk.geometry)
            chunk.dirty = true
            chunk.deformer.setBasePositions(chunk.geometry.attributes.position.array as Float32Array)
          }

          const mesh = meshRefs.current[index]
          if (mesh) {
            mesh.position.set(targetX * CHUNK_SIZE, CHUNK_Y_OFFSET, targetZ * CHUNK_SIZE)
          }

          const rigidBody = rigidBodyRefs.current[index]
          if (rigidBody) {
            rigidBody.setTranslation(
              { x: targetX * CHUNK_SIZE, y: CHUNK_Y_OFFSET, z: targetZ * CHUNK_SIZE },
              false
            )
          }

          chunkCoordMapRef.current.set(keyFor(targetX, targetZ), index)
          index += 1
        }
      }
    }

    if (vehiclesRef.current.length === 0) return

    for (const vehicle of vehiclesRef.current) {
      tempVehiclePos.set(0, 0, 0)
      vehicle.getWorldPosition(tempVehiclePos)

      const coordX = Math.floor(tempVehiclePos.x / CHUNK_SIZE)
      const coordZ = Math.floor(tempVehiclePos.z / CHUNK_SIZE)
      const chunkIndex = chunkCoordMapRef.current.get(keyFor(coordX, coordZ))
      if (chunkIndex === undefined) continue

      const chunk = chunkStateRef.current[chunkIndex]
      const localX = tempVehiclePos.x - coordX * CHUNK_SIZE
      const localZ = tempVehiclePos.z - coordZ * CHUNK_SIZE

      // Deformation drives heightfield colliders on a throttled update loop.
      tempLocalPoint.set(localX, 0, localZ)
      const didDeform = chunk.deformer.deformAtPoint(
        chunk.geometry,
        tempLocalPoint,
        TERRAIN_CONFIG.DEFORMATION_STRENGTH * 0.1
      )
      if (didDeform) {
        chunk.dirty = true
      }
    }

    const elapsed = state.clock.getElapsedTime()
    if (elapsed - lastColliderUpdateRef.current > COLLIDER_UPDATE_INTERVAL) {
      lastColliderUpdateRef.current = elapsed
      for (let index = 0; index < chunkStateRef.current.length; index += 1) {
        const chunk = chunkStateRef.current[index]
        if (!chunk.dirty) continue
        const collider = colliderRefs.current[index]
        if (!collider) continue

        const heights = buildHeightfieldHeights(chunk.geometry)
        chunk.heightfield = heights
        const shape = new rapier.Heightfield(
          HEIGHTFIELD_ROWS,
          HEIGHTFIELD_COLS,
          heights,
          new rapier.Vector3(CHUNK_SIZE, 1, CHUNK_SIZE)
        )
        // @ts-expect-error: Known incompatibility between Rapier versions - shape is functionally compatible
        collider.setShape(shape)
        chunk.dirty = false
      }
    }
  })

  return (
    <group>
      {chunkSlots.map((chunk, index) => (
        <RigidBody
          key={`terrain-${index}`}
          type="fixed"
          position={[chunk.coordX * CHUNK_SIZE, CHUNK_Y_OFFSET, chunk.coordZ * CHUNK_SIZE]}
          ref={(api) => {
            if (api) rigidBodyRefs.current[index] = api
          }}
        >
          <HeightfieldCollider
            ref={(collider) => {
              if (collider) colliderRefs.current[index] = collider as any
            }}
            args={[
              HEIGHTFIELD_ROWS,
              HEIGHTFIELD_COLS,
              Array.from(chunk.heightfield),
              { x: CHUNK_SIZE, y: 1, z: CHUNK_SIZE }
            ]}
          />
          <mesh
            ref={(mesh) => {
              if (mesh) meshRefs.current[index] = mesh
            }}
            geometry={chunk.geometry}
            receiveShadow
            userData={{ registerVehicle }}
            position={[chunk.coordX * CHUNK_SIZE, CHUNK_Y_OFFSET, chunk.coordZ * CHUNK_SIZE]}
          >
            <primitive object={terrainMaterial} attach="material" />
          </mesh>
        </RigidBody>
      ))}
    </group>
  )
}
