/// <reference lib="webworker" />
/**
 * Coaching worker: runs the CPU-bound half of the coach loop off the main
 * thread.
 *
 * Three jobs live here, all of which used to block the render loop:
 *  - `train`   — 60-epoch supervised backprop on the approved notes.
 *  - `compare` — two full 1200-tick practice matches, parent vs child.
 *  - `timeline` — a headless clone of the whole match to place presentation beats.
 *
 * The worker rebuilds its own Rapier world from the pinned terrain GLB (hash
 * verified on load), so the collider is fetched once and shared across jobs
 * instead of being structured-cloned per comparison run. Rapier's WASM init is
 * the reason this file cannot simply import the arena course loader — see
 * `collider()` below.
 */
import { ArenaPhysics, initializeArenaPhysics } from './arenaPhysics'
import { loadArenaTerrain, disposeArenaTerrain } from './arenaTerrain'
import { createWorldSurface } from './worldSurface'
import { ARENA_WORLD } from './arenaCourse'
import { comparePracticeCheckpoints } from './practiceComparison'
import { trainPolicyCheckpoint } from './policyTrainer'
import { buildMatchTimeline } from './matchTimeline'
import type { TrainingWorkerRequest, TrainingWorkerResponse } from './trainingProtocol'

const scope = self as unknown as DedicatedWorkerGlobalScope

/** Lazily-built collider + motion factory, reused across every job. */
let motionFactory: (() => ArenaPhysics) | undefined

async function collider(): Promise<() => ArenaPhysics> {
  if (motionFactory) return motionFactory
  await initializeArenaPhysics()
  const scene = await loadArenaTerrain(ARENA_WORLD.colliderUrl, ARENA_WORLD.colliderSha256)
  try {
    const surface = createWorldSurface(scene)
    try {
      const data = surface.colliderData()
      // Build one probe world up front so the trimesh upload and the first
      // solver setup happen here, off the critical path, rather than inside
      // the first comparison.
      new ArenaPhysics(data).dispose()
      motionFactory = () => new ArenaPhysics(data)
    } finally {
      surface.dispose()
    }
  } finally {
    disposeArenaTerrain(scene)
  }
  return motionFactory
}

function post(message: TrainingWorkerResponse) {
  scope.postMessage(message)
}

scope.addEventListener('message', (event: MessageEvent<TrainingWorkerRequest>) => {
  const request = event.data
  void (async () => {
    try {
      switch (request.kind) {
        case 'train': {
          const checkpoint = trainPolicyCheckpoint(
            request.payload.parent,
            request.payload.examples,
            request.payload.options,
          )
          post({ kind: 'train', id: request.id, checkpoint })
          return
        }
        case 'compare': {
          const createMotion = await collider()
          const comparison = await comparePracticeCheckpoints(
            request.payload.parent,
            request.payload.child,
            request.payload.scenario,
            createMotion,
            {
              rival: request.payload.rival,
              controllerVersion: request.payload.controllerVersion,
            },
          )
          post({ kind: 'compare', id: request.id, comparison })
          return
        }
        case 'timeline': {
          const createMotion = await collider()
          const moments = buildMatchTimeline(request.payload.scenario, request.payload.options, createMotion)
          post({ kind: 'timeline', id: request.id, moments })
          return
        }
      }
    } catch (error) {
      post({
        kind: 'failure',
        id: request.id,
        error: error instanceof Error ? error.message : 'Coaching worker failed',
      })
    }
  })()
})

post({ kind: 'ready' })