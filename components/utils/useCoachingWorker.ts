'use client'

import { useCallback, useEffect } from 'react'
import type { MatchMoment } from '../../services/matchTimeline'
import type { PolicyCheckpoint } from '../../services/policyModel'
import type { PracticeComparison } from '../../services/practiceComparison'
import type {
  ComparisonJobPayload,
  TimelineJobPayload,
  TrainJobPayload,
  TrainingWorkerRequest,
  TrainingWorkerResponse,
} from '../../services/trainingProtocol'

/**
 * Owns the coaching worker for the workbench.
 *
 * The worker is a module-scoped singleton on purpose: it caches the pinned
 * terrain collider and its Rapier world across every training and comparison
 * run, so the second train of a session is warm instead of paying a GLB fetch
 * and a trimesh upload again. `terminate()` on unmount drops it entirely, which
 * is also the escape hatch if a job ever wedges.
 */
type Pending = { resolve: (value: never) => void; reject: (error: Error) => void }

let sharedWorker: Worker | null = null
let workerRefs = 0
let nextRequestId = 1
const pending = new Map<number, Pending>()

function ensureWorker(): Worker {
  if (sharedWorker) return sharedWorker
  const worker = new Worker(new URL('../../services/trainingWorker.ts', import.meta.url), { type: 'module' })
  worker.addEventListener('message', (event: MessageEvent<TrainingWorkerResponse>) => {
    const message = event.data
    if (message.kind === 'ready') return
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.kind === 'failure') {
      entry.reject(new Error(message.error))
      return
    }
    if (message.kind === 'train') entry.resolve(message.checkpoint as never)
    else if (message.kind === 'compare') entry.resolve(message.comparison as never)
    else entry.resolve(message.moments as never)
  })
  worker.addEventListener('error', event => {
    const error = new Error(event.message || 'Coaching worker crashed')
    for (const [, entry] of pending) entry.reject(error)
    pending.clear()
    sharedWorker?.terminate()
    sharedWorker = null
  })
  sharedWorker = worker
  return worker
}

function request<T>(build: (id: number) => TrainingWorkerRequest): Promise<T> {
  const worker = ensureWorker()
  const id = nextRequestId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: never) => void, reject })
    worker.postMessage(build(id))
  })
}

/** Release the shared worker once the last consumer unmounts. */
function releaseWorker() {
  workerRefs -= 1
  if (workerRefs > 0 || !sharedWorker) return
  sharedWorker.terminate()
  sharedWorker = null
  for (const [, entry] of pending) entry.reject(new Error('Coaching worker was released'))
  pending.clear()
}

export function useCoachingWorker() {
  useEffect(() => {
    workerRefs += 1
    return () => releaseWorker()
  }, [])

  const train = useCallback(
    (payload: TrainJobPayload) => request<PolicyCheckpoint>(id => ({ kind: 'train', id, payload })),
    [],
  )

  const compare = useCallback(
    (payload: ComparisonJobPayload) => request<PracticeComparison>(id => ({ kind: 'compare', id, payload })),
    [],
  )

  const timeline = useCallback(
    (payload: TimelineJobPayload) => request<MatchMoment[]>(id => ({ kind: 'timeline', id, payload })),
    [],
  )

  return { train, compare, timeline }
}