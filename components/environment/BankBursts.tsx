'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ArenaCourse } from '../../services/arenaCourse'
import type { ArenaSession } from '../../services/arenaSession'
import type { ArenaPosition } from '../../services/arenaEpisode'
import { detectBankDeltas, detectCollectEvents } from '../../services/arenaPresentation'

/**
 * Celebration effects: Spark-rendered Gaussian-splat puffs for banks (large,
 * agent-colored, at the banking base) and collects (small, neutral gold, at
 * the resource node).
 *
 * Decor only — reads the snapshot, never the simulation. A burst failure is
 * swallowed (console warning) so effects can never break Play.
 *
 * Performance contract:
 * - Pooled meshes (2 bank + 3 collect slots, ≤160 splats each); no per-frame
 *   allocation.
 * - Splats are built programmatically via `constructSplats` — no downloads,
 *   no Marble credits, no asset files.
 * - Disabled entirely on lite graphics (coarse pointer / narrow / save-data):
 *   the component returns null before importing Spark.
 */
const BANK_LIFE = 0.55
const COLLECT_LIFE = 0.4
const BANK_POOL = 2
const COLLECT_POOL = 3
const BANK_SPLATS = 160
const COLLECT_SPLATS = 90

interface BurstSlot {
  node: THREE.Object3D
  active: boolean
  born: number
  life: number
  rise: number
}

