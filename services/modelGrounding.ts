/**
 * Rover poses are ground-level: the motion controller subtracts
 * ROVER_PHYSICS.groundFollowHeight before returning a position
 * (arenaPhysics.ts, `step`), and the renderer draws at that pose unchanged.
 * Generated bodies are centred on their bounds, so each is lifted until its
 * lowest point rests on the pose, i.e. at local y = 0.
 */
export const ROVER_REST_LOCAL_Y = 0

/** Shift that puts a model whose lowest point is `minY` at `restY`. */
export function restShift(minY: number, restY: number): number {
  return Number.isFinite(minY) ? restY - minY : 0
}
