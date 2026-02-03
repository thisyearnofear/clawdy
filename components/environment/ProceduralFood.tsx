'use client'

import { useMemo, useRef, useEffect } from 'react'
import { RigidBody, RigidBodyProps, RapierRigidBody, CuboidCollider } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'

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

function Burger() {
  return (
    <group scale={0.5}>
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[1, 1, 0.4, 16]} />
        <meshStandardMaterial color="#e6a15c" />
      </mesh>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[1.1, 1.1, 0.1, 16]} />
        <meshStandardMaterial color="#4cd137" />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.3, 16]} />
        <meshStandardMaterial color="#59320e" />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.5, 0.1, 1.5]} />
        <meshStandardMaterial color="#fbc531" />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[1, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e6a15c" />
      </mesh>
    </group>
  )
}

function Donut() {
  const sprinkleRotations = useMemo(() => {
    const rand = seededRandom(1337)
    return Array.from({ length: 8 }, () => [
      rand() * Math.PI * 2,
      rand() * Math.PI * 2,
      0
    ] as [number, number, number])
  }, [])

  return (
    <group scale={0.6}>
      <mesh>
        <torusGeometry args={[1, 0.5, 16, 32]} />
        <meshStandardMaterial color="#e17055" />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1, 0.55, 16, 32, Math.PI * 2]} />
        <meshStandardMaterial color="#ff7675" />
      </mesh>
      {[...Array(8)].map((_, i) => (
        <mesh
          key={i}
          position={[Math.cos(i) * 1, 0.5, Math.sin(i) * 1]}
          rotation={sprinkleRotations[i]}
        >
          <capsuleGeometry args={[0.05, 0.2, 4, 8]} />
          <meshStandardMaterial color={['#ffeaa7', '#55efc4', '#74b9ff'][i % 3]} />
        </mesh>
      ))}
    </group>
  )
}

function IceCream() {
  return (
    <group scale={0.6} position={[0, -0.5, 0]}>
      <mesh position={[0, 0, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.6, 2, 16]} />
        <meshStandardMaterial color="#fdcb6e" />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshStandardMaterial color="#ff9ff3" />
      </mesh>
    </group>
  )
}

function HotDog() {
  return (
    <group scale={0.5}>
      <mesh>
        <capsuleGeometry args={[0.6, 2, 4, 16]} />
        <meshStandardMaterial color="#e6a15c" />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <capsuleGeometry args={[0.25, 2.2, 4, 16]} />
        <meshStandardMaterial color="#d63031" />
      </mesh>
      <mesh position={[0, 0.45, 0]} rotation={[0, 0, Math.PI / 2]}>
         <capsuleGeometry args={[0.05, 2, 4, 8]} />
         <meshStandardMaterial color="#fbc531" />
      </mesh>
    </group>
  )
}

function Pizza() {
  return (
    <group scale={0.6}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1.5, 0.1, 3]} />
        <meshStandardMaterial color="#f1c40f" />
      </mesh>
      <mesh position={[0, 0.1, -0.7]} rotation={[-Math.PI / 2, 0, 0]}>
         <boxGeometry args={[1.6, 0.2, 0.2]} />
         <meshStandardMaterial color="#e67e22" />
      </mesh>
      <mesh position={[0, 0.06, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.05, 8]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
      <mesh position={[0.4, 0.06, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.05, 8]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
    </group>
  )
}

function Sushi() {
  return (
    <group scale={0.5}>
      <mesh>
        <boxGeometry args={[1, 0.6, 1.5]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1, 0.2, 1.6]} />
        <meshStandardMaterial color="#ff7675" />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.05, 0.65, 0.4]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>
    </group>
  )
}

function Taco() {
  return (
    <group scale={0.5}>
      <mesh rotation={[0, 0, Math.PI]}>
        <cylinderGeometry args={[1, 1, 0.1, 16, 1, true, 0, Math.PI]} />
        <meshStandardMaterial color="#f1c40f" side={2} />
      </mesh>
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[1.5, 0.4, 0.6]} />
        <meshStandardMaterial color="#59320e" />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[1.4, 0.2, 0.4]} />
        <meshStandardMaterial color="#2ecc71" />
      </mesh>
    </group>
  )
}

