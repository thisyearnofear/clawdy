import { ARENA_RULES, ArenaEpisode, type ArenaAction, type ArenaObservation, type ArenaScenario } from './arenaEpisode'
import { collectorPolicy } from './arenaPolicy'
import { isEvaluationScenario, rejectEvaluationExamples } from './arenaScenarios'
import { createLearnedPolicy, type PolicyCheckpoint } from './policyModel'
import { trainPolicyCheckpoint, type ArenaTrainingExample, type TrainingOptions } from './policyTrainer'

/**
 * The one shape for bots and teachers: given what the rover can see, choose an action.
 * A teacher is plain code you write; the trainer turns its choices into a normal
 * checkpoint, which then plays under the same rules as every other brain.
 */
export type Teacher = (observation: ArenaObservation) => ArenaAction

export type RivalStrategy = 'safe' | 'greedy' | 'weather' | 'poach'

export interface TeacherCollectOptions {
  /** House bots the teacher is shown playing against. Defaults to `safe` and `weather`. */
  rivals?: readonly RivalStrategy[]
  /** Keep `wait` decisions as examples. Off by default: the executor already waits in transit. */
  keepWaits?: boolean
  /** Prefix for example ids; defaults to `teacher`. */
  label?: string
}

export interface TeacherCollection {
  examples: ArenaTrainingExample[]
  /** Decisions where the teacher named an action that was not legal at that moment. */
  illegalChoices: number
  /** Decisions the teacher threw on. The first error is kept for the report. */
  failures: { count: number; firstMessage: string | null }
  /** Champion banked in each practice rollout, keyed `scenarioId vs rival`. */
  banked: Record<string, number>
}

function sameAction(left: ArenaAction, right: ArenaAction): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function describe(action: ArenaAction): string {
  return action.type === 'move' ? `move along ${action.edgeId}` : action.type
}

/**
 * Runs `teacher` as the champion on practice scenarios only and records each decision as an
 * approved example. Held-out scenarios are refused, so a teacher can never train on the
 * boards that score it. Nothing here touches a scored or ladder match.
 */
export function collectTeacherExamples(teacher: Teacher, scenarios: readonly ArenaScenario[], baseline: PolicyCheckpoint, options: TeacherCollectOptions = {}): TeacherCollection {
  const leak = scenarios.find(scenario => isEvaluationScenario(scenario.id))
  if (leak) throw new Error(`Teachers train on practice scenarios only; "${leak.id}" is held out.`)

  const rivals = options.rivals ?? ['safe', 'weather']
  const label = options.label ?? 'teacher'
  const baselinePolicy = createLearnedPolicy(baseline)
  const examples: ArenaTrainingExample[] = []
  const banked: Record<string, number> = {}
  let illegalChoices = 0
  let failureCount = 0
  let firstMessage: string | null = null

  for (const scenario of scenarios) {
    for (const rival of rivals) {
      const sim = new ArenaEpisode(scenario)
      let local = 0
      while (!sim.finished) {
        const tick = sim.tick
        if (tick % ARENA_RULES.decisionEveryTicks !== 0) {
          sim.step([])
          continue
        }
        const observation = sim.observe('champion')
        let action: ArenaAction = { type: 'wait' }
        try {
          action = teacher(structuredClone(observation))
        } catch (error) {
          failureCount += 1
          firstMessage ??= error instanceof Error ? error.message : String(error)
        }
        const legal = observation.availableActions.some(candidate => sameAction(candidate, action))
        if (!legal) {
          if (observation.availableActions.length > 0) illegalChoices += 1
          action = { type: 'wait' }
        } else if (action.type !== 'wait' || options.keepWaits) {
          examples.push({
            id: `ex-${label}-${scenario.id}-${rival}-${tick}-${local.toString(36)}`,
            sourceEpisodeId: scenario.id,
            tick,
            observation,
            originalAction: baselinePolicy(observation),
            preferredAction: action,
            rationale: `Teacher chose to ${describe(action)}.`,
            approved: true,
            source: 'approved',
          })
          local += 1
        }
        sim.step([
          { agentId: 'champion', tick, action },
          { agentId: 'rival', tick, action: collectorPolicy(sim.observe('rival'), rival) },
        ])
      }
      banked[`${scenario.id} vs ${rival}`] = sim.snapshot().agents.find(agent => agent.id === 'champion')?.banked ?? 0
    }
  }

  rejectEvaluationExamples(examples)
  return { examples, illegalChoices, failures: { count: failureCount, firstMessage }, banked }
}

export interface DistillTeacherResult extends TeacherCollection {
  checkpoint: PolicyCheckpoint
}

/** Collects from practice scenarios, then trains a normal checkpoint from `baseline`. */
export function distillTeacher(teacher: Teacher, scenarios: readonly ArenaScenario[], baseline: PolicyCheckpoint, options: TeacherCollectOptions & { training?: TrainingOptions; name?: string } = {}): DistillTeacherResult {
  const collection = collectTeacherExamples(teacher, scenarios, baseline, options)
  if (collection.examples.length === 0) {
    throw new Error(collection.failures.firstMessage
      ? `The teacher threw on every decision: ${collection.failures.firstMessage}`
      : 'The teacher produced no usable examples (every choice was a wait or illegal).')
  }
  const checkpoint = trainPolicyCheckpoint(baseline, collection.examples, {
    epochs: 300,
    learningRate: 0.01,
    momentum: 0.9,
    name: options.name ?? 'Code-taught brain',
    ...options.training,
  })
  return { ...collection, checkpoint }
}
