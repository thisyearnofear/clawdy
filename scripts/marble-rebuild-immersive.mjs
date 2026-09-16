#!/usr/bin/env node
/**
 * Phase B: generate a readable dual-route arena, download SPZ + collider,
 * then request HQ mesh export. Writes into public/marble/candidates/ first.
 *
 * Usage (from repo root, with key in the environment — do not paste keys):
 *   set -a && source .env.local && set +a
 *   node scripts/marble-rebuild-immersive.mjs
 */

import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
const API_BASE_URL = 'https://api.worldlabs.ai/marble/v1'
const WORLD_ID_EXISTING = process.env.MARBLE_REUSE_WORLD_ID || ''

const PROMPT = [
  'A compact playable vehicle arena for two rival rovers, designed for crystal-clear gameplay readability.',
  'Layout: a LOWER VALLEY corridor on the left and a RAISED RIDGE corridor on the right, connected by three mid-height cross bridges.',
  'The valley floor is a continuous, wide, flat paved stone road in warm sandstone, clearly separate from surrounding terrain.',
  'The ridge is a solid elevated rock shelf with a flat dark basalt roadway, about 3 meters higher than the valley, with crisp cliff edges (not soft fog).',
  'No volumetric clouds as the driveable surface. Sky may have distant clouds, but ground must be solid rock, stone, and packed earth.',
  'Materials must contrast: sandstone valley (warm beige), basalt ridge (cool dark grey), cross bridges (muted green slate).',
  'Place two distinct glowing circular base pads: emerald-green at the valley north end, amber-orange at the valley south end.',
  'Add a tall crystal landmark spire near the arena center for orientation.',
  'Keep open sightlines across the course. Wide flat drive lanes for vehicle physics. No floating debris, no fog soup, no soft cloudy ground.',
  'Arcade-readable, high-energy, but with solid, parseable geometry.',
].join(' ')

const apiKey = process.env.WLT_API_KEY ?? process.env.WORLDLABS_API_KEY
const model = process.env.MARBLE_WORLD_MODEL ?? 'marble-1.1'
const splatResolution = process.env.MARBLE_SPZ_RESOLUTION ?? '500k'
const displayName = process.env.MARBLE_WORLD_DISPLAY_NAME ?? 'Clawdy Dual Route Arena'
const candidateDir = resolve('public/marble/candidates')
const splatOutputPath = resolve(candidateDir, 'arena.spz')
const colliderOutputPath = resolve(candidateDir, 'collider.glb')
const terrainOutputPath = resolve(candidateDir, 'terrain.glb')
const metadataOutputPath = resolve(candidateDir, 'world.json')
const pollIntervalMs = Number(process.env.MARBLE_POLL_INTERVAL_MS ?? 15000)
const maxPolls = Number(process.env.MARBLE_MAX_POLLS ?? 100)
const promote = process.env.MARBLE_PROMOTE === '1'

if (!apiKey) {
  console.error('Missing WLT_API_KEY or WORLDLABS_API_KEY.')
  process.exit(1)
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'WLT-Api-Key': apiKey,
      ...(options.headers ?? {}),
    },
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message = body?.error?.message ?? body?.detail ?? body?.message ?? response.statusText
    throw new Error(`${response.status} ${typeof message === 'string' ? message : JSON.stringify(message)}`)
  }
  return body
}

