'use client'

import { useMemo, useRef, useEffect } from 'react'
import { RigidBody, RigidBodyProps, RapierRigidBody, CuboidCollider } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { 
  color, 
  mul, 
  mix, 
  float, 
  timerLocal, 
  sin, 
  add,
  worldPosition,
  positionLocal
} from 'three/tsl'

export type FoodType = 'burger' | 'donut' | 'icecream' | 'hotdog' | 'pizza' | 'sushi' | 'taco' | 'apple' | 'broccoli' | 'soda' | 'rotten_burger'

export interface FoodStats {
  type: FoodType
  nutrition: 'healthy' | 'unhealthy' | 'obstacle'
  mass: number
  isDestroyable: boolean
}

export const FOOD_METADATA: Record<FoodType, Omit<FoodStats, 'type'>> = {
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

const FOOD_COLORS: Record<FoodType, string> = {
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

// TSL Material for Food Items
// Adds a "pulsing freshness" or "decay" effect
const createFoodMaterial = (baseColor: string, nutrition: string) => {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.7,
    metalness: 0.1,
  });

  const time = timerLocal();
  const base = color(baseColor);
  
  // Healthy items pulse with a green glow, unhealthy/obstacles have a subtle jitter or decay
  const pulseScale = nutrition === 'healthy' ? 2.0 : 0.5;
  const pulseColor = nutrition === 'healthy' ? color('#2ecc71') : color('#e67e22');
  
  const pulse = mul(add(sin(mul(time, pulseScale)), 1.0), 0.2);
  
  mat.colorNode = mix(base, pulseColor, pulse);
  
  // Add subtle emissive based on pulse
  mat.emissiveNode = mul(pulseColor, mul(pulse, 0.5));

  return mat;
}

interface ProceduralFoodProps extends RigidBodyProps {
  id: number
  itemType?: FoodType
  onDespawn?: () => void
  onCollect?: (id: number, stats: FoodStats, collectorId?: string) => void
}

export function ProceduralFood({ id, itemType, onDespawn, onCollect, ...props }: ProceduralFoodProps) {
  const rigidBody = useRef<RapierRigidBody>(null)
  
  const stats = useMemo((): FoodStats => {
    const types = Object.keys(FOOD_METADATA) as FoodType[]
    const type = itemType || types[Math.floor(Math.random() * types.length)]
    return { type, ...FOOD_METADATA[type] }
  }, [itemType])

  const material = useMemo(() => 
    createFoodMaterial(FOOD_COLORS[stats.type], stats.nutrition)
  , [stats.type, stats.nutrition])

  useFrame(() => {
    if (rigidBody.current) {
      const translation = rigidBody.current.translation()
      if (translation.y < -20 && onDespawn) {
        onDespawn()
      }
    }
  })

  // Geometry mapping for simplified but performant shapes
  const renderShape = () => {
    switch (stats.type) {
      case 'apple':
      case 'broccoli':
      case 'icecream':
        return <sphereGeometry args={[0.5, 12, 12]} />
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
        // Collision detection for agents or player
        const other = payload.other.rigidBodyObject
        if (other && other.userData && (other.userData.agentId || other.userData.isPlayer)) {
          if (onCollect) onCollect(id, stats, other.userData.agentId)
        }
      }}
    >
      <mesh>
        {renderShape()}
        <primitive object={material} />
      </mesh>
      
      {/* Sensor collider for collection detection */}
      <CuboidCollider args={[0.8, 0.8, 0.8]} sensor />
      {/* Physical collider */}
      <CuboidCollider args={[0.5, 0.5, 0.5]} />
    </RigidBody>
  )
}
