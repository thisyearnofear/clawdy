'use client'

import { Suspense, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ArenaCourse } from '../../services/arenaCourse'
import { createDecorModel, groundDecor, planArenaDecor, type DecorPropType } from '../../services/arenaDecor'
import { planScatter, placeScatter, type ScatterPropType } from '../../services/arenaScatter'
import { skyThemeForCourse } from '../../services/arenaWorldIntent'
import { ModelBoundary } from './ModelBoundary'

const MODEL_URLS: Record<DecorPropType, string> = {
  generator: '/assets/kenney/space-kit/machine_generator.glb',
  dish: '/assets/kenney/space-kit/satelliteDish.glb',
  barrels: '/assets/kenney/space-kit/barrels.glb',
}

// AI-generated ground scatter, seen from far side of the arena. Several
// models per type so a rock field is not one rock rotated twenty times.
const SCATTER_URLS: Record<ScatterPropType, string[]> = {
  boulder: ['/assets/props/boulder.glb', '/assets/props/spire.glb'],
  scrub: ['/assets/props/scrub.glb'],
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

function ScatterPropsInner({ terrain, course, lite }: { terrain: THREE.Object3D; course: ArenaCourse; lite: boolean }) {
  const boulder = useLoader(GLTFLoader, SCATTER_URLS.boulder[0])
  const spire = useLoader(GLTFLoader, SCATTER_URLS.boulder[1])
  const scrub = useLoader(GLTFLoader, SCATTER_URLS.scrub[0])
  const models: Record<ScatterPropType, THREE.Group[]> = useMemo(() => ({
    boulder: [boulder.scene, spire.scene],
    scrub: [scrub.scene],
  }), [boulder.scene, spire.scene, scrub.scene])
  // Visual only: these never reach the collider, so the playability
  // certificate the world shipped with is untouched by how they are placed.
  const props = useMemo(() => {
    // One prompt cannot cover five palettes, so the generated rock texture is
    // multiplied by the world's own terrain tint. The materials are cloned per
    // instance because the loader caches the source scene across worlds.
    const tint = new THREE.Color(skyThemeForCourse(course).terrainTint)
    const sink = (object: THREE.Object3D) => {
      if (!(object instanceof THREE.Mesh)) return
      const sources = Array.isArray(object.material) ? object.material : [object.material]
      const tinted = sources.map(material => {
        const clone = material.clone()
        if (clone.color instanceof THREE.Color) clone.color.multiply(tint)
        return clone
      })
      // A single-material mesh must stay single-material: three draws an array
      // against geometry groups, and a lone mesh has none to match.
      object.material = Array.isArray(object.material) ? tinted : tinted[0]
    }
    return placeScatter(terrain, planScatter(course, { lite })).map((placed, index) => {
      const pool = models[placed.type]
      const clone = createDecorModel(pool[index % pool.length], { fitToSize: placed.size, castShadow: !lite })
      clone.traverse(sink)
      clone.position.set(placed.x, placed.y - placed.size * 0.06, placed.z)
      clone.rotation.y = placed.yaw
      return clone
    })
  }, [terrain, course, lite, models])
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
        {course.generated ? (
          <Suspense fallback={null}>
            <ScatterPropsInner terrain={terrain} course={course} lite={lite} />
          </Suspense>
        ) : null}
      </Suspense>
    </ModelBoundary>
  )
}
