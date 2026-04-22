'use client'

import { useRef, useMemo, forwardRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { agentProtocol } from '../../services/AgentProtocol'
import * as THREE from 'three'
import { getAgentProfile, getAgentVehicleId } from '../../services/agents'

const VisionLine = forwardRef<THREE.Mesh, { agentColor: string }>(({ agentColor }, ref) => {
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  // Animate the beam pulse
  useFrame((state) => {
    if (!matRef.current) return
    const t = state.clock.getElapsedTime()
    matRef.current.emissiveIntensity = 1.5 + Math.sin(t * 6) * 1.0
    matRef.current.opacity = 0.4 + Math.sin(t * 6) * 0.2
  })

  return (
    <mesh ref={ref} visible={false}>
      <cylinderGeometry args={[0.06, 0.03, 1, 8]} />
      <meshStandardMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        emissive={agentColor}
        emissiveIntensity={2.0}
        color={agentColor}
        opacity={0.6}
      />
    </mesh>
  )
})

VisionLine.displayName = 'VisionLine'

export function AgentVision() {
  const lineRefs = useRef<(THREE.Mesh | null)[]>([])
  const agentSessions = useMemo(() => agentProtocol.getSessions().filter(s => s.agentId !== 'Player'), [])

  useFrame(() => {
    const sessions = agentProtocol.getSessions()
    const worldState = agentProtocol.getWorldState()

    agentSessions.forEach((session) => {
      const idx = sessions.findIndex(s => s.agentId === session.agentId)
      const mesh = lineRefs.current[idx] // Match by actual session index if possible, or just use agent index
      
      if (!mesh || idx === -1 || !session.targetAssetId) {
        if (mesh) mesh.visible = false
        return
      }

      const agentVehicleId = getAgentVehicleId(session.agentId)
      const vehicle = worldState.vehicles.find(v => v.id === agentVehicleId)
      const asset = worldState.assets.find(f => f.id === session.targetAssetId)

      if (vehicle && asset) {
        mesh.visible = true
        
        const start = new THREE.Vector3(...vehicle.position)
        const end = new THREE.Vector3(...asset.position)
        const direction = new THREE.Vector3().subVectors(end, start)
        const len = direction.length()
        
        // Position at midpoint
        mesh.position.copy(start).add(direction.clone().multiplyScalar(0.5))
        
        // Scale to length
        mesh.scale.set(1, len, 1)
        
        // Orient towards target
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
      } else {
        mesh.visible = false
      }
    })
  })

  return (
    <group>
      {agentSessions.map((session, i) => (
        <VisionLine 
          key={session.agentId} 
          agentColor={getAgentProfile(session.agentId)?.accentColor || '#7dd3fc'}
          ref={el => { lineRefs.current[i] = el }} 
        />
      ))}
    </group>
  )
}
