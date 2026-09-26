import type { ConvexReactClient } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { PolicyCheckpoint } from './policyModel'
import type { ArenaTrainingExample } from './policyTrainer'
import { getOrCreateGuestKey } from './guestIdentity'

export function isConvexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)
}

/** Best-effort dual-write. Never throws into Play / Coach paths. */
export async function syncCheckpoint(
  client: ConvexReactClient | null,
  checkpoint: PolicyCheckpoint,
  approvedExampleIds: string[] = [],
): Promise<void> {
  if (!client || !isConvexConfigured()) return
  try {
    const guestKey = getOrCreateGuestKey()
    await client.mutation(api.checkpoints.upsert, {
      guestKey,
      checkpointId: checkpoint.id,
      name: checkpoint.name,
      schemaVersion: checkpoint.schemaVersion,
      parentCheckpointId: checkpoint.parentCheckpointId,
      weightsHash: checkpoint.weightsHash,
      createdAt: checkpoint.createdAt,
      approvedExampleIds,
      payload: checkpoint,
    })
  } catch (err) {
    console.warn('[convexSync] checkpoint upsert failed:', err)
  }
}

export async function syncExample(client: ConvexReactClient | null, example: ArenaTrainingExample): Promise<void> {
  if (!client || !isConvexConfigured()) return
  try {
    const guestKey = getOrCreateGuestKey()
    await client.mutation(api.examples.upsert, {
      guestKey,
      exampleId: example.id,
      sourceEpisodeId: example.sourceEpisodeId,
      tick: example.tick,
      approved: example.approved,
      rationale: example.rationale,
      preferredActionType: example.preferredAction.type,
      payload: example,
    })
  } catch (err) {
    console.warn('[convexSync] example upsert failed:', err)
  }
}

export async function syncExamples(client: ConvexReactClient | null, examples: ArenaTrainingExample[]): Promise<void> {
  for (const example of examples) {
    await syncExample(client, example)
  }
}

export async function syncTrainingJob(
  client: ConvexReactClient | null,
  job: {
    jobId: string
    status: 'pending' | 'running' | 'succeeded' | 'failed'
    parentCheckpointId: string
    resultCheckpointId: string | null
    exampleCount: number
    message: string | null
  },
): Promise<void> {
  if (!client || !isConvexConfigured()) return
  try {
    const guestKey = getOrCreateGuestKey()
    await client.mutation(api.trainingJobs.upsert, {
      guestKey,
      ...job,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[convexSync] training job upsert failed:', err)
  }
}

export async function syncMatchSummary(
  client: ConvexReactClient | null,
  match: {
    matchId: string
    scenarioId: string
    rulesVersion: string
    scored: boolean
    checkpointId: string | null
    championBanked: number
    rivalBanked: number
    winner: string | null
    linkedExampleIds: string[]
  },
): Promise<void> {
  if (!client || !isConvexConfigured()) return
  try {
    const guestKey = getOrCreateGuestKey()
    await client.mutation(api.matches.record, {
      guestKey,
      ...match,
      finishedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[convexSync] match record failed:', err)
  }
}
