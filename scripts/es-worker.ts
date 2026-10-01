/** Worker thread for scripts/train-es.ts: scores checkpoints on Rush tasks. */
import { parentPort, workerData } from 'node:worker_threads'
import { scoreCheckpoint, type EsContext, type EsTask } from '../services/policyES'
import type { PolicyCheckpoint } from '../services/policyModel'

const context = workerData as EsContext

parentPort!.on('message', (message: { id: number; checkpoints: PolicyCheckpoint[]; tasks: EsTask[] }) => {
  const scores = message.checkpoints.map(checkpoint => scoreCheckpoint(checkpoint, message.tasks, context))
  parentPort!.postMessage({ id: message.id, scores })
})
