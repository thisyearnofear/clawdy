import { useMemo, useRef } from 'react'
import { RigidBody, RigidBodyProps, RapierRigidBody } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'

export type FoodType = 'burger' | 'donut' | 'icecream' | 'hotdog' | 'pizza' | 'sushi' | 'taco' | 'apple'

interface ProceduralFoodProps extends RigidBodyProps {
  itemType?: FoodType
  onDespawn?: () => void
}

function Burger() {
  return (
    <group scale={0.5}>
      {/* Bottom Bun */}
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[1, 1, 0.4, 16]} />
        <meshStandardMaterial color="#e6a15c" />
      </mesh>
      {/* Lettuce */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[1.1, 1.1, 0.1, 16]} />
        <meshStandardMaterial color="#4cd137" />
      </mesh>
      {/* Meat */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.3, 16]} />
        <meshStandardMaterial color="#59320e" />
      </mesh>
      {/* Cheese */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.5, 0.1, 1.5]} />
        <meshStandardMaterial color="#fbc531" />
      </mesh>
      {/* Top Bun */}
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[1, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e6a15c" />
      </mesh>
    </group>
  )
}

function Donut() {
  return (
    <group scale={0.6}>
      <mesh>
        <torusGeometry args={[1, 0.5, 16, 32]} />
        <meshStandardMaterial color="#e17055" />
      </mesh>
      {/* Glaze */}
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1, 0.55, 16, 32, Math.PI * 2]} />
        <meshStandardMaterial color="#ff7675" />
      </mesh>
      {/* Sprinkles (Simplified) */}
      {[...Array(8)].map((_, i) => (
        <mesh key={i} position={[Math.cos(i) * 1, 0.5, Math.sin(i) * 1]} rotation={[Math.random(), Math.random(), 0]}>
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
      {/* Cone */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.6, 2, 16]} />
        <meshStandardMaterial color="#fdcb6e" />
      </mesh>
      {/* Scoop */}
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
      {/* Bun */}
      <mesh>
        <capsuleGeometry args={[0.6, 2, 4, 16]} />
        <meshStandardMaterial color="#e6a15c" />
      </mesh>
      {/* Sausage */}
      <mesh position={[0, 0.2, 0]}>
        <capsuleGeometry args={[0.25, 2.2, 4, 16]} />
        <meshStandardMaterial color="#d63031" />
      </mesh>
      {/* Mustard */}
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
        <coneGeometry args={[1.5, 0.1, 3]} /> {/* Triangle slice */}
        <meshStandardMaterial color="#f1c40f" />
      </mesh>
      {/* Crust */}
      <mesh position={[0, 0.1, -0.7]} rotation={[-Math.PI / 2, 0, 0]}>
         <boxGeometry args={[1.6, 0.2, 0.2]} />
         <meshStandardMaterial color="#e67e22" />
      </mesh>
      {/* Pepperoni */}
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
      {/* Rice */}
      <mesh>
        <boxGeometry args={[1, 0.6, 1.5]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Salmon */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1, 0.2, 1.6]} />
        <meshStandardMaterial color="#ff7675" />
      </mesh>
      {/* Nori wrap strip */}
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
      {/* Shell */}
      <mesh rotation={[0, 0, Math.PI]}>
        <cylinderGeometry args={[1, 1, 0.1, 16, 1, true, 0, Math.PI]} />
        <meshStandardMaterial color="#f1c40f" side={2} />
      </mesh>
      {/* Meat */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[1.5, 0.4, 0.6]} />
        <meshStandardMaterial color="#59320e" />
      </mesh>
      {/* Lettuce/Tomato */}
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

export function ProceduralFood({ itemType, onDespawn, ...props }: ProceduralFoodProps) {
  const rigidBody = useRef<RapierRigidBody>(null)
  
  const foodType = useMemo(() => {
    if (itemType) return itemType
    const types: FoodType[] = ['burger', 'donut', 'icecream', 'hotdog', 'pizza', 'sushi', 'taco', 'apple']
    return types[Math.floor(Math.random() * types.length)]
  }, [itemType])

  useFrame(() => {
    if (rigidBody.current && onDespawn) {
      const translation = rigidBody.current.translation()
      if (translation.y < -20) {
        onDespawn()
      }
    }
  })

  return (
    <RigidBody
      ref={rigidBody}
      {...props}
      colliders={'cuboid'} // Simplified collision for performance
      restitution={0.4}
      friction={0.7}
    >
      <group>
        {foodType === 'burger' && <Burger />}
        {foodType === 'donut' && <Donut />}
        {foodType === 'icecream' && <IceCream />}
        {foodType === 'hotdog' && <HotDog />}
        {foodType === 'pizza' && <Pizza />}
        {foodType === 'sushi' && <Sushi />}
        {foodType === 'taco' && <Taco />}
        {foodType === 'apple' && <Apple />}
      </group>
    </RigidBody>
  )
}
