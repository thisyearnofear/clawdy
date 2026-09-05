import { ARENA_RULES, ArenaEpisode, type ArenaRecording } from './arenaEpisode'
import type { ArenaMotion } from './arenaPhysics'

export function replayArenaEpisode(recording: ArenaRecording, motion?: ArenaMotion) {
  if (recording.schemaVersion !== 'arena-recording-v1' || recording.rulesVersion !== ARENA_RULES.version) {
    throw new Error('Incompatible arena recording version')
  }
  if (recording.controllerVersion !== (motion?.version ?? 'route-reference-v2')) throw new Error('Replay requires the matching motion controller')
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
      if (JSON.stringify(episode.snapshot()) !== JSON.stringify(expected)) {
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
