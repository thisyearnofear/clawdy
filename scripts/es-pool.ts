import { Worker } from 'node:worker_threads'
import type { EsContext, EsEvaluator, EsScore } from '../services/policyES'

/** Fan checkpoint scoring out over worker threads (one simulator per thread). */
export function workerPool(context: EsContext, size: number): { evaluator: EsEvaluator; close: () => Promise<void> } {
  const workers = Array.from({ length: size }, () =>
    new Worker(new URL('./es-worker.ts', import.meta.url), { workerData: context, execArgv: ['--import', 'tsx'] }))
  let nextId = 0
  const evaluator: EsEvaluator = (checkpoints, tasks) => {
    const chunks: { worker: Worker; indexes: number[] }[] = workers.map(worker => ({ worker, indexes: [] }))
    checkpoints.forEach((_, index) => chunks[index % workers.length].indexes.push(index))
    const results = new Array<EsScore>(checkpoints.length)
    return Promise.all(chunks.filter(chunk => chunk.indexes.length > 0).map(chunk => new Promise<void>((resolveChunk, reject) => {
      const id = nextId++
      const onMessage = (message: { id: number; scores: EsScore[] }) => {
        if (message.id !== id) return
        chunk.worker.off('message', onMessage)
        chunk.worker.off('error', reject)
        message.scores.forEach((score, offset) => { results[chunk.indexes[offset]] = score })
        resolveChunk()
      }
      chunk.worker.on('message', onMessage)
      chunk.worker.on('error', reject)
      chunk.worker.postMessage({ id, checkpoints: chunk.indexes.map(index => checkpoints[index]), tasks })
    }))).then(() => results)
  }
  return { evaluator, close: async () => { await Promise.all(workers.map(worker => worker.terminate())) } }
}
