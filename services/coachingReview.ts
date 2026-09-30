import { applyControllerRules } from './arenaControllerRules'
import { isEvaluationScenario } from './arenaScenarios'
import { observeSnapshot, type ArenaAction, type ArenaObservation, type ArenaRecording } from './arenaEpisode'

export interface RecordedCoachContext {
  tick: number
  observation: ArenaObservation
  originalAction: ArenaAction
  alternatives: ArenaAction[]
}

const equalAction = (a: ArenaAction, b: ArenaAction) => JSON.stringify(a) === JSON.stringify(b)

export function recordedCoachContext(recording: ArenaRecording, replayIndex: number): RecordedCoachContext | null {
  if (recording.scenario.split !== 'practice' || isEvaluationScenario(recording.scenario.id)) return null
  const selected = recording.checkpoints[replayIndex]?.state
  if (!selected) return null
  const outcome = selected.agents.find(agent => agent.id === 'champion')?.lastOutcome
  const tick = outcome?.tick ?? selected.tick
  const before = recording.checkpoints.find(frame => frame.state.tick === tick)?.state
  if (!before) return null
  const request = recording.batches.find(batch => batch.tick === tick)?.requests.find(item => item.agentId === 'champion')
  const originalAction = request?.action
  if (!originalAction) return null
  const after = recording.checkpoints.find(frame => frame.state.tick > tick)?.state
  const accepted = after?.agents.find(agent => agent.id === 'champion')?.lastOutcome
  if (!accepted?.accepted || accepted.tick !== tick || !accepted.action || !equalAction(accepted.action, originalAction)) return null
  const observation = observeSnapshot(recording.scenario, before, 'champion', { forceDecision: true })
  const alternatives = observation.availableActions.filter(action =>
    !equalAction(action, originalAction) && equalAction(applyControllerRules(observation, action), action),
  )
  return { tick, observation, originalAction, alternatives }
}

export function draftRecordedCorrection(
  context: RecordedCoachContext,
  preferredAction: ArenaAction,
  episodeId: string,
  id: string,
) {
  if (isEvaluationScenario(episodeId)) throw new Error('Held-out decisions cannot become training examples')
  if (!context.alternatives.some(action => equalAction(action, preferredAction))) {
    throw new Error('Choose a supported alternative from this recorded decision')
  }
  return {
    id,
    sourceEpisodeId: episodeId,
    tick: context.tick,
    observation: structuredClone(context.observation),
    originalAction: structuredClone(context.originalAction),
    preferredAction: structuredClone(preferredAction),
    rationale: `Coach chose ${preferredAction.type === 'move' ? preferredAction.edgeId : preferredAction.type} instead of ${context.originalAction.type === 'move' ? context.originalAction.edgeId : context.originalAction.type} at tick ${context.tick}. This is a preference, not a measured improvement.`,
    approved: false,
    source: 'draft' as const,
    provenance: { kind: 'human' as const },
  }
}
