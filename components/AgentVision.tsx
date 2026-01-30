'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { agentProtocol } from '../services/AgentProtocol'
import * as THREE from 'three'

export function AgentVision() {
  const lineRefs = useRef<any[]>([])
  
  // We'll update the lines in useFrame to avoid React state overhead for per-frame physics tracking
  useFrame(() => {
    const sessions = agentProtocol.getSessions()
    const worldState = agentProtocol.getWorldState()

    sessions.forEach((session, idx) => {
      if (session.agentId === 'Player' || !session.targetFoodId) {
        if (lineRefs.current[idx]) lineRefs.current[idx].visible = false
        return
      }

      const agentVehicleId = session.agentId === 'Agent-Zero' ? 'agent-1' : 'agent-2'
      const vehicle = worldState.vehicles.find(v => v.id === agentVehicleId)
      const food = worldState.food.find(f => f.id === session.targetFoodId)

      if (vehicle && food && lineRefs.current[idx]) {
        lineRefs.current[idx].visible = true
        lineRefs.current[idx].setPoints([
          new THREE.Vector3(...vehicle.position),
          new THREE.Vector3(...food.position)
        ])
      } else if (lineRefs.current[idx]) {
        lineRefs.current[idx].visible = false
      }
    })
  })

  const agentSessions = useMemo(() => agentProtocol.getSessions().filter(s => s.agentId !== 'Player'), [])

  return (
    <group>
      {agentSessions.map((session, i) => (
        <Line
          key={session.agentId}
          ref={el => { lineRefs.current[i] = el }}
          points={[[0, 0, 0], [0, 0, 0]]} // Placeholder
          color={session.agentId === 'Agent-Zero' ? '#00d2ff' : '#a29bfe'}
          lineWidth={2}
          transparent
          opacity={0.5}
        />
      ))}
    </group>
  )
}
