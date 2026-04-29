import { useMemo, useRef, useLayoutEffect, useCallback, useState } from 'react'
import * as THREE from 'three'
import { RigidBody } from '@react-three/rapier'
import { useFrame, useThree } from '@react-three/fiber'
import { TERRAIN_CONFIG, getTerrainHeight } from './terrainUtils'
import { createTerrainMaterial, updateTerrainMaterial } from './terrainShader'
import { useGameStore } from '../../services/gameStore'

const GRID_RADIUS = 1
const CHUNK_SIZE = TERRAIN_CONFIG.SIZE
const SEGMENTS = TERRAIN_CONFIG.SEGMENTS
const CHUNK_Y_OFFSET = -0.1
const DEFORMATION_CACHE_LIMIT = 12

type ChunkState = {
  coordX: number
  coordZ: number
  geometry: THREE.PlaneGeometry
  deformer: TerrainDeformer
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
  }

  positionAttr.needsUpdate = true
  geometry.computeVertexNormals()
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
  const preset = useGameStore(s => s.cloudConfig.preset) || 'custom'
  const lightning = useGameStore(s => s.activeWeatherEffects.lightning?.intensity ?? 0)
  const meshRefs = useRef<THREE.Mesh[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rigidBodyRefs = useRef<any[]>([])
  const chunkStateRef = useRef<ChunkState[]>([])
  const deformationCacheRef = useRef<Map<string, DeformationCacheEntry>>(new Map())
  const chunkCoordMapRef = useRef<Map<string, number>>(new Map())
  const centerCoordRef = useRef({ x: 0, z: 0 })
  const vehiclesRef = useRef<THREE.Object3D[]>([])
  const tempVehiclePos = useMemo(() => new THREE.Vector3(), [])
  const tempLocalPoint = useMemo(() => new THREE.Vector3(), [])

  const [, setTerrainVersion] = useState(0)

  const chunkSlots = useMemo(() => {
    const slots: ChunkState[] = []
    for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz += 1) {
      for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx += 1) {
        const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, SEGMENTS, SEGMENTS)
        geometry.rotateX(-Math.PI / 2)
        applyBaseToGeometry(geometry, gx, gz)
        const deformer = new TerrainDeformer(geometry.attributes.position.array as Float32Array)
        slots.push({ coordX: gx, coordZ: gz, geometry, deformer, dirty: false })
      }
    }
    return slots
  }, [])

  const terrainMaterial = useMemo(() => createTerrainMaterial(), [])

  // Wetness ramp: storms lower roughness (shinier) and slightly increase metalness.
  const wetnessRef = useRef(0)

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

  useFrame(() => {
    if (!camera || !camera.position) return;

    // Update wetness via shader uniform
    const targetWet =
      preset === 'stormy' || (preset === 'custom' && lightning > 0.35) ? 1 : 0
    wetnessRef.current = THREE.MathUtils.lerp(wetnessRef.current, targetWet, 0.04 + lightning * 0.06)
    updateTerrainMaterial(terrainMaterial, performance.now() * 0.001, wetnessRef.current)

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
              deformationCacheRef.current.delete(newKey)
              deformationCacheRef.current.set(newKey, cached)
            } else {
              applyBaseToGeometry(chunk.geometry, targetX, targetZ)
            }

            chunk.dirty = true
            chunk.deformer.setBasePositions(chunk.geometry.attributes.position.array as Float32Array)
          }

          chunkCoordMapRef.current.set(keyFor(targetX, targetZ), index)
          index += 1
        }
      }
      setTerrainVersion((version) => version + 1)
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

    for (let index = 0; index < chunkStateRef.current.length; index += 1) {
      const chunk = chunkStateRef.current[index]
      if (!chunk.dirty) continue
      chunk.dirty = false
    }
  }, 1)

  return (
    <group>
      {chunkSlots.map((chunk, index) => (
        <RigidBody
          key={`terrain-slot-${index}`}
          type="fixed"
          colliders="trimesh"
          ccd={true}
          position={[chunk.coordX * CHUNK_SIZE, CHUNK_Y_OFFSET, chunk.coordZ * CHUNK_SIZE]}
          ref={(api) => {
            if (api) rigidBodyRefs.current[index] = api
          }}
        >
          <mesh
            ref={(mesh) => {
              if (mesh) meshRefs.current[index] = mesh
            }}
            geometry={chunk.geometry}
            receiveShadow
            userData={{ registerVehicle }}
          >
            <primitive object={terrainMaterial} attach="material" />
          </mesh>
        </RigidBody>
      ))}
    </group>
  )
}
