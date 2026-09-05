import RAPIER from '@dimforge/rapier3d-compat'
import type { ArenaPosition } from './arenaEpisode'
import type { SurfaceSample } from './worldSurface'

export const ROVER_PHYSICS = Object.freeze({
  version: 'rapier-kinematic-0.19.2.v1',
  radius: 0.22,
  offset: 0.015,
  gravityPerStep: 0.08,
  maxSpeed: 2.4,
  maxSlope: Math.PI / 4,
})

export type ArenaMotionTarget = { id: string; position: ArenaPosition }
export type ArenaMotionPose = ArenaMotionTarget & { grounded: boolean }
export interface ArenaMotion {
  readonly version: string
  reset(agents: readonly ArenaMotionTarget[]): void
  step(targets: readonly ArenaMotionTarget[], dtSeconds: number): ArenaMotionPose[]
  recover(id: string, position: ArenaPosition): void
  dispose(): void
}

let initialization: Promise<void> | undefined

export async function initializeArenaPhysics() {
  initialization ??= RAPIER.init().catch(error => {
    initialization = undefined
    throw error
  })
  await initialization
}

export class ArenaPhysics implements ArenaMotion {
  readonly version = ROVER_PHYSICS.version
  #vertices: Float32Array
  #indices: Uint32Array
  #world: RAPIER.World
  #controller: RAPIER.KinematicCharacterController
  #agents = new Map<string, { body: RAPIER.RigidBody; collider: RAPIER.Collider }>()
  #disposed = false

  constructor(data: { vertices: Float32Array; indices: Uint32Array }) {
    if (data.vertices.length === 0 || data.vertices.length % 3 !== 0 || data.indices.length === 0 || data.indices.length % 3 !== 0 ||
        !data.vertices.every(Number.isFinite) || data.indices.some(index => index >= data.vertices.length / 3)) {
      throw new Error('Invalid physics collider data')
    }
    this.#vertices = data.vertices.slice()
    this.#indices = data.indices.slice()
    this.#world = this.#createWorld()
    this.#controller = this.#createController()
  }

  #createWorld() {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.createCollider(RAPIER.ColliderDesc.trimesh(this.#vertices, this.#indices))
    world.step()
    return world
  }

  #createController() {
    const controller = this.#world.createCharacterController(ROVER_PHYSICS.offset)
    controller.setMaxSlopeClimbAngle(ROVER_PHYSICS.maxSlope)
    controller.setMinSlopeSlideAngle(ROVER_PHYSICS.maxSlope)
    controller.enableSnapToGround(0.3)
    controller.disableAutostep()
    return controller
  }

  #assertActive() {
    if (this.#disposed) throw new Error('Arena physics is disposed')
  }

  sample(origin: ArenaPosition, maxDistance = 100): SurfaceSample | null {
    this.#assertActive()
    if (!origin.every(Number.isFinite) || !Number.isFinite(maxDistance) || maxDistance <= 0) throw new Error('Invalid physics surface query')
    const ray = new RAPIER.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: 0, y: -1, z: 0 })
    const hit = this.#world.castRayAndGetNormal(ray, maxDistance, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC)
    if (!hit) return null
    const sign = hit.normal.y < 0 ? -1 : 1
    return {
      point: [origin[0], origin[1] - hit.timeOfImpact, origin[2]],
      normal: [hit.normal.x * sign, hit.normal.y * sign, hit.normal.z * sign],
      distance: hit.timeOfImpact,
    }
  }

  canStand(position: ArenaPosition) {
    this.#assertActive()
    const center = this.#center(position)
    const hit = this.#world.intersectionWithShape(center, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(ROVER_PHYSICS.radius), RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC)
    return hit === null
  }

  #center(position: ArenaPosition) {
    return { x: position[0], y: position[1] + ROVER_PHYSICS.radius + ROVER_PHYSICS.offset, z: position[2] }
  }

  reset(agents: readonly ArenaMotionTarget[]) {
    this.#assertActive()
    if (new Set(agents.map(agent => agent.id)).size !== agents.length || agents.some(agent => !agent.position.every(Number.isFinite))) {
      throw new Error('Invalid physics entrant positions')
    }
    this.#world.free()
    this.#agents.clear()
    this.#world = this.#createWorld()
    this.#controller = this.#createController()
    for (const agent of agents) {
      if (!this.canStand(agent.position)) throw new Error(`Spawn overlaps the world collider: ${agent.id}`)
      const center = this.#center(agent.position)
      const body = this.#world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z))
      const collider = this.#world.createCollider(RAPIER.ColliderDesc.ball(ROVER_PHYSICS.radius), body)
      this.#agents.set(agent.id, { body, collider })
    }
    this.#world.step()
  }

  step(targets: readonly ArenaMotionTarget[], dtSeconds: number): ArenaMotionPose[] {
    this.#assertActive()
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || dtSeconds > 0.1 || targets.length !== this.#agents.size ||
        new Set(targets.map(target => target.id)).size !== targets.length ||
        targets.some(target => !this.#agents.has(target.id) || !target.position.every(Number.isFinite))) {
      throw new Error('Invalid physics step')
    }
    this.#world.timestep = dtSeconds
    const grounded = new Map<string, boolean>()
    for (const target of targets) {
      const { body, collider } = this.#agents.get(target.id)!
      const current = body.translation()
      const desired = this.#center(target.position)
      const distance = Math.hypot(desired.x - current.x, desired.z - current.z)
      const scale = distance > 0 ? Math.min(1, ROVER_PHYSICS.maxSpeed * dtSeconds / distance) : 1
      this.#controller.computeColliderMovement(collider, {
        x: (desired.x - current.x) * scale,
        y: (desired.y - current.y) * scale - ROVER_PHYSICS.gravityPerStep,
        z: (desired.z - current.z) * scale,
      }, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC)
      const movement = this.#controller.computedMovement()
      body.setNextKinematicTranslation({ x: current.x + movement.x, y: current.y + movement.y, z: current.z + movement.z })
      grounded.set(target.id, this.#controller.computedGrounded())
    }
    this.#world.step()
    return targets.map(target => {
      const position = this.#agents.get(target.id)!.body.translation()
      return {
        id: target.id,
        position: [position.x, position.y - ROVER_PHYSICS.radius - ROVER_PHYSICS.offset, position.z] as ArenaPosition,
        grounded: grounded.get(target.id)!,
      }
    })
  }

  recover(id: string, position: ArenaPosition) {
    this.#assertActive()
    const agent = this.#agents.get(id)
    if (!agent || !position.every(Number.isFinite) || !this.canStand(position)) throw new Error('Invalid recovery position')
    const center = this.#center(position)
    agent.body.setTranslation(center, true)
    agent.body.setNextKinematicTranslation(center)
    this.#world.propagateModifiedBodyPositionsToColliders()
  }

  dispose() {
    if (this.#disposed) return
    this.#disposed = true
    this.#agents.clear()
    this.#world.free()
  }
}
