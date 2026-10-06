/**
 * VisionRing — makes extended vision visible.
 *
 * A rover with a vision perk (the Skirmish Scout's two hops) gets a faint
 * pulsing ring on every node it can see beyond the one it stands on, so the
 * wider view reads without a tooltip. The set comes from the sim's own
 * `visibleNodeSet` via `visionNodes`, so the ring cannot disagree with what the
 * rover actually observes. Rovers on the default one-hop view draw nothing.
 * Purely cosmetic: it only reads the live episode.
 */
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import type { ArenaScenario } from '../../services/arenaEpisode'
import type { ArenaSession } from '../../services/arenaSession'
import { visionNodes } from '../../services/ruleLegibility'

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function VisionRing({ session, scenario, id, tint }: { session: ArenaSession; scenario: ArenaScenario; id: string; tint: string }) {
  const [nodeIds, setNodeIds] = useState<string[]>([])
  const lastKey = useRef('')
  const group = useRef<THREE.Group>(null)

  useFrame(state => {
    const agent = session.liveEpisode().agents.find(candidate => candidate.id === id)
    // The visible set only changes when the rover reaches a new node.
    const key = agent ? `${agent.nodeId}:${agent.traits?.visionHops ?? 1}` : ''
    if (key !== lastKey.current) {
      lastKey.current = key
      const next = agent ? visionNodes(scenario, agent) : []
      setNodeIds(prev => (sameList(prev, next) ? prev : next))
    }
    // A slow pulse so the ring reads as a sense, not a fixed marking.
    const opacity = 0.24 + 0.1 * Math.sin(state.clock.elapsedTime * 2.2)
    group.current?.children.forEach(child => {
      const mesh = child as THREE.Mesh
      if (mesh.material instanceof THREE.MeshBasicMaterial) mesh.material.opacity = opacity
    })
  })

  if (nodeIds.length === 0) return null
  return (
    <group ref={group}>
      {nodeIds.map(nodeId => {
        const node = scenario.nodes.find(candidate => candidate.id === nodeId)
        if (!node) return null
        return (
          <mesh key={nodeId} position={[node.position[0], node.position[1] + 0.06, node.position[2]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
            <ringGeometry args={[0.46, 0.58, 32]} />
            <meshBasicMaterial color={tint} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )
      })}
    </group>
  )
}
