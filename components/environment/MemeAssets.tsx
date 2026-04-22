'use client'

import { useMemo, useRef } from 'react'
import { RigidBody, RigidBodyProps, RapierRigidBody, CuboidCollider } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export type MemeAssetType = 
  | 'meatball' 
  | 'golden_meatball' 
  | 'spicy_pepper' 
  | 'floaty_marshmallow'
  | 'air_bubble'
  | 'foam_board'
  | 'drain_plug'
  | 'burger' | 'donut' | 'icecream' | 'hotdog' | 'pizza' | 'sushi' | 'taco' | 'apple' | 'broccoli' | 'soda' | 'rotten_burger'

export type MemeRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface MemeAssetStats {
  type: MemeAssetType
  rarity: MemeRarity
  effect: 'vitality' | 'speed' | 'gravity' | 'utility' | 'obstacle' | 'powerup'
  mass: number
  isDestroyable: boolean
  ability?: string
}

export const MEME_ASSET_METADATA: Record<MemeAssetType, Omit<MemeAssetStats, 'type'>> = {
  meatball: { rarity: 'common', effect: 'vitality', mass: 0.8, isDestroyable: true },
  golden_meatball: { rarity: 'legendary', effect: 'powerup', mass: 1.2, isDestroyable: true, ability: 'jackpot' },
  spicy_pepper: { rarity: 'rare', effect: 'speed', mass: 0.4, isDestroyable: true, ability: 'speed_boost' },
  floaty_marshmallow: { rarity: 'rare', effect: 'gravity', mass: 0.2, isDestroyable: true, ability: 'anti_gravity' },
  air_bubble: { rarity: 'epic', effect: 'utility', mass: 0.15, isDestroyable: true, ability: 'water_immunity' },
  foam_board: { rarity: 'epic', effect: 'utility', mass: 0.35, isDestroyable: true, ability: 'water_grip' },
  drain_plug: { rarity: 'legendary', effect: 'utility', mass: 0.5, isDestroyable: true, ability: 'flood_drain' },
  apple: { rarity: 'common', effect: 'vitality', mass: 0.5, isDestroyable: true },
  sushi: { rarity: 'common', effect: 'vitality', mass: 0.4, isDestroyable: true },
  broccoli: { rarity: 'common', effect: 'vitality', mass: 0.3, isDestroyable: true },
  burger: { rarity: 'common', effect: 'vitality', mass: 1.5, isDestroyable: true },
  pizza: { rarity: 'common', effect: 'vitality', mass: 1.2, isDestroyable: true },
  donut: { rarity: 'common', effect: 'vitality', mass: 1.0, isDestroyable: true },
  hotdog: { rarity: 'common', effect: 'vitality', mass: 1.1, isDestroyable: true },
  taco: { rarity: 'common', effect: 'vitality', mass: 1.3, isDestroyable: true },
  icecream: { rarity: 'common', effect: 'vitality', mass: 0.8, isDestroyable: true },
  soda: { rarity: 'rare', effect: 'obstacle', mass: 3.0, isDestroyable: true },
  rotten_burger: { rarity: 'rare', effect: 'obstacle', mass: 5.0, isDestroyable: true },
}

export const MEME_ASSET_COLORS: Record<MemeAssetType, string> = {
  meatball: '#e67e22',
  golden_meatball: '#f1c40f',
  spicy_pepper: '#ff0000',
  floaty_marshmallow: '#ffffff',
  air_bubble: '#7fd6ff',
  foam_board: '#eaffff',
  drain_plug: '#ffcc66',
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

interface MemeAssetProps extends RigidBodyProps {
  id: number
  itemType?: MemeAssetType
  onDespawn?: () => void
  onCollect?: (id: number, stats: MemeAssetStats, collectorId?: string) => void
}

export function ProceduralMemeAsset({ id, itemType, onDespawn, onCollect, ...props }: MemeAssetProps) {
  const rigidBody = useRef<RapierRigidBody>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  const stats = useMemo((): MemeAssetStats => {
    const specialTypes: MemeAssetType[] = ['golden_meatball', 'spicy_pepper', 'floaty_marshmallow']
    const standardTypes: MemeAssetType[] = ['meatball', 'apple', 'sushi', 'broccoli', 'burger', 'pizza', 'donut', 'hotdog', 'taco', 'icecream']
    
    let type: MemeAssetType
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
    return { type, ...MEME_ASSET_METADATA[type] }
  }, [itemType, id])

  useFrame((state) => {
    if (rigidBody.current) {
      const translation = rigidBody.current.translation()
      if (translation.y < -20 && onDespawn) onDespawn()
      
      if (stats.type === 'floaty_marshmallow') rigidBody.current.applyImpulse({ x: 0, y: 0.1, z: 0 }, true)
      if (stats.type === 'air_bubble') rigidBody.current.applyImpulse({ x: 0, y: 0.14, z: 0 }, true)
    }
    
    if (matRef.current) {
      const t = state.clock.getElapsedTime()
      const pulseSpeed = stats.rarity !== 'common' ? 6 : 3
      matRef.current.emissiveIntensity = 0.4 + Math.sin(t * pulseSpeed + id * 0.5) * 0.4
    }
  })

  const renderShape = () => {
    switch (stats.type) {
      case 'spicy_pepper': return <coneGeometry args={[0.3, 1, 8]} />
      case 'floaty_marshmallow': return <cylinderGeometry args={[0.5, 0.5, 0.4, 16]} />
      case 'air_bubble': return <sphereGeometry args={[0.55, 16, 16]} />
      case 'foam_board': return <boxGeometry args={[1.2, 0.14, 0.7]} />
      case 'drain_plug': return <cylinderGeometry args={[0.35, 0.35, 0.5, 12]} />
      case 'golden_meatball':
      case 'meatball':
      case 'apple':
      case 'broccoli':
      case 'icecream': return <sphereGeometry args={[stats.type === 'golden_meatball' ? 0.7 : 0.5, 12, 12]} />
      case 'soda':
      case 'burger':
      case 'rotten_burger':
      case 'donut':
      case 'sushi': return <cylinderGeometry args={[0.6, 0.6, 0.8, 12]} />
      case 'pizza':
      case 'taco': return <coneGeometry args={[0.7, 0.8, 4]} />
      default: return <boxGeometry args={[0.8, 0.8, 0.8]} />
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
            color={MEME_ASSET_COLORS[stats.type]}
            emissive={MEME_ASSET_COLORS[stats.type]}
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