async function download(url, outputPath) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`)
  await mkdir(dirname(outputPath), { recursive: true })
  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(outputPath, buffer)
  return buffer.byteLength
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

async function pollOperation(operationId, label) {
  let current = await request(`/operations/${operationId}`, { method: 'GET' })
  for (let attempt = 0; attempt < maxPolls && !current.done; attempt += 1) {
    await sleep(pollIntervalMs)
    current = await request(`/operations/${operationId}`, { method: 'GET' })
    const progress = current.metadata?.progress?.description ?? current.metadata?.progress?.status ?? 'in progress'
    console.log(`[${label}] poll ${attempt + 1}/${maxPolls}: ${progress}`)
  }
  if (!current.done) throw new Error(`${label} did not complete after ${maxPolls} polls`)
  if (current.error) throw new Error(current.error.message ?? `${label} failed`)
  return current
}

function getWorld(operation) {
  return operation.response?.world ?? operation.response
}

function pickSplatUrl(world) {
  const spzUrls = world?.assets?.splats?.spz_urls
  if (!spzUrls) return null
  return spzUrls[splatResolution] ?? spzUrls['500k'] ?? spzUrls['100k'] ?? spzUrls.full_res ?? null
}

async function sha256File(path) {
  const bytes = await readFile(path)
  return createHash('sha256').update(bytes).digest('hex')
}

async function generateWorld() {
  if (WORLD_ID_EXISTING) {
    console.log(`Reusing existing world ${WORLD_ID_EXISTING}`)
    const listed = await request(`/worlds/${WORLD_ID_EXISTING}`, { method: 'GET' })
    return { world: listed?.world ?? listed, operation: null }
  }

  console.log(`Generating Marble world: ${displayName}`)
  console.log(`Model: ${model}`)
  const operation = await request('/worlds:generate', {
    method: 'POST',
    body: JSON.stringify({
      display_name: displayName,
      model,
      world_prompt: { type: 'text', text_prompt: PROMPT },
      tags: ['clawdy', 'dual-route', 'readable-arena'],
    }),
  })
  console.log(`Operation: ${operation.operation_id}`)
  const done = await pollOperation(operation.operation_id, 'generate')
  return { world: getWorld(done), operation: done }
}

async function exportHqMesh(worldId) {
  console.log(`Requesting HQ textured mesh export for ${worldId}`)
  const started = await request(`/worlds/${worldId}:export`, {
    method: 'POST',
    body: JSON.stringify({ asset_type: 'mesh', format: 'glb', mesh_variant: 'textured' }),
  })
  if (started.done && started.response?.url) return started.response.url
  const done = await pollOperation(started.operation_id, 'hq-mesh')
  const url = done.response?.url ?? done.response?.asset?.url
  if (!url) throw new Error('HQ mesh export completed without a download URL')
  return url
}

async function promoteCandidates(meta) {
  const targets = [
    [splatOutputPath, resolve('public/marble/arena.spz')],
    [colliderOutputPath, resolve('public/marble/collider.glb')],
    [terrainOutputPath, resolve('public/marble/terrain.glb')],
    [metadataOutputPath, resolve('public/marble/world.json')],
  ]
  for (const [from, to] of targets) {
    await copyFile(from, to)
    console.log(`Promoted ${from} -> ${to}`)
  }
  await writeFile(resolve('public/marble/candidates/PROMOTE.json'), JSON.stringify(meta, null, 2))
}

async function main() {
  await mkdir(candidateDir, { recursive: true })
  const { world } = await generateWorld()
  const worldId = world?.world_id ?? world?.id
  if (!worldId) throw new Error('No world_id in generate response')

  const splatUrl = pickSplatUrl(world)
  const colliderUrl = world?.assets?.mesh?.collider_mesh_url ?? null
  if (!splatUrl) throw new Error(`No SPZ URL for resolution "${splatResolution}"`)

  const [splatBytes, colliderBytes] = await Promise.all([
    download(splatUrl, splatOutputPath),
    colliderUrl ? download(colliderUrl, colliderOutputPath) : Promise.resolve(0),
  ])
  if (!colliderUrl) console.warn('No collider_mesh_url — download collider manually from Marble before promoting.')

  let terrainBytes = 0
  let terrainUrl = null
  try {
    terrainUrl = await exportHqMesh(worldId)
    terrainBytes = await download(terrainUrl, terrainOutputPath)
  } catch (error) {
    console.warn(`HQ mesh export failed (continuing with splat+collider): ${error instanceof Error ? error.message : error}`)
  }

  const colliderHash = colliderBytes ? await sha256File(colliderOutputPath) : null
  const meta = {
    world_id: worldId,
    world_marble_url: world?.world_marble_url ?? `https://marble.worldlabs.ai/world/${worldId}`,
    display_name: world?.display_name ?? displayName,
    model,
    splat_resolution: splatResolution,
    splat_output: splatOutputPath,
    collider_output: colliderUrl ? colliderOutputPath : null,
    terrain_output: terrainUrl ? terrainOutputPath : null,
    collider_sha256: colliderHash,
    caption: world?.assets?.caption ?? null,
    prompt: PROMPT,
    generated_at: new Date().toISOString(),
  }
  await writeFile(metadataOutputPath, JSON.stringify(meta, null, 2))

  console.log(`Downloaded SPZ: ${splatOutputPath} (${splatBytes} bytes)`)
  if (colliderUrl) console.log(`Downloaded collider: ${colliderOutputPath} (${colliderBytes} bytes)`)
  if (terrainUrl) console.log(`Downloaded terrain: ${terrainOutputPath} (${terrainBytes} bytes)`)
  if (colliderHash) console.log(`Collider SHA-256: ${colliderHash}`)
  console.log(`Wrote metadata: ${metadataOutputPath}`)

  if (promote) {
    if (!colliderHash) throw new Error('Refusing to promote without a collider')
    await promoteCandidates(meta)
  } else {
    console.log('Candidates ready. After course validation, re-run with MARBLE_PROMOTE=1 or copy files manually.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