/** Deterministic PRNG so puff shapes are stable across runs. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export function BankBursts({
  session,
  course,
  lite,
}: {
  session: ArenaSession
  course: ArenaCourse
  lite: boolean
}) {
  const { gl, scene } = useThree()
  const readyRef = useRef(false)
  const timeRef = useRef(0)
  const lastTickRef = useRef(-1)
  const seenBankedRef = useRef<Record<string, number>>({})
  const seenCollectedRef = useRef<Record<string, string | null>>({})
  const bankPoolsRef = useRef<Record<string, BurstSlot[]>>({})
  const collectPoolRef = useRef<BurstSlot[]>([])

  // Agent colors match the base-ring language in ArenaWorldView.
  const entrants = useMemo(
    () =>
      course.scenario.entrants.map(entrant => {
        const base = course.scenario.nodes.find(node => node.id === entrant.baseNode)?.position
        return {
          id: entrant.id,
          color: new THREE.Color(entrant.id === 'champion' ? '#bce478' : '#efad68'),
          base: base ?? course.center,
        }
      }),
    [course],
  )
  const collectAnchors = useMemo(() => {
    const anchors: Record<string, ArenaPosition> = {}
    for (const resource of course.scenario.resources) {
      const node = course.scenario.nodes.find(candidate => candidate.id === resource.nodeId)?.position
      if (node) anchors[resource.id] = [node[0], node[1] + 0.55, node[2]]
    }
    return anchors
  }, [course])
  const entrantsRef = useRef(entrants)
  const anchorsRef = useRef(collectAnchors)
  useEffect(() => {
    entrantsRef.current = entrants
    anchorsRef.current = collectAnchors
  }, [entrants, collectAnchors])

  useEffect(() => {
    if (lite) return
    let cancelled = false
    const disposables: (() => void)[] = []
    bankPoolsRef.current = {}
    collectPoolRef.current = []
    readyRef.current = false

    async function buildPuff(
      Spark: { SplatMesh: new (options: Record<string, unknown>) => { initialized: Promise<unknown>; dispose: () => void } },
      seed: number,
      color: THREE.Color,
      count: number,
      radius: number,
    ): Promise<THREE.Object3D | null> {
      const mesh = new Spark.SplatMesh({
        constructSplats: (splats: {
          ensureGenerate: (n: number) => void
          pushSplat: (
            center: THREE.Vector3,
            scales: THREE.Vector3,
            quaternion: THREE.Quaternion,
            opacity: number,
            color: THREE.Color,
          ) => void
        }) => {
          const rand = mulberry32(seed)
          const scratchColor = new THREE.Color()
          const white = new THREE.Color('#fff7e0')
          splats.ensureGenerate(count)
          for (let index = 0; index < count; index++) {
            const u = rand() * 2 - 1
            const theta = rand() * Math.PI * 2
            const shell = Math.sqrt(Math.max(0, 1 - u * u))
            const distance = (0.1 + 0.42 * Math.pow(rand(), 0.6)) * radius
            const center = new THREE.Vector3(
              shell * Math.cos(theta) * distance,
              (u * 0.7 + 0.45) * distance,
              shell * Math.sin(theta) * distance,
            )
            const core = index < count / 8
            const size = (core ? 0.02 + 0.03 * rand() : 0.03 + 0.055 * rand()) * radius
            scratchColor.copy(color)
            if (core) scratchColor.lerp(white, 0.65)
            else scratchColor.offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08)
            splats.pushSplat(
              center,
              new THREE.Vector3(size, size, size),
              new THREE.Quaternion(),
              core ? 0.95 : 0.45 + 0.45 * rand(),
              scratchColor.clone(),
            )
          }
        },
      })
      // eslint-disable-next-line no-await-in-loop
      await mesh.initialized
      if (cancelled) {
        mesh.dispose()
        return null
      }
      const node = mesh as unknown as THREE.Object3D
      node.visible = false
      scene.add(node)
      disposables.push(() => {
        scene.remove(node)
        mesh.dispose()
      })
      return node
    }

    async function init() {
      try {
        const Spark = await import('@sparkjsdev/spark')
        if (cancelled) return

        const spark = new Spark.SparkRenderer({ renderer: gl, sortRadial: true })
        scene.add(spark as unknown as THREE.Object3D)
        disposables.push(() => {
          scene.remove(spark as unknown as THREE.Object3D)
          spark.dispose()
        })

        for (const [entrantIndex, entrant] of entrantsRef.current.entries()) {
          const slots: BurstSlot[] = []
          for (let copy = 0; copy < BANK_POOL; copy++) {
            // eslint-disable-next-line no-await-in-loop
            const node = await buildPuff(Spark, 0x9e37 + entrantIndex * 101 + copy * 17, entrant.color, BANK_SPLATS, 1)
            if (cancelled || !node) return
            slots.push({ node, active: false, born: 0, life: BANK_LIFE, rise: 0.55 })
          }
          bankPoolsRef.current[entrant.id] = slots
        }
        const collectColor = new THREE.Color('#ffe9b0')
        for (let copy = 0; copy < COLLECT_POOL; copy++) {
          // eslint-disable-next-line no-await-in-loop
          const node = await buildPuff(Spark, 0x51f7 + copy * 31, collectColor, COLLECT_SPLATS, 0.62)
          if (cancelled || !node) return
          collectPoolRef.current.push({ node, active: false, born: 0, life: COLLECT_LIFE, rise: 0.35 })
        }
        if (!cancelled) {
          readyRef.current = true
          // Baseline silently so pre-existing totals never burst.
          const view = session.getSnapshot()
          const banked: Record<string, number> = {}
          for (const agent of view.episode.agents) banked[agent.id] = agent.banked
          seenBankedRef.current = banked
          const collected: Record<string, string | null> = {}
          for (const resource of view.episode.resources) collected[resource.id] = resource.collectedBy
          seenCollectedRef.current = collected
          lastTickRef.current = view.episode.tick
        }
      } catch (error) {
        console.warn('[BankBursts] disabled after init failure:', error)
      }
    }

    void init()
    return () => {
      cancelled = true
      readyRef.current = false
      bankPoolsRef.current = {}
      collectPoolRef.current = []
      for (const dispose of disposables.reverse()) {
        try {
          dispose()
        } catch {
          // Best-effort teardown only.
        }
      }
    }
    // Intentionally mount-once per course/lite: pools are bound to entrants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, lite, course])

  function fire(slot: BurstSlot, position: ArenaPosition, lift: number, now: number) {
    slot.node.position.set(position[0], position[1] + lift, position[2])
    slot.node.scale.setScalar(0.25)
    slot.node.visible = true
    slot.active = true
    slot.born = now
  }

  function steal(slots: BurstSlot[]): BurstSlot | null {
    if (slots.length === 0) return null
    return (
      slots.find(candidate => !candidate.active) ??
      slots.reduce((oldest, candidate) => (candidate.born < oldest.born ? candidate : oldest))
    )
  }

  useFrame((_, delta) => {
    if (lite || !readyRef.current) return
    timeRef.current += delta
    const now = timeRef.current
    const view = session.getSnapshot()
    const tick = view.episode.tick

    if (view.phase === 'ready' || tick < lastTickRef.current) {
      // Reset or backward scrub: re-baseline, never emit, hide live bursts.
      const banked: Record<string, number> = {}
      for (const agent of view.episode.agents) banked[agent.id] = agent.banked
      seenBankedRef.current = banked
      const collected: Record<string, string | null> = {}
      for (const resource of view.episode.resources) collected[resource.id] = resource.collectedBy
      seenCollectedRef.current = collected
      for (const slots of Object.values(bankPoolsRef.current)) {
        for (const slot of slots) {
          slot.active = false
          slot.node.visible = false
        }
      }
      for (const slot of collectPoolRef.current) {
        slot.active = false
        slot.node.visible = false
      }
    } else {
      const banks = detectBankDeltas(
        seenBankedRef.current,
        view.episode.agents.map(agent => ({ id: agent.id, banked: agent.banked })),
      )
      seenBankedRef.current = banks.seen
      for (const event of banks.events) {
        const slot = steal(bankPoolsRef.current[event.id] ?? [])
        const entrant = entrantsRef.current.find(candidate => candidate.id === event.id)
        if (!slot || !entrant) continue
        fire(slot, entrant.base, 0.35, now)
      }
      const collects = detectCollectEvents(
        seenCollectedRef.current,
        view.episode.resources.map(resource => ({ id: resource.id, collectedBy: resource.collectedBy })),
      )
      seenCollectedRef.current = collects.seen
      for (const event of collects.events) {
        const slot = steal(collectPoolRef.current)
        const anchor = anchorsRef.current[event.id]
        if (!slot || !anchor) continue
        fire(slot, anchor, 0, now)
      }
    }
    lastTickRef.current = tick

    const animate = (slots: BurstSlot[]) => {
      for (const slot of slots) {
        if (!slot.active) continue
        const t = (now - slot.born) / slot.life
        if (t >= 1) {
          slot.active = false
          slot.node.visible = false
          continue
        }
        const grow = Math.min(t / 0.35, 1)
        const ease = 1 - Math.pow(1 - grow, 3)
        const shrink = t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1
        slot.node.scale.setScalar(Math.max(0.001, (0.25 + 0.95 * ease) * shrink))
        slot.node.position.y += delta * slot.rise
      }
    }
    for (const slots of Object.values(bankPoolsRef.current)) animate(slots)
    animate(collectPoolRef.current)
  })

  return null
}
