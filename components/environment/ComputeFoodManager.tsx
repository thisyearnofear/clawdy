'use client'

import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { 
  storage, 
  compute, 
  Fn, 
  float, 
  vec3, 
  instanceIndex,
  assign,
  If,
  timerDelta,
  vec4,
  mix,
  sin,
  timerLocal,
  add,
  mul,
  sub,
  color,
  worldPosition
} from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { FOOD_COLORS, FoodType, FOOD_METADATA } from './ProceduralFood'

const MAX_FOOD_COUNT = 1000 // Support 1000 falling items with zero CPU cost

export function ComputeFoodManager({ 
  spawnRate = 2, 
  bounds = [20, 5, 20] 
}: { 
  spawnRate?: number, 
  bounds?: [number, number, number] 
}) {
  const { gl } = useThree()
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null)
  const lastSpawnTime = useRef(0)
  const spawnIdx = useRef(0)

  // 1. Create Storage Buffers for positions and velocities
  // We'll use vec4 for alignment (x, y, z, isActive/type)
  const positionBuffer = useMemo(() => new THREE.StorageInstancedBufferAttribute(MAX_FOOD_COUNT, 4), [])
  const velocityBuffer = useMemo(() => new THREE.StorageInstancedBufferAttribute(MAX_FOOD_COUNT, 4), [])

  // 2. TSL Nodes for accessing the buffers
  const positionNode = storage(positionBuffer, 'vec4', MAX_FOOD_COUNT)
  const velocityNode = storage(velocityBuffer, 'vec4', MAX_FOOD_COUNT)

  // 3. Compute Shader logic using TSL
  const computeUpdate = useMemo(() => {
    const updateFn = Fn(() => {
      const pos = positionNode.element(instanceIndex)
      const vel = velocityNode.element(instanceIndex)
      const isActive = pos.w // Use .w for active state (1.0 = active, 0.0 = inactive)
      const delta = timerDelta()

      // Only update active items
      If(isActive.greaterThan(0.5), () => {
        // Apply gravity
        assign(vel.y, sub(vel.y, mul(9.81, delta)))
        
        // Update position
        assign(pos.xyz, add(pos.xyz, mul(vel.xyz, delta)))

        // Floor collision
        If(pos.y.lessThan(0.0), () => {
          assign(pos.y, 0.0)
          assign(vel.y, mul(vel.y, -0.3)) // Bounce slightly
          assign(vel.xz, mul(vel.xz, 0.9)) // Friction
        })

        // Bounds cleanup (reset if far away)
        If(pos.y.lessThan(-10.0), () => {
          assign(pos.w, 0.0)
        })
      })
    })

    return compute(updateFn(), MAX_FOOD_COUNT)
  }, [positionNode, velocityNode])

  // 4. Custom Node Material for the InstancedMesh
  const material = useMemo(() => {
    const mat = new MeshStandardNodeMaterial()
    
    // Set position from storage buffer
    const pos = positionNode.element(instanceIndex).xyz
    mat.positionNode = add(positionLocal, pos)

    // Dynamic coloring based on "active" state and pulse
    const time = timerLocal()
    const pulse = mul(add(sin(mul(time, 3.0)), 1.0), 0.2)
    mat.colorNode = mix(color('#f1c40f'), color('#2ecc71'), pulse)
    
    // Fade out if inactive (w = 0)
    mat.opacityNode = positionNode.element(instanceIndex).w
    mat.transparent = true

    return mat
  }, [positionNode])

  // 5. Spawn Logic (CPU -> GPU update)
  useFrame((state) => {
    if (!(gl as any).isWebGPURenderer) return

    // Run compute pass
    (gl as any).compute(computeUpdate)

    // CPU-side spawning
    const time = state.clock.getElapsedTime()
    const interval = 1 / spawnRate
    
    if (time - lastSpawnTime.current > interval) {
      const i = spawnIdx.current % MAX_FOOD_COUNT
      
      // Update position buffer directly on CPU
      // We'll upload it next frame or using setNeedsUpdate
      const px = (Math.random() - 0.5) * bounds[0]
      const py = 20 // Fall from height
      const pz = (Math.random() - 0.5) * bounds[2]
      
      positionBuffer.setXYZW(i, px, py, pz, 1.0) // 1.0 = Active
      velocityBuffer.setXYZW(i, 0, -2, 0, 0)
      
      positionBuffer.needsUpdate = true
      velocityBuffer.needsUpdate = true
      
      spawnIdx.current++
      lastSpawnTime.current = time
    }
  })

  return (
    <instancedMesh 
      ref={instancedMeshRef} 
      args={[undefined, undefined, MAX_FOOD_COUNT]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.5, 12, 12]} />
      <primitive object={material} />
    </instancedMesh>
  )
}
