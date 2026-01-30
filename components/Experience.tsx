'use client'

import { useState, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { 
  PerspectiveCamera, 
  OrbitControls, 
  Environment, 
  Sky, 
  ContactShadows,
  Text
} from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { ProceduralFood } from './ProceduralFood'
import { CloudManager, CloudConfig } from './CloudManager'
import { Terrain } from './Terrain'

export default function Experience({ cloudConfig, spawnRate = 2 }: { cloudConfig: CloudConfig; spawnRate?: number }) {
  const [foodItems, setFoodItems] = useState<{ id: number; position: [number, number, number] }[]>([])
  const lastSpawnTime = useRef(0)

  const handleDespawn = (id: number) => {
    setFoodItems((prev) => prev.filter((item) => item.id !== id))
  }

  useFrame((state) => {
    const time = state.clock.getElapsedTime()
    const interval = 1 / Math.max(0.1, spawnRate) // Prevent division by zero, allow low rates
    
    if (time - lastSpawnTime.current > interval) {
      const newFood = {
        id: Date.now(),
        position: [
          (Math.random() - 0.5) * cloudConfig.bounds[0], // Spawn within cloud bounds X
          15,
          (Math.random() - 0.5) * cloudConfig.bounds[2]  // Spawn within cloud bounds Z
        ] as [number, number, number]
      }
      setFoodItems((prev) => [...prev, newFood])
      lastSpawnTime.current = time
    }
  })

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 10, 25]} />
      <OrbitControls makeDefault />
      
      <Sky sunPosition={[100, 20, 100]} />
      <Environment preset="city" />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />

      <Physics gravity={[0, -9.81, 0]}>
        
        <CloudManager config={cloudConfig} />

        {foodItems.map((item) => (
          <ProceduralFood 
            key={item.id} 
            position={item.position} 
            onDespawn={() => handleDespawn(item.id)}
          />
        ))}

        <Terrain />
      </Physics>

      <ContactShadows opacity={0.4} scale={50} blur={1} far={20} resolution={256} color="#000000" />

      <Text
        position={[0, 1, -10]}
        fontSize={2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        CLAW-DY
      </Text>
    </>
  )
}