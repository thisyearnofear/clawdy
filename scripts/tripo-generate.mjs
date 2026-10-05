#!/usr/bin/env node
// Generate one GLB with the Tripo API and save it.
// Usage: node scripts/tripo-generate.mjs --prompt "..." --out public/assets/tripo/name.glb [--face-limit 8000] [--negative "..."] [--seed 1]
// Reads TRIPO_API_KEY from the environment or .env.local. Never prints the key.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const API = 'https://api.tripo3d.ai/v2/openapi'
const MODEL_VERSION = 'P1-20260311'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, token, index, all) => {
    if (token.startsWith('--')) pairs.push([token.slice(2), all[index + 1]])
    return pairs
  }, []),
)
if (!args.prompt || !args.out) {
  console.error('Usage: node scripts/tripo-generate.mjs --prompt "..." --out path.glb [--face-limit N] [--negative "..."] [--seed N]')
  process.exit(2)
}

function loadKey() {
  if (process.env.TRIPO_API_KEY) return process.env.TRIPO_API_KEY
  if (existsSync('.env.local')) {
    const line = readFileSync('.env.local', 'utf8').split('\n').find(l => l.startsWith('TRIPO_API_KEY='))
    if (line) return line.slice('TRIPO_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
  }
  throw new Error('TRIPO_API_KEY is not set')
}

const key = loadKey()
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }

const body = {
  type: 'text_to_model',
  model_version: MODEL_VERSION,
  prompt: args.prompt,
  face_limit: Number(args['face-limit'] ?? 8000),
  texture: true,
  pbr: true,
  texture_quality: 'standard',
}
if (args.negative) body.negative_prompt = args.negative
if (args.seed) body.model_seed = Number(args.seed)

// --task-id resumes (downloads) a task that was already submitted, so a dropped shell never costs a second generation.
let taskId = args['task-id']
if (!taskId) {
  const created = await fetch(`${API}/task`, { method: 'POST', headers, body: JSON.stringify(body) }).then(r => r.json())
  if (created.code !== 0) throw new Error(`Tripo rejected the task: ${JSON.stringify(created)}`)
  taskId = created.data.task_id
  console.error(`task ${taskId} submitted`)
}

const deadline = Date.now() + 10 * 60_000
let task
while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 4000))
  task = (await fetch(`${API}/task/${taskId}`, { headers }).then(r => r.json())).data
  if (['success', 'failed', 'cancelled', 'banned', 'expired', 'unknown'].includes(task.status)) break
  console.error(`  ${task.status} ${task.progress ?? 0}%`)
}
if (task?.status !== 'success') throw new Error(`Tripo task ended as ${task?.status ?? 'timeout'}: ${JSON.stringify(task).slice(0, 400)}`)

const output = task.output ?? {}
const modelUrl = output.pbr_model ?? output.model ?? output.base_model
if (!modelUrl) throw new Error(`No model URL in output: ${JSON.stringify(output).slice(0, 400)}`)
const bytes = Buffer.from(await fetch(modelUrl).then(r => r.arrayBuffer()))
mkdirSync(dirname(args.out), { recursive: true })
writeFileSync(args.out, bytes)
console.log(JSON.stringify({ taskId, out: args.out, bytes: bytes.length, modelVersion: MODEL_VERSION, prompt: args.prompt, consumedCredit: task.consumed_credit ?? null }))