function Apple() {
  return (
    <group scale={0.5}>
      <mesh>
        <sphereGeometry args={[0.8, 12, 12]} />
        <meshStandardMaterial color="#e74c3c" flatShading />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.4, 4]} />
        <meshStandardMaterial color="#5d4037" />
      </mesh>
      <mesh position={[0.2, 0.6, 0]} rotation={[0, 0, -0.5]}>
         <sphereGeometry args={[0.2, 8, 4]} />
         <meshStandardMaterial color="#27ae60" />
      </mesh>
    </group>
  )
}

function Broccoli() {
  return (
    <group scale={0.5}>
      <mesh position={[0, -0.2, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.8, 8]} />
        <meshStandardMaterial color="#556b2f" />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshStandardMaterial color="#228b22" flatShading />
      </mesh>
    </group>
  )
}

function Soda() {
  return (
    <group scale={0.6}>
      <mesh>
        <cylinderGeometry args={[0.5, 0.5, 1.5, 12]} />
        <meshStandardMaterial color="#3498db" />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.55, 0.55, 0.1, 12]} />
        <meshStandardMaterial color="#ecf0f1" />
      </mesh>
    </group>
  )
}

function RottenBurger() {
  return (
    <group scale={0.5} rotation={[0.2, 0, 0]}>
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[1, 1, 0.4, 16]} />
        <meshStandardMaterial color="#5d4037" />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.3, 16]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[1, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#5d4037" />
      </mesh>
    </group>
  )
}

interface ProceduralFoodProps extends RigidBodyProps {
  id: number
  itemType?: FoodType
  onDespawn?: () => void
  onCollect?: (id: number, stats: FoodStats, collectorId?: string) => void
}

export function ProceduralFood({ id, itemType, onDespawn, onCollect, ...props }: ProceduralFoodProps) {
  const rigidBody = useRef<RapierRigidBody>(null)
  const hasLanded = useRef(false)
  
  const stats = useMemo((): FoodStats => {
    const type = itemType || (Object.keys(FOOD_METADATA) as FoodType[])[Math.floor(Math.random() * Object.keys(FOOD_METADATA).length)]
    return { type, ...FOOD_METADATA[type] }
  }, [itemType])

  useFrame(() => {
    if (rigidBody.current) {
      const translation = rigidBody.current.translation()
      
      // Check if fell below world
      if (translation.y < -20 && onDespawn) {
        onDespawn()
      }
      
      // Check if stopped moving (landed)
      const velocity = rigidBody.current.linvel()
      const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2)
      
      if (speed < 0.1 && translation.y < 5 && !hasLanded.current) {
        hasLanded.current = true
        // Optional: could emit event when food lands
      }
    }
  })

  // Get collider size based on food type
  const getColliderSize = () => {
    switch (stats.type) {
      case 'apple':
      case 'sushi':
        return [0.4, 0.4, 0.4]
      case 'burger':
      case 'donut':
        return [0.6, 0.5, 0.6]
      case 'soda':
      case 'rotten_burger':
        return [0.5, 0.8, 0.5]
      default:
        return [0.5, 0.5, 0.5]
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
    >
      <group>
        {stats.type === 'burger' && <Burger />}
        {stats.type === 'donut' && <Donut />}
        {stats.type === 'icecream' && <IceCream />}
        {stats.type === 'hotdog' && <HotDog />}
        {stats.type === 'pizza' && <Pizza />}
        {stats.type === 'sushi' && <Sushi />}
        {stats.type === 'taco' && <Taco />}
        {stats.type === 'apple' && <Apple />}
        {stats.type === 'broccoli' && <Broccoli />}
        {stats.type === 'soda' && <Soda />}
        {stats.type === 'rotten_burger' && <RottenBurger />}
      </group>
      {/* Sensor collider for collection detection */}
      <CuboidCollider args={[0.8, 0.8, 0.8]} sensor />
      {/* Physical collider that actually collides with terrain */}
      <CuboidCollider 
        args={getColliderSize() as [number, number, number]} 
        friction={0.8}
        restitution={0.2}
      />
    </RigidBody>
  )
}
