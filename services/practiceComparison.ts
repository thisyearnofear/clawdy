import { type ArenaAction, type ArenaRecording, type ArenaScenario } from './arenaEpisode'
import { isEvaluationScenario } from './arenaScenarios'
import type { ArenaMotion } from './arenaPhysics'
import { ArenaRunner, type EntrantPolicyOption } from './arenaPolicy'
import type { PolicyCheckpoint } from './policyModel'

export interface PracticeRunEvidence {
  checkpointId: string
  checkpointName: string
  weightsHash: string
  banked: number
  rivalBanked: number
  winner: string | null
  recoveries: number
  recording: ArenaRecording
  decisions: { tick: number; action: ArenaAction; accepted: boolean }[]
}

export interface PracticeComparison {
  scenarioId: string
  worldVersion: string
  controllerVersion: string
  rival: EntrantPolicyOption
  baseline: PracticeRunEvidence
  trained: PracticeRunEvidence
  bankedDelta: number
  firstDivergence: { tick: number; parentAction: ArenaAction; childAction: ArenaAction } | null
}

export async function comparePracticeCheckpoints(
  parent: PolicyCheckpoint,
  child: PolicyCheckpoint,
  scenario: ArenaScenario,
  createMotion: () => ArenaMotion,
  options: { rival: EntrantPolicyOption; controllerVersion: string; signal?: AbortSignal },
): Promise<PracticeComparison> {
  if (scenario.split !== 'practice' || isEvaluationScenario(scenario.id)) {
    throw new Error('Checkpoint comparison requires a practice scenario')
  }
  const frozenScenario = structuredClone(scenario)
  const frozenParent = structuredClone(parent)
  const frozenChild = structuredClone(child)
  const rival = structuredClone(options.rival)
  const controllerVersion = options.controllerVersion
  const signal = options.signal
  const usedMotions = new Set<ArenaMotion>()

  const run = async (checkpoint: PolicyCheckpoint): Promise<PracticeRunEvidence> => {
    signal?.throwIfAborted()
    const motion = createMotion()
    if (usedMotions.has(motion)) throw new Error('Comparison requires isolated motion instances')
    usedMotions.add(motion)
    try {
      if (motion.version !== controllerVersion) throw new Error('Comparison controller does not match the live course')
      const runner = new ArenaRunner(frozenScenario, {
        champion: { strategy: 'learned', checkpoint },
        rival,
      }, motion)
      const decisions: PracticeRunEvidence['decisions'] = []
      runner.setDecisionListener(event => {
        if (event.agentId === 'champion') {
          decisions.push({ tick: event.tick, action: structuredClone(event.action), accepted: event.outcome.accepted })
        }
      })
      while (!runner.finished) {
        signal?.throwIfAborted()
        runner.advanceTicks(Math.min(100, frozenScenario.durationTicks - runner.peek().tick))
        await new Promise<void>(resolve => setTimeout(resolve, 0))
      }
      signal?.throwIfAborted()
      const final = runner.snapshot()
      const champion = final.agents.find(agent => agent.id === 'champion')
      const opponent = final.agents.find(agent => agent.id === 'rival')
      if (!champion || !opponent) throw new Error('Comparison requires champion and rival entrants')
      return {
        checkpointId: checkpoint.id,
        checkpointName: checkpoint.name,
        weightsHash: checkpoint.weightsHash,
        banked: champion.banked,
        rivalBanked: opponent.banked,
        winner: final.winner,
        recoveries: champion.recoveries,
        recording: runner.recording(),
        decisions,
      }
    } finally {
      motion.dispose()
    }
  }

  const baseline = await run(frozenParent)
  const trained = await run(frozenChild)
  const childDecisions = new Map(trained.decisions.map(decision => [decision.tick, decision]))
  let firstDivergence: PracticeComparison['firstDivergence'] = null
  for (const decision of baseline.decisions) {
    const other = childDecisions.get(decision.tick)
    if (!decision.accepted || !other?.accepted) continue
    if (JSON.stringify(decision.action) === JSON.stringify(other.action)) continue
    firstDivergence = { tick: decision.tick, parentAction: decision.action, childAction: other.action }
    break
  }
  return {
    scenarioId: frozenScenario.id,
    worldVersion: frozenScenario.worldVersion,
    controllerVersion,
    rival,
    baseline,
    trained,
    bankedDelta: trained.banked - baseline.banked,
    firstDivergence,
  }
}

export function comparisonFrameAt(recording: ArenaRecording, tick: number) {
  if (!Number.isFinite(tick)) return null
  const bounded = Math.max(0, Math.min(recording.finalTick, tick))
  let state = recording.checkpoints[0]?.state ?? null
  for (const frame of recording.checkpoints) {
    if (frame.state.tick > bounded) break
    state = frame.state
  }
  return state
}

/**
 * The replay frame index nearest the first decision where the two brains
 * differed, or null when they never differed.
 *
 * Both replays seek through this so "Watch the lesson" and "Parent replay"
 * land on the *same tick* — that alignment is what lets the ghost be compared
 * against the live rover frame by frame instead of being two unrelated races.
 * Returns null for an empty recording rather than throwing.
 */
export function divergenceFrameIndex(comparison: PracticeComparison | null): number | null {
  const divergence = comparison?.firstDivergence
  if (!divergence) return null
  const frames = comparison.trained.recording.checkpoints
  if (frames.length === 0) return null
  let best = 0
  let bestDistance = Infinity
  frames.forEach((frame, index) => {
    const distance = Math.abs(frame.state.tick - divergence.tick)
    if (distance < bestDistance) { bestDistance = distance; best = index }
  })
  return best
}
