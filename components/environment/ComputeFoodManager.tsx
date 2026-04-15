import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const MAX_FOOD_COUNT = 1000 // Support 1000 falling items

export function ComputeFoodManager({ 
  spawnRate = 2, 
  bounds = [20, 5, 20] 
}: { 
  spawnRate?: number, 
  bounds?: [number, number, number] 
}) {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null)
  const lastSpawnTime = useRef(0)
  const spawnIdx = useRef(0)

  // Mutable buffers as refs - won't trigger react-hooks warnings
  const positionBufferRef = useRef<THREE.InstancedBufferAttribute | null>(null)
  const velocityBufferRef = useRef<THREE.InstancedBufferAttribute | null>(null)
  const isInitialized = useRef(false)

  // Simple material for rendering
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f1c40f',
    roughness: 0.3,
    metalness: 0.1
  }), [])

  // Initialize buffers once on mount using useEffect
  useEffect(() => {
    positionBufferRef.current = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOD_COUNT * 4), 4)
    velocityBufferRef.current = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOD_COUNT * 4), 4)
    isInitialized.current = true
  }, [])

  // Spawn Logic (CPU-based for compatibility)
  useFrame((state) => {
    if (!isInitialized.current || !positionBufferRef.current || !velocityBufferRef.current) return
    
    const time = state.clock.getElapsedTime()
    const interval = 1 / spawnRate
    
    if (time - lastSpawnTime.current > interval) {
      const i = spawnIdx.current % MAX_FOOD_COUNT
      
      // Update position buffer
      const px = (Math.random() - 0.5) * bounds[0]
      const py = 20 // Fall from height
      const pz = (Math.random() - 0.5) * bounds[2]
      
      positionBufferRef.current.setXYZW(i, px, py, pz, 1.0) // 1.0 = Active
      velocityBufferRef.current.setXYZW(i, 0, -2, 0, 0)
      
      positionBufferRef.current.needsUpdate = true
      velocityBufferRef.current.needsUpdate = true
      
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
