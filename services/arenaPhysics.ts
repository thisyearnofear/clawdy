import RAPIER from '@dimforge/rapier3d-compat'
import type { ArenaPosition } from './arenaEpisode'
import type { SurfaceSample } from './worldSurface'

export const ROVER_PHYSICS = Object.freeze({
  version: 'rapier-kinematic-terrain-0.19.2.v4',
  // Chassis
  chassisHalfExtents: { x: 0.28, y: 0.12, z: 0.42 },
  // Motion
  maxSpeed: 2.4,
  acceleration: 12.0,
  // Chassis yaw slew (rad/s). v1 snapped yaw to atan2(dx,dz) instantly, which
  // committed ~180° flips whenever the direction to the target whipsawed —
  // terrain-pinned rovers pirouetted and parked rovers overshoot-oscillated.
  // v2 rate-limits the committed/displayed yaw; steering is unchanged.
  turnRate: 4.0,
  // Below this horizontal distance to target, chassis yaw holds its heading.
  yawDeadzone: 0.08,
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
  /** World-space offset from contact point to body center (normal * ride height). */
  rideOffset: { x: number; y: number; z: number }
  /** True when the last step's ground ray hit. */
  grounded: boolean
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
    return { body, yaw: 0, speed: 0, rideOffset: { x: 0, y: ROVER_PHYSICS.groundFollowHeight, z: 0 }, grounded: true }
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

      // Steering direction toward the target. v1 wrote atan2(dx,dz) straight
      // into agent.yaw and moved along sin/cos of it — keeping the identical
      // expression here preserves v1 trajectories bit-for-bit.
      let steerYaw = agent.yaw
      if (horizontalDistance > 0.001) {
        steerYaw = Math.atan2(dx, dz)
      }

      // Committed chassis yaw slews toward the steering heading at turnRate
      // and holds inside the deadzone — pinned or parked rovers no longer
      // commit instant ~180° flips. Rotation is display-facing only and
      // never steers the body, so positions (and every downstream result)
      // are unchanged from v1.
      if (horizontalDistance > ROVER_PHYSICS.yawDeadzone) {
        const delta = Math.atan2(Math.sin(steerYaw - agent.yaw), Math.cos(steerYaw - agent.yaw))
        const maxTurn = ROVER_PHYSICS.turnRate * dtSeconds
        const nextYaw = agent.yaw + Math.max(-maxTurn, Math.min(maxTurn, delta))
        agent.yaw = Math.atan2(Math.sin(nextYaw), Math.cos(nextYaw))
      }

      // Proportional speed: cover at most the remaining distance this step.
      // v2's binary {0, maxSpeed} quanta could not cruise at the episode's
      // target speed (0.09 m/tick < 0.12 max), so every leg was a lurch-stop
      // oscillation with ~half its ticks dead. Landing on the carrot lets
      // the body ride it smoothly — and makes blockedTicks a real
      // obstruction signal instead of an oscillation counter.
      agent.speed = Math.min(ROVER_PHYSICS.maxSpeed, horizontalDistance / dtSeconds)

      // Move toward the target along the steering direction
      const forwardX = Math.sin(steerYaw)
      const forwardZ = Math.cos(steerYaw)
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

      // Sample ground at the new XZ for terrain following. v4 plants the
      // chassis along the surface normal (ride height) and derives pitch/roll
      // in the yaw-local frame so facing-uphill tilts nose-up regardless of
      // compass heading. Flat ground (normal ≈ +Y) keeps the v3 XZ path and
      // reported Y bit-stable.
      const groundRay = new RAPIER.Ray({ x: finalX, y: current.y + 0.5, z: finalZ }, { x: 0, y: -1, z: 0 })
      const groundHit = this.#world.castRayAndGetNormal(groundRay, ROVER_PHYSICS.groundFollowRayDistance, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC)
      let bodyX = finalX
      let bodyY = current.y
      let bodyZ = finalZ
      let quat: RAPIER.Rotation = { x: 0, y: Math.sin(agent.yaw * 0.5), z: 0, w: Math.cos(agent.yaw * 0.5) }
      if (groundHit) {
        let nx = groundHit.normal.x
        let ny = groundHit.normal.y
        let nz = groundHit.normal.z
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz }
        const hitY = (current.y + 0.5) - groundHit.timeOfImpact
        const h = ROVER_PHYSICS.groundFollowHeight
        bodyX = finalX + nx * h
        bodyY = hitY + ny * h
        bodyZ = finalZ + nz * h
        agent.rideOffset = { x: nx * h, y: ny * h, z: nz * h }
        // Yaw-relative plant: keep committed yaw's forward, tilt so body up
        // matches the surface normal (equivalent to yaw-local pitch/roll).
        quat = this.#rotationFromYawAndNormal(agent.yaw, nx, ny, nz)
        agent.grounded = true
      } else {
        agent.rideOffset = { x: 0, y: ROVER_PHYSICS.groundFollowHeight, z: 0 }
        agent.grounded = false
      }

      body.setNextKinematicTranslation({ x: bodyX, y: bodyY, z: bodyZ })
      body.setNextKinematicRotation(quat)
    }
    this.#world.step()

    return targets.map(target => {
      const agent = this.#agents.get(target.id)!
      const position = agent.body.translation()
      const rotation = agent.body.rotation()
      return {
        id: target.id,
        position: [
          position.x - agent.rideOffset.x,
          position.y - agent.rideOffset.y,
          position.z - agent.rideOffset.z,
        ] as ArenaPosition,
        grounded: agent.grounded,
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w] as [number, number, number, number],
      }
    })
  }

  /**
   * Build a chassis rotation whose up axis matches the surface normal while the
   * horizontal facing follows committed yaw. This is yaw-relative pitch/roll:
   * projecting yaw-forward onto the tangent plane, then right = up × forward.
   */
  #rotationFromYawAndNormal(yaw: number, nx: number, ny: number, nz: number): RAPIER.Rotation {
    const yx = Math.sin(yaw), yz = Math.cos(yaw)
    const dot = yx * nx + yz * nz
    let fx = yx - nx * dot
    let fy = -ny * dot
    let fz = yz - nz * dot
    const fl = Math.hypot(fx, fy, fz)
    if (fl < 1e-6) {
      // Yaw-forward parallel to normal — pick a tangent perpendicular to up.
      fx = ny > 0.5 ? 1 : 0
      fy = 0
      fz = ny > 0.5 ? 0 : 1
      const d2 = fx * nx + fz * nz
      fx -= nx * d2
      fy -= ny * d2
      fz -= nz * d2
      const fl2 = Math.hypot(fx, fy, fz) || 1
      fx /= fl2; fy /= fl2; fz /= fl2
    } else {
      fx /= fl; fy /= fl; fz /= fl
    }
    // right = up × forward (Y-up, Z-forward → +X)
    let rx = ny * fz - nz * fy
    let ry = nz * fx - nx * fz
    let rz = nx * fy - ny * fx
    const rl = Math.hypot(rx, ry, rz) || 1
    rx /= rl; ry /= rl; rz /= rl
    // Re-orthogonalize forward = right × up? forward should be right × up for RH:
    // Actually we have up and forward; right = up × forward keeps forward.
    // Rotation matrix columns (Rapier/Three local axes): X=right, Y=up, Z=forward.
    return this.#quatFromAxes(rx, ry, rz, nx, ny, nz, fx, fy, fz)
  }

  #quatFromAxes(
    rx: number, ry: number, rz: number,
    ux: number, uy: number, uz: number,
    fx: number, fy: number, fz: number,
  ): RAPIER.Rotation {
    // Convert rotation matrix (columns = right, up, forward) to quaternion.
    const tr = rx + uy + fz
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2
      return { w: 0.25 * s, x: (uz - fy) / s, y: (fx - rz) / s, z: (ry - ux) / s }
    }
    if (rx > uy && rx > fz) {
      const s = Math.sqrt(1 + rx - uy - fz) * 2
      return { w: (uz - fy) / s, x: 0.25 * s, y: (ry + ux) / s, z: (fx + rz) / s }
    }
    if (uy > fz) {
      const s = Math.sqrt(1 + uy - rx - fz) * 2
      return { w: (fx - rz) / s, x: (ry + ux) / s, y: 0.25 * s, z: (uz + fy) / s }
    }
    const s = Math.sqrt(1 + fz - rx - uy) * 2
    return { w: (ry - ux) / s, x: (fx + rz) / s, y: (uz + fy) / s, z: 0.25 * s }
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
    agent.rideOffset = { x: 0, y: ROVER_PHYSICS.groundFollowHeight, z: 0 }
    agent.grounded = true
    this.#world.propagateModifiedBodyPositionsToColliders()
  }

  dispose() {
    if (this.#disposed) return
    this.#disposed = true
    this.#agents.clear()
    this.#world.free()
  }
}
