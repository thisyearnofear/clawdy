'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { agentProtocol } from '../../services/AgentProtocol'

export function IntentionVisualizer() {
  useFrame(() => {
    // This component will be populated by active intentions from AgentProtocol
  })

  const sessions = agentProtocol.getSessions()
  const worldState = agentProtocol.getWorldState()

  return (
    <>
      {sessions.map((session) => {
        if (!session.targetAssetId) return null
        
        const vehicle = worldState.vehicles.find((v) => v.id === session.vehicleId)
        const asset = worldState.assets.find((a) => a.id === session.targetAssetId)
        
        if (!vehicle || !asset) return null

        return (
          <Line
            key={`intention-${session.agentId}`}
            points={[
              new THREE.Vector3(...vehicle.position),
              new THREE.Vector3(...asset.position)
            ]}
            color={session.role === 'scout' ? '#38bdf8' : '#fbbf24'}
            lineWidth={2}
            dashed
            dashSize={0.5}
            gapSize={0.5}
            transparent
            opacity={0.6}
          />
        )
      })}
    </>
  )
}
