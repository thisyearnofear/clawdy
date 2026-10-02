'use client'

import * as THREE from 'three'

/**
 * Procedural rover silhouettes, shared by the live entrants and the practice
 * comparison ghost.
 *
 * These live apart from `ArenaWorldView` because that module imports
 * `PracticeGhost`; putting them here lets the ghost draw an actual vehicle
 * without a circular import. Both take the same props, so the live rover and
 * the ghost are guaranteed to be the same shape — which is the point: the
 * comparison has to read as "the same rover, different brain".
 */

export interface RoverGeometryProps {
  color: string
  /**
   * Wheel meshes are animated in the live rover's frame loop. Optional so the
   * ghost can skip the ref plumbing entirely.
   */
  wheelRefs?: React.RefObject<THREE.Mesh[]>
}

/** Champion silhouette: a low cab with a mast, four wheels. */
export function RoverGeometry({ color, wheelRefs }: RoverGeometryProps) {
  return (
    <>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.34, 0.14, 0.45]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.32, -0.04]} castShadow>
        <boxGeometry args={[0.24, 0.12, 0.24]} />
        <meshStandardMaterial color="#17292d" roughness={0.2} metalness={0.6} />
      </mesh>
      {[-1, 1].flatMap((x, xi) => [-1, 1].map((z, zi) => {
        const index = xi * 2 + zi
        return (
          <mesh
            key={`${x}-${z}`}
            ref={(mesh) => { if (mesh && wheelRefs?.current) wheelRefs.current[index] = mesh }}
            position={[x * 0.18, 0.105, z * 0.15]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.1, 0.1, 0.075, 12]} />
            <meshStandardMaterial color="#172124" roughness={0.8} />
          </mesh>
        )
      }))}
      <mesh position={[0, 0.23, 0.23]}>
        <boxGeometry args={[0.22, 0.035, 0.015]} />
        <meshBasicMaterial color="#f8f5d9" />
      </mesh>
      <mesh position={[0, 0.48, -0.1]}>
        <cylinderGeometry args={[0.012, 0.012, 0.24, 6]} />
        <meshStandardMaterial color="#243a3b" />
      </mesh>
      <mesh position={[0, 0.62, -0.1]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.34, 0.39, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
      </mesh>
    </>
  )
}

/**
 * Rival silhouette: a low, wide tracked cargo hauler. Intentionally different
 * from the champion's cab + 4-wheel layout so a side-by-side comparison reads
 * as "two distinct vehicles" rather than "two tinted copies of one GLB".
 */
export function RivalRoverGeometry({ color, wheelRefs }: RoverGeometryProps) {
  return (
    <>
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.4, 0.18, 0.5]} />
        <meshStandardMaterial color="#38424d" roughness={0.55} metalness={0.45} />
      </mesh>
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * 0.27, 0.13, 0]} castShadow>
          <boxGeometry args={[0.13, 0.18, 0.52]} />
          <meshStandardMaterial color="#1c2128" roughness={0.75} metalness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 0.36, 0.02]} castShadow>
        <boxGeometry args={[0.36, 0.18, 0.38]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.34, 0.24]} castShadow>
        <boxGeometry args={[0.28, 0.14, 0.05]} />
        <meshStandardMaterial color="#6bc8ff" emissive="#1f5b8a" emissiveIntensity={0.4} roughness={0.2} metalness={0.6} />
      </mesh>
      {[-1, 1].flatMap((x, xi) => [-1, 1].map((z, zi) => {
        const index = xi * 2 + zi
        return (
          <mesh
            key={`${x}-${z}`}
            ref={(mesh) => { if (mesh && wheelRefs?.current) wheelRefs.current[index] = mesh }}
            position={[x * 0.34, 0.13, z * 0.21]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.11, 0.11, 0.1, 12]} />
            <meshStandardMaterial color="#0e1218" roughness={0.85} metalness={0.3} />
          </mesh>
        )
      }))}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.2, 0.08, 0.2]} />
        <meshStandardMaterial color="#7b5526" roughness={0.8} />
      </mesh>
      {[-1, 1].map(side => (
        <mesh key={`light-${side}`} position={[side * 0.1, 0.6, 0.16]}>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshBasicMaterial color="#ffb14d" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.36, 0.42, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </>
  )
}