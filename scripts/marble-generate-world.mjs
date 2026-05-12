#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const API_BASE_URL = 'https://api.worldlabs.ai/marble/v1'
const DEFAULT_PROMPT = [
  'A compact playable arena for an agent vehicle game.',
  'Design a surreal cloud-top course with broad drivable paths, ramps, cover, open sightlines, weather-worn terrain, glowing collectible food stations, and clear central landmarks.',
  'The space should feel like a high-energy arcade arena, not a realistic city, and it must have enough flat surfaces for vehicle physics and AI navigation.',
].join(' ')

const apiKey = process.env.WLT_API_KEY ?? process.env.WORLDLABS_API_KEY
const prompt = process.env.MARBLE_WORLD_PROMPT ?? DEFAULT_PROMPT
const displayName = process.env.MARBLE_WORLD_DISPLAY_NAME ?? 'Clawdy Marble Arena'
const model = process.env.MARBLE_WORLD_MODEL ?? 'marble-1.1'
const splatResolution = process.env.MARBLE_SPZ_RESOLUTION ?? '500k'
const splatOutputPath = resolve(process.env.MARBLE_SPLAT_OUTPUT ?? 'public/marble/arena.spz')
const colliderOutputPath = resolve(process.env.MARBLE_COLLIDER_OUTPUT ?? 'public/marble/collider.glb')
const metadataOutputPath = resolve(process.env.MARBLE_METADATA_OUTPUT ?? 'public/marble/world.json')
const pollIntervalMs = Number(process.env.MARBLE_POLL_INTERVAL_MS ?? 15000)
const maxPolls = Number(process.env.MARBLE_MAX_POLLS ?? 80)

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
    const message = body?.error?.message ?? body?.message ?? response.statusText
    throw new Error(`${response.status} ${message}`)
  }

  return body
}

async function download(url, outputPath) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  await mkdir(dirname(outputPath), { recursive: true })
  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(outputPath, buffer)
  return buffer.byteLength
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function getWorld(operation) {
  return operation.response?.world ?? operation.response
}

function pickSplatUrl(world) {
  const spzUrls = world?.assets?.splats?.spz_urls
  if (!spzUrls) return null
  return spzUrls[splatResolution] ?? spzUrls['500k'] ?? spzUrls['100k'] ?? spzUrls.full_res ?? null
}

async function main() {
  console.log(`Generating Marble world: ${displayName}`)
  console.log(`Model: ${model}`)

  const operation = await request('/worlds:generate', {
    method: 'POST',
    body: JSON.stringify({
      display_name: displayName,
      model,
      world_prompt: {
        type: 'text',
        text_prompt: prompt,
      },
      tags: ['clawdy', 'hackathon', 'playable-arena'],
    }),
  })

  let current = operation
  console.log(`Operation: ${current.operation_id}`)

  for (let attempt = 0; attempt < maxPolls && !current.done; attempt += 1) {
    await sleep(pollIntervalMs)
    current = await request(`/operations/${current.operation_id}`, { method: 'GET' })
    const progress = current.metadata?.progress?.description ?? current.metadata?.progress?.status ?? 'in progress'
    console.log(`Poll ${attempt + 1}/${maxPolls}: ${progress}`)
  }

  if (!current.done) {
    throw new Error(`Marble operation did not complete after ${maxPolls} polls.`)
  }

  if (current.error) {
    throw new Error(current.error.message ?? 'Marble operation failed.')
  }

  const world = getWorld(current)
  const splatUrl = pickSplatUrl(world)
  const colliderUrl = world?.assets?.mesh?.collider_mesh_url ?? null

  if (!splatUrl) {
    throw new Error(`No SPZ URL found for resolution "${splatResolution}".`)
  }

  const [splatBytes, colliderBytes] = await Promise.all([
    download(splatUrl, splatOutputPath),
    colliderUrl ? download(colliderUrl, colliderOutputPath) : Promise.resolve(0),
  ])

  await mkdir(dirname(metadataOutputPath), { recursive: true })
  await writeFile(metadataOutputPath, JSON.stringify({
    world_id: world?.world_id ?? world?.id ?? current.metadata?.world_id ?? null,
    world_marble_url: world?.world_marble_url ?? null,
    display_name: world?.display_name ?? displayName,
    model,
    splat_resolution: splatResolution,
    splat_output: splatOutputPath,
    collider_output: colliderUrl ? colliderOutputPath : null,
    caption: world?.assets?.caption ?? null,
    generated_at: new Date().toISOString(),
  }, null, 2))

  console.log(`Downloaded SPZ: ${splatOutputPath} (${splatBytes} bytes)`)
  if (colliderUrl) {
    console.log(`Downloaded collider: ${colliderOutputPath} (${colliderBytes} bytes)`)
  } else {
    console.log('No collider_mesh_url returned. Export/download collider.glb manually from Marble.')
  }
  console.log(`Wrote metadata: ${metadataOutputPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
