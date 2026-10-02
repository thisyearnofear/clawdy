/**
 * Message contract between the browser and the coaching worker
 * (`services/trainingWorker.ts`).
 *
 * Training a checkpoint (60 epochs) and then running two full 1200-tick
 * comparison matches are the two longest CPU-bound jobs the coach path runs,
 * and both used to execute synchronously on the main thread — freezing the
 * canvas at exactly the moment the player is most invested in the outcome.
 * Moving them off-thread is what makes the coach loop feel substantial rather
 * than broken.
 *
 * Every payload here is plain structured-cloneable data. The worker rebuilds
 * its own Rapier world from the pinned terrain GLB rather than receiving
 * collider typed arrays over the boundary (megabytes of vertex data we would
 * only pay for once, lazily, on the first job).
 */
import type { ArenaScenario } from './arenaEpisode'
import type { EntrantPolicyOption } from './arenaPolicy'
import type { MatchMoment } from './matchTimeline'
import type { PracticeComparison } from './practiceComparison'
import type { PolicyCheckpoint } from './policyModel'
import type { ArenaTrainingExample, TrainingOptions } from './policyTrainer'

export interface TrainJobPayload {
  parent: PolicyCheckpoint
  examples: ArenaTrainingExample[]
  options: TrainingOptions
}

export interface ComparisonJobPayload {
  parent: PolicyCheckpoint
  child: PolicyCheckpoint
  scenario: ArenaScenario
  rival: EntrantPolicyOption
  controllerVersion: string
}

export interface TimelineJobPayload {
  scenario: ArenaScenario
  options: Record<string, EntrantPolicyOption>
}

export type TrainingWorkerRequest =
  | { kind: 'train'; id: number; payload: TrainJobPayload }
  | { kind: 'compare'; id: number; payload: ComparisonJobPayload }
  | { kind: 'timeline'; id: number; payload: TimelineJobPayload }

export type TrainingWorkerResponse =
  | { kind: 'train'; id: number; checkpoint: PolicyCheckpoint }
  | { kind: 'compare'; id: number; comparison: PracticeComparison }
  | { kind: 'timeline'; id: number; moments: MatchMoment[] }
  | { kind: 'failure'; id: number; error: string }
  | { kind: 'ready' }