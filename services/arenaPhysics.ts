import RAPIER from '@dimforge/rapier3d-compat'
import type { ArenaPosition } from './arenaEpisode'
import type { SurfaceSample } from './worldSurface'

export const ROVER_PHYSICS = Object.freeze({
  version: 'rapier-kinematic-terrain-0.19.2.v1',
  // Chassis
  chassisHalfExtents: { x: 0.28, y: 0.12, z: 0.42 },
  // Motion
  maxSpeed: 2.4,
  acceleration: 12.0,
  turnRate: 4.0,
  arrivalDistance: 0.05,
  // Ground query
  groundProbeOffset: 0.32,
  canStandProbeOffset: 0.5,
  groundFollowHeight: 0.32,
  groundFollowRayDistance: 2.0,
})

export type ArenaMotionTarget = { id: string; position: ArenaPosition }
export type ArenaMotionPose = ArenaMotionTarget & { grounded: boolean; rotation: [number, number, number, number] }
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

interface KinematicAgent {
  body: RAPIER.RigidBody
  yaw: number
  speed: number
}

export class ArenaPhysics implements ArenaMotion {
  readonly version = ROVER_PHYSICS.version
  #vertices: Float32Array
  #indices: Uint32Array
  #world: RAPIER.World
  #agents = new Map<string, KinematicAgent>()
  #disposed = false

  constructor(data: { vertices: Float32Array; indices: Uint32Array }) {
    if (data.vertices.length === 0 || data.vertices.length % 3 !== 0 || data.indices.length === 0 || data.indices.length % 3 !== 0 ||
        !data.vertices.every(Number.isFinite) || data.indices.some(index => index >= data.vertices.length / 3)) {
      throw new Error('Invalid physics collider data')
    }
    this.#vertices = data.vertices.slice()
    this.#indices = data.indices.slice()
    this.#world = this.#createWorld()
  }

