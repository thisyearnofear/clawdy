'use client'

import { useMemo, useRef } from 'react'
import { RigidBody, RigidBodyProps, RapierRigidBody, CuboidCollider } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export type FoodType = 
  | 'meatball' 
  | 'golden_meatball' 
  | 'spicy_pepper' 
  | 'floaty_marshmallow'
  | 'air_bubble'
  | 'burger' | 'donut' | 'icecream' | 'hotdog' | 'pizza' | 'sushi' | 'taco' | 'apple' | 'broccoli' | 'soda' | 'rotten_burger'

export interface FoodStats {
  type: FoodType
  nutrition: 'healthy' | 'unhealthy' | 'obstacle' | 'powerup'
  mass: number
  isDestroyable: boolean
}

export const FOOD_METADATA: Record<FoodType, Omit<FoodStats, 'type'>> = {
  meatball: { nutrition: 'healthy', mass: 0.8, isDestroyable: true },
  golden_meatball: { nutrition: 'powerup', mass: 1.2, isDestroyable: true },
  spicy_pepper: { nutrition: 'powerup', mass: 0.4, isDestroyable: true },
  floaty_marshmallow: { nutrition: 'powerup', mass: 0.2, isDestroyable: true },
  air_bubble: { nutrition: 'powerup', mass: 0.15, isDestroyable: true },
  apple: { nutrition: 'healthy', mass: 0.5, isDestroyable: true },
  sushi: { nutrition: 'healthy', mass: 0.4, isDestroyable: true },
  broccoli: { nutrition: 'healthy', mass: 0.3, isDestroyable: true },
  burger: { nutrition: 'unhealthy', mass: 1.5, isDestroyable: true },
  pizza: { nutrition: 'unhealthy', mass: 1.2, isDestroyable: true },
  donut: { nutrition: 'unhealthy', mass: 1.0, isDestroyable: true },
  hotdog: { nutrition: 'unhealthy', mass: 1.1, isDestroyable: true },
  taco: { nutrition: 'unhealthy', mass: 1.3, isDestroyable: true },
  icecream: { nutrition: 'unhealthy', mass: 0.8, isDestroyable: true },
  soda: { nutrition: 'obstacle', mass: 3.0, isDestroyable: true },
  rotten_burger: { nutrition: 'obstacle', mass: 5.0, isDestroyable: true },
}

export const FOOD_COLORS: Record<FoodType, string> = {
  meatball: '#e67e22',
  golden_meatball: '#f1c40f',
  spicy_pepper: '#ff0000',
  floaty_marshmallow: '#ffffff',
  air_bubble: '#7fd6ff',
  apple: '#e74c3c',
  sushi: '#ff7675',
  broccoli: '#228b22',
  burger: '#e6a15c',
  pizza: '#f1c40f',
  donut: '#ff7675',
  hotdog: '#d63031',
  taco: '#f1c40f',
  icecream: '#ff9ff3',
  soda: '#3498db',
  rotten_burger: '#5d4037',
}

interface ProceduralFoodProps extends RigidBodyProps {
  id: number
  itemType?: FoodType
  onDespawn?: () => void
  onCollect?: (id: number, stats: FoodStats, collectorId?: string) => void
}

export function ProceduralFood({ id, itemType, onDespawn, onCollect, ...props }: ProceduralFoodProps) {
  const rigidBody = useRef<RapierRigidBody>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  const stats = useMemo((): FoodStats => {
    // 10% chance for special powerups, otherwise random standard food
    const specialTypes: FoodType[] = ['golden_meatball', 'spicy_pepper', 'floaty_marshmallow']
    const standardTypes: FoodType[] = ['meatball', 'apple', 'sushi', 'broccoli', 'burger', 'pizza', 'donut', 'hotdog', 'taco', 'icecream']
    
    let type: FoodType
    if (itemType) {
      type = itemType
    } else {
      const rand = (id * 1337) % 100
      if (rand < 10) {
        type = specialTypes[id % specialTypes.length]
      } else {
        type = standardTypes[id % standardTypes.length]
      }
    }
    return { type, ...FOOD_METADATA[type] }
  }, [itemType, id])

  useFrame((state) => {
    if (rigidBody.current) {
      const translation = rigidBody.current.translation()
      if (translation.y < -20 && onDespawn) {
        onDespawn()
      }
      
      // Floating effect for marshmallows
      if (stats.type === 'floaty_marshmallow') {
        rigidBody.current.applyImpulse({ x: 0, y: 0.1, z: 0 }, true)
      }
      if (stats.type === 'air_bubble') {
        rigidBody.current.applyImpulse({ x: 0, y: 0.14, z: 0 }, true)
      }
    }
    
    // Pulsing emissive glow for all collectibles
    if (matRef.current) {
      const t = state.clock.getElapsedTime()
      const pulseSpeed = stats.nutrition === 'powerup' ? 6 : 3
      matRef.current.emissiveIntensity = 0.4 + Math.sin(t * pulseSpeed + id * 0.5) * 0.4
    }
  })

  const renderShape = () => {
    switch (stats.type) {
      case 'spicy_pepper':
        return <coneGeometry args={[0.3, 1, 8]} />
      case 'floaty_marshmallow':
        return <cylinderGeometry args={[0.5, 0.5, 0.4, 16]} />
      case 'air_bubble':
        return <sphereGeometry args={[0.55, 16, 16]} />
      case 'golden_meatball':
      case 'meatball':
      case 'apple':
      case 'broccoli':
      case 'icecream':
        return <sphereGeometry args={[stats.type === 'golden_meatball' ? 0.7 : 0.5, 12, 12]} />
      case 'soda':
      case 'burger':
      case 'rotten_burger':
      case 'donut':
      case 'sushi':
        return <cylinderGeometry args={[0.6, 0.6, 0.8, 12]} />
      case 'pizza':
      case 'taco':
        return <coneGeometry args={[0.7, 0.8, 4]} />
      default:
        return <boxGeometry args={[0.8, 0.8, 0.8]} />
    }
  }

  return (
    <RigidBody
      ref={rigidBody}
      {...props}
      colliders={false}
      mass={stats.mass}
      restitution={0.3}
      friction={0.8}
      linearDamping={0.5}
      angularDamping={0.5}
      ccd={true}
      onIntersectionEnter={(payload) => {
        const other = payload.other.rigidBodyObject
        if (other && other.userData && (other.userData.agentId || other.userData.isPlayer)) {
          if (onCollect) onCollect(id, stats, other.userData.agentId)
        }
      }}
    >
      <group rotation={stats.type === 'spicy_pepper' ? [Math.PI, 0, 0] : [0, 0, 0]}>
        <mesh castShadow>
          {renderShape()}
          <meshStandardMaterial
            ref={matRef}
            roughness={stats.type === 'air_bubble' ? 0.05 : 0.2}
            metalness={stats.type === 'golden_meatball' ? 0.9 : 0.2}
            color={FOOD_COLORS[stats.type]}
            emissive={FOOD_COLORS[stats.type]}
            emissiveIntensity={0.5}
            transparent={stats.type === 'air_bubble'}
            opacity={stats.type === 'air_bubble' ? 0.35 : 1}
          />
        </mesh>
      </group>
      
      <CuboidCollider args={[0.8, 0.8, 0.8]} sensor />
      <CuboidCollider args={[0.5, 0.5, 0.5]} />
    </RigidBody>
  )
}
