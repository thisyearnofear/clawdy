/**
 * Presentation-only Rush event cues. Events are authoritative in the recorded
 * snapshot; this component owns only short-lived, bounded graphics.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ArenaCourse } from '../../services/arenaCourse'
import type { ArenaSimEvent } from '../../services/arenaEpisode'
import type { ArenaSession } from '../../services/arenaSession'
import { liveRushEvents } from '../workbench/experienceMocks'

const MAX_BURSTS = 4
const BURST_SECONDS = 1.3
type Burst = { id: string; kind: ArenaSimEvent['type']; position: [number, number, number]; started: number }

/** Resolve an event using only its recorded facts and the active course. */
export function rushEventPosition(event: ArenaSimEvent, course: Pick<ArenaCourse, 'scenario'>): [number, number, number] | null {
  if (event.type === 'bump') return [...event.position]
  const node = course.scenario.nodes.find(candidate => candidate.id === event.nodeId)
  return node ? [...node.position] : null
}

export function RushEventFX({ session, course }: { session: ArenaSession; course: ArenaCourse }) {
  const group = useRef<THREE.Group>(null)
  const previous = useRef<readonly ArenaSimEvent[] | undefined>(undefined)
  const previousTick = useRef(-1)
  const previousScenario = useRef(course.scenario.id)
  const previousRecording = useRef<unknown>(null)
  const previousPhase = useRef<string | null>(null)
  const bursts = useRef<Burst[]>([])
  const meshes = useRef<(THREE.Mesh | null)[]>([])

  useFrame(state => {
    const root = group.current
    if (!root) return
    const view = session.getSnapshot()
    const snapshot = view.phase === 'running' || view.phase === 'paused' ? session.liveEpisode() : view.episode
    const events = snapshot.events
    const recording = view.phase === 'review' ? session.activeRecording() : null
    const changedTimeline = previousScenario.current !== course.scenario.id ||
      snapshot.tick < previousTick.current || view.phase === 'ready' ||
      (view.phase === 'review' && recording !== previousRecording.current) ||
      (view.phase === 'review' && previousPhase.current !== 'review')
    if (changedTimeline) {
      bursts.current = []
      previous.current = events?.slice()
    } else if (events && previous.current) {
      for (const event of liveRushEvents(previous.current, events, previousTick.current, snapshot.tick)) {
        const position = rushEventPosition(event, course)
        if (!position) continue
        bursts.current = [...bursts.current.slice(-(MAX_BURSTS - 1)), {
          id: `${event.type}:${event.tick}:${event.type === 'bump' ? event.loserId : event.resourceId}`,
          kind: event.type,
          position,
          started: state.clock.elapsedTime,
        }]
      }
    }
    previous.current = events?.slice()
    previousTick.current = snapshot.tick
    previousScenario.current = course.scenario.id
    previousRecording.current = recording
    previousPhase.current = view.phase

    for (let i = 0; i < MAX_BURSTS; i++) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      const burst = bursts.current[i]
      const age = burst ? (state.clock.elapsedTime - burst.started) / BURST_SECONDS : 1
      mesh.visible = age < 1
      if (!burst || age >= 1) continue
      mesh.position.set(burst.position[0], burst.position[1] + 0.15 + age * (burst.kind === 'core_spawn' ? 1.9 : 0.3), burst.position[2])
      mesh.scale.setScalar(burst.kind === 'core_spawn' ? 0.35 + age * 0.8 : 0.25 + age * 1.8)
      const material = mesh.material as THREE.MeshBasicMaterial
      material.color.set(burst.kind === 'core_spawn' ? '#ffc966' : '#9fe4eb')
      material.opacity = (1 - age) * (burst.kind === 'core_spawn' ? 0.85 : 0.7)
    }
  })

  return (
    <group ref={group}>
      {Array.from({ length: MAX_BURSTS }, (_, index) => (
        <mesh key={index} ref={mesh => { meshes.current[index] = mesh }} visible={false} renderOrder={10}>
          <sphereGeometry args={[0.3, 12, 10]} />
          <meshBasicMaterial transparent depthWrite={false} opacity={0} />
        </mesh>
      ))}
    </group>
  )
}