  #createWorld() {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.createCollider(RAPIER.ColliderDesc.trimesh(this.#vertices, this.#indices))
    world.step()
    return world
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
    const center = { x: position[0], y: position[1] + ROVER_PHYSICS.canStandProbeOffset, z: position[2] }
    const hit = this.#world.intersectionWithShape(center, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(0.3), RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC)
    return hit === null
  }

  #createAgent(spawnPosition: { x: number; y: number; z: number }): KinematicAgent {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z)
    const body = this.#world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      ROVER_PHYSICS.chassisHalfExtents.x,
      ROVER_PHYSICS.chassisHalfExtents.y,
      ROVER_PHYSICS.chassisHalfExtents.z,
    )
    this.#world.createCollider(colliderDesc, body)
    return { body, yaw: 0, speed: 0 }
  }

  reset(agents: readonly ArenaMotionTarget[]) {
    this.#assertActive()
    if (new Set(agents.map(agent => agent.id)).size !== agents.length || agents.some(agent => !agent.position.every(Number.isFinite))) {
      throw new Error('Invalid physics entrant positions')
    }
    this.#world.free()
    this.#agents.clear()
    this.#world = this.#createWorld()
    for (const agent of agents) {
      if (!this.canStand(agent.position)) throw new Error(`Spawn overlaps the world collider: ${agent.id}`)
      const spawn = { x: agent.position[0], y: agent.position[1] + ROVER_PHYSICS.groundFollowHeight, z: agent.position[2] }
      this.#agents.set(agent.id, this.#createAgent(spawn))
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
    for (const target of targets) {
      const agent = this.#agents.get(target.id)!
      const body = agent.body
      const current = body.translation()

      // Desired direction in the XZ plane
      const dx = target.position[0] - current.x
      const dz = target.position[2] - current.z
      const horizontalDistance = Math.hypot(dx, dz)

      // Snap yaw to face the target directly (kinematic body has no inertia)
      if (horizontalDistance > 0.001) {
        agent.yaw = Math.atan2(dx, dz)
      }

      // Set speed: full when far from target, stop when close
      agent.speed = horizontalDistance > ROVER_PHYSICS.arrivalDistance ? ROVER_PHYSICS.maxSpeed : 0

      // Move in the direction the chassis is facing
      const forwardX = Math.sin(agent.yaw)
      const forwardZ = Math.cos(agent.yaw)
      const moveX = forwardX * agent.speed * dtSeconds
      const moveZ = forwardZ * agent.speed * dtSeconds
      const moveDist = Math.hypot(moveX, moveZ)

      // Check for wall collisions along the movement path using a ray cast
      let finalX = current.x + moveX
      let finalZ = current.z + moveZ
      if (moveDist > 0.001) {
        const dirX = moveX / moveDist
        const dirZ = moveZ / moveDist
        // Cast a ray from the chassis center toward the movement direction
        const wallRay = new RAPIER.Ray(
          { x: current.x, y: current.y, z: current.z },
          { x: dirX, y: 0, z: dirZ },
        )
        const wallHit = this.#world.castRay(wallRay, moveDist + ROVER_PHYSICS.chassisHalfExtents.z, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC)
        if (wallHit) {
          const stopDist = Math.max(0, wallHit.timeOfImpact - ROVER_PHYSICS.chassisHalfExtents.z)
          finalX = current.x + dirX * stopDist
          finalZ = current.z + dirZ * stopDist
        }
      }

      // Sample ground height at the new position for terrain following
      const groundRay = new RAPIER.Ray({ x: finalX, y: current.y + 0.5, z: finalZ }, { x: 0, y: -1, z: 0 })
      const groundHit = this.#world.castRayAndGetNormal(groundRay, ROVER_PHYSICS.groundFollowRayDistance, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC)
      const groundY = groundHit ? (current.y + 0.5) - groundHit.timeOfImpact + ROVER_PHYSICS.groundFollowHeight : current.y

      // Compute pitch and roll from the surface normal
      let pitch = 0
      let roll = 0
      if (groundHit) {
        const normal = groundHit.normal
        // Pitch: rotation around X axis (forward tilt)
        pitch = Math.atan2(normal.z, normal.y)
        // Roll: rotation around Z axis (sideways tilt)
        roll = -Math.atan2(normal.x, normal.y)
      }

      // Build the quaternion from yaw, pitch, roll (ZYX order)
      const quat = this.#eulerToQuaternion(pitch, agent.yaw, roll)
      body.setNextKinematicTranslation({ x: finalX, y: groundY, z: finalZ })
      body.setNextKinematicRotation(quat)
    }
    this.#world.step()

    return targets.map(target => {
      const agent = this.#agents.get(target.id)!
      const position = agent.body.translation()
      const rotation = agent.body.rotation()
      // Check if the rover is near the ground
      const grounded = this.#isGrounded(position)
      return {
        id: target.id,
        position: [position.x, position.y - ROVER_PHYSICS.groundFollowHeight, position.z] as ArenaPosition,
        grounded,
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w] as [number, number, number, number],
      }
    })
  }

  #isGrounded(position: { x: number; y: number; z: number }) {
    const ray = new RAPIER.Ray({ x: position.x, y: position.y, z: position.z }, { x: 0, y: -1, z: 0 })
    const hit = this.#world.castRay(ray, ROVER_PHYSICS.groundFollowHeight + 0.1, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC)
    return hit !== null
  }

  #eulerToQuaternion(pitch: number, yaw: number, roll: number): RAPIER.Rotation {
    // ZYX composition: q = qz * qy * qx
    const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5)
    const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5)
    const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5)
    return {
      x: sp * cy * cr - cp * sy * sr,
      y: cp * sy * cr + sp * cy * sr,
      z: cp * cy * sr - sp * sy * cr,
      w: cp * cy * cr + sp * sy * sr,
    }
  }

  recover(id: string, position: ArenaPosition) {
    this.#assertActive()
    const agent = this.#agents.get(id)
    if (!agent || !position.every(Number.isFinite)) throw new Error('Invalid recovery position')
    const spawn = { x: position[0], y: position[1] + ROVER_PHYSICS.groundFollowHeight, z: position[2] }
    agent.body.setTranslation(spawn, true)
    agent.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    agent.yaw = 0
    agent.speed = 0
    this.#world.propagateModifiedBodyPositionsToColliders()
  }

  dispose() {
    if (this.#disposed) return
    this.#disposed = true
    this.#agents.clear()
    this.#world.free()
  }
}
