'use client'

import { Suspense, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ArenaCourse } from '../../services/arenaCourse'
import { createDecorModel, groundDecor, planArenaDecor, type DecorPropType } from '../../services/arenaDecor'
import { ModelBoundary } from './ModelBoundary'

const MODEL_URLS: Record<DecorPropType, string> = {
  generator: '/assets/kenney/space-kit/machine_generator.glb',
  dish: '/assets/kenney/space-kit/satelliteDish.glb',
  barrels: '/assets/kenney/space-kit/barrels.glb',
}

function ArenaPropsInner({ terrain, course, lite, density }: { terrain: THREE.Group; course: ArenaCourse; lite: boolean; density?: number }) {
  const generator = useLoader(GLTFLoader, MODEL_URLS.generator)
  const dish = useLoader(GLTFLoader, MODEL_URLS.dish)
  const barrels = useLoader(GLTFLoader, MODEL_URLS.barrels)
  const models: Record<DecorPropType, THREE.Group> = useMemo(() => ({
    generator: generator.scene,
    dish: dish.scene,
    barrels: barrels.scene,
  }), [generator.scene, dish.scene, barrels.scene])
  const props = useMemo(() => {
    const candidates = planArenaDecor(course, lite)
    // Generated worlds scale the scatter by the spec's rockDensity (0–1);
    // undefined keeps the full authored scatter.
    const visible = density === undefined ? candidates : candidates.slice(0, Math.round(candidates.length * density))
    return groundDecor(terrain, visible).map(placed => {
      const clone = createDecorModel(models[placed.type])
      clone.position.set(placed.x, placed.y, placed.z)
      clone.rotation.y = placed.yaw
      clone.scale.setScalar(placed.scale)
      return clone
    })
  }, [terrain, course, lite, density, models])
  return (
    <group>
      {props.map((object, index) => <primitive key={index} object={object} />)}
    </group>
  )
}

export function ArenaProps({ terrain, course, lite, density }: { terrain: THREE.Group; course: ArenaCourse; lite: boolean; density?: number }) {
  return (
    <ModelBoundary fallback={null}>
      <Suspense fallback={null}>
        <ArenaPropsInner terrain={terrain} course={course} lite={lite} density={density} />
      </Suspense>
    </ModelBoundary>
  )
}
