import { useMemo, useRef, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { createNoise2D } from 'simplex-noise'
import { RigidBody } from '@react-three/rapier'

export function Terrain() {
  const mesh = useRef<THREE.Mesh>(null)
  
  // Generate heightmap data once
  const { geometry, colors } = useMemo(() => {
    const noise2D = createNoise2D()
    const size = 100
    const segments = 60 // Low poly look needs fewer segments
    const geom = new THREE.PlaneGeometry(size, size, segments, segments)
    
    const colors = []
    const count = geom.attributes.position.count
    
    for (let i = 0; i < count; i++) {
      const x = geom.attributes.position.getX(i)
      const y = geom.attributes.position.getY(i) // Actually Z in plane geometry before rotation
      
      // Multi-layer noise for more natural look
      let noise = noise2D(x * 0.03, y * 0.03) * 4
      noise += noise2D(x * 0.1, y * 0.1) * 1
      noise += noise2D(x * 0.5, y * 0.5) * 0.2
      
      // Make center flatter for gameplay
      const dist = Math.sqrt(x * x + y * y)
      const flatFactor = Math.max(0, 1 - Math.min(1, dist / 20))
      noise = noise * (1 - flatFactor)
      
      geom.attributes.position.setZ(i, noise) // Set Z because plane is upright initially
      
      // Color based on height
      // Deep water / sand / grass / rock / snow
      if (noise < -2) colors.push(0.1, 0.3, 0.8) // Water
      else if (noise < -0.5) colors.push(0.9, 0.8, 0.6) // Sand
      else if (noise < 2) colors.push(0.2, 0.6, 0.2) // Grass
      else if (noise < 5) colors.push(0.5, 0.5, 0.5) // Rock
      else colors.push(1, 1, 1) // Snow
    }
    
    geom.computeVertexNormals()
    return { geometry: geom, colors: new Float32Array(colors) }
  }, [])

  useLayoutEffect(() => {
    if (mesh.current) {
      mesh.current.geometry.setAttribute(
        'color', 
        new THREE.BufferAttribute(colors, 3)
      )
    }
  }, [colors])

  return (
    <RigidBody type="fixed" colliders="trimesh" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
      <mesh 
        ref={mesh} 
        geometry={geometry} 
        receiveShadow
      >
        <meshStandardMaterial 
          vertexColors 
          flatShading 
          roughness={0.8} 
          metalness={0.1} 
        />
      </mesh>
    </RigidBody>
  )
}
