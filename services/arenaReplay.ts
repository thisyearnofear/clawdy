import { ARENA_RULES, ArenaEpisode, type ArenaRecording, type ArenaSnapshot } from './arenaEpisode'
import type { ArenaMotion } from './arenaPhysics'

/**
 * Rotation-equivalent controller pairs. `rapier-kinematic-terrain-0.19.2.v2`
 * rate-limits the committed chassis yaw (v1 snapped it instantly); steering
 * and positions are bit-identical, so v1 recordings replay faithfully under
 * v2 once `agent.rotation` is normalized out of the state comparison.
 * Divergence on any other field is still reported.
 */
const ROTATION_EQUIVALENT_CONTROLLERS: Record<string, readonly string[]> = {
  'rapier-kinematic-terrain-0.19.2.v2': ['rapier-kinematic-terrain-0.19.2.v1'],
  // v4 changes pitch/roll (yaw-relative) and ride-height alignment along the
  // surface normal. Flat XZ/reported Y match v3; rotation (and soft slope XZ)
  // may differ, so v3 recordings replay under v4 with rotation stripped.
  'rapier-kinematic-terrain-0.19.2.v4': ['rapier-kinematic-terrain-0.19.2.v3'],
}

function withoutRotation(state: ArenaSnapshot): ArenaSnapshot {
  return {
    ...state,
    agents: state.agents.map(agent => ({ ...agent, rotation: [0, 0, 0, 1] as [number, number, number, number] })),
  }
}

export function replayArenaEpisode(recording: ArenaRecording, motion?: ArenaMotion) {
  if (recording.schemaVersion !== 'arena-recording-v1') {
    throw new Error(`recording-schema-mismatch (got ${recording.schemaVersion}, want arena-recording-v1)`)
  }
  if (recording.rulesVersion !== ARENA_RULES.version) {
    throw new Error(`rules-mismatch (recording pinned ${recording.rulesVersion}, runtime ${ARENA_RULES.version})`)
  }
  const wantController = motion?.version ?? 'route-reference-v2'
  const rotationEquivalent = (ROTATION_EQUIVALENT_CONTROLLERS[wantController] ?? []).includes(recording.controllerVersion)
  if (recording.controllerVersion !== wantController && !rotationEquivalent) {
    throw new Error(`controller-mismatch (got ${recording.controllerVersion}, want ${wantController})`)
  }
  const stateKey = (state: ArenaSnapshot) => JSON.stringify(rotationEquivalent ? withoutRotation(state) : state)
  const episode = new ArenaEpisode(recording.scenario, motion)
  if (!Number.isSafeInteger(recording.finalTick) || recording.finalTick < 0 || recording.finalTick > recording.scenario.durationTicks) {
    throw new Error('Invalid replay length')
  }
  const checkpointTicks = [0]
  for (let tick = 1; tick <= recording.finalTick; tick++) {
    if (tick % ARENA_RULES.decisionEveryTicks === 0 || tick === recording.finalTick) checkpointTicks.push(tick)
  }
  if (!Array.isArray(recording.checkpoints) || recording.checkpoints.length !== checkpointTicks.length ||
      recording.checkpoints.some((checkpoint, index) => checkpoint?.state?.tick !== checkpointTicks[index])) {
    throw new Error('Missing or out-of-order replay checkpoints')
  }
  if (!Array.isArray(recording.batches) || recording.batches.length > recording.finalTick || recording.batches.some((batch, index) =>
    !Number.isSafeInteger(batch.tick) || batch.tick < 0 || batch.tick >= recording.finalTick ||
    (index > 0 && batch.tick <= recording.batches[index - 1].tick) ||
    !Array.isArray(batch.requests) || batch.requests.length > recording.scenario.entrants.length)) {
    throw new Error('Invalid replay action batches')
  }
  let batchIndex = 0
  let checkpointIndex = 0
  let divergedAt: number | null = null
  for (let tick = 0; tick <= recording.finalTick; tick++) {
    if (checkpointTicks[checkpointIndex] === tick) {
      const expected = recording.checkpoints[checkpointIndex].state
      if (stateKey(episode.snapshot()) !== stateKey(expected)) {
        divergedAt = tick
        break
      }
      checkpointIndex += 1
    }
    if (tick === recording.finalTick) break
    const batch = recording.batches[batchIndex]
    episode.step(batch?.tick === tick ? batch.requests : [])
    if (batch?.tick === tick) batchIndex += 1
  }
  return { divergedAt, checkpointsCompared: checkpointIndex + (divergedAt === null ? 0 : 1), final: episode.snapshot() }
}
