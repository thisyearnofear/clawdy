import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ROVER_PHYSICS } from '../arenaPhysics'
import { ROVER_REST_LOCAL_Y, restShift } from '../modelGrounding'

describe('rover model grounding', () => {
  it('rests a bounds-centred body on a ground-level pose, through the full transform chain', () => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1)) // centred, so it starts half-buried
    const model = new THREE.Group()
    model.add(body)
    model.scale.setScalar(0.9)
    model.updateMatrixWorld(true)
    model.position.y += restShift(new THREE.Box3().setFromObject(model).min.y, ROVER_REST_LOCAL_Y)
    const bodyGroup = new THREE.Group() // Rover's scaled body group
    bodyGroup.scale.setScalar(1.35)
    bodyGroup.add(model)
    const pose = new THREE.Group() // placed at the ground-level pose
    pose.position.set(2, 3, 4)
    pose.add(bodyGroup)
    pose.updateMatrixWorld(true)
    expect(new THREE.Box3().setFromObject(pose).min.y).toBeCloseTo(3, 6)
  })

  it('ignores a non-finite bounds minimum', () => {
    expect(restShift(Number.NaN, 0)).toBe(0)
  })

  it('keeps the ride height the pose contract subtracts', () => {
    expect(ROVER_PHYSICS.groundFollowHeight).toBe(0.32)
  })
})
