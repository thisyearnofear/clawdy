import type { ConvexReactClient } from 'convex/react'
import { api } from '../convex/_generated/api'
import { SEASON_0_BASE_CHECKPOINT, validateCheckpoint, type PolicyCheckpoint } from './policyModel'
import type { ArenaTrainingExample } from './policyTrainer'
import { getOrCreateGuestKey } from './guestIdentity'
import { useArenaStore, attachLocalCache, type SyncSnapshot } from './arenaStore'

/**
 * Offline-first sync client — the only place that speaks to convex/sync.ts.
 *
 * Protocol (per record): `updatedAtMs` is our LWW proposal (stamped when the
 * change is enqueued); the server re-stamps `serverSeenAt` and refuses stale
 * or tombstoned writes. Pulls carry tombstones, so deletes converge across
 * devices. Everything that fails to send parks in a persisted outbox
 * (`clawdy_sync_queue_v1`) keyed by record, so repeated edits coalesce into
 * one pending write instead of an N×M re-upsert storm.
 *
 * The sync path must never touch the simulation: this module imports no
 * episode/session code and is only ever driven by store changes, boot, and
 * connectivity events.
 */

export function isConvexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)
}

const META_KEY = 'clawdy_sync_meta_v1'
const OUTBOX_KEY = 'clawdy_sync_queue_v1'

export type OutboxKind = 'checkpoint' | 'example' | 'delete-checkpoint' | 'delete-example' | 'match' | 'job'

export interface OutboxEntry {
  kind: OutboxKind
  /** ckpt:<id> / ex:<id> / match:<id> / job:<id> — one pending write per key. */
  key: string
  payload: Record<string, unknown>
  updatedAtMs: number
}

export interface RecordMeta {
  /** Hash of the payload we last proposed (0 = never synced, -1 = deleted here). */
  h: number
  /** Last proposed updatedAtMs — our claim on the LWW clock. */
  m: number
  /** Checkpoints only: approved example ids supplied at train time. */
  ids?: string[]
}

export interface SyncMeta {
  records: Record<string, RecordMeta>
  /** matchId -> hash of the summary already recorded server-side. */
  matches: Record<string, number>
}

const EMPTY_META: SyncMeta = { records: {}, matches: {} }

function djb2(text: string): number {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return hash
}

export function hashRecord(record: unknown): number {
  return djb2(JSON.stringify(record) ?? '')
}

export const checkpointKey = (id: string) => `ckpt:${id}`
export const exampleKey = (id: string) => `ex:${id}`
export const matchKey = (id: string) => `match:${id}`
export const jobKey = (id: string) => `job:${id}`

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Cache pressure must never break the loop; the store subscriber retries.
  }
}

// ---------------------------------------------------------------------------
// Pull merge — pure so it can be unit-tested without a browser.
// ---------------------------------------------------------------------------

export interface PulledCheckpoint {
  checkpointId: string
  name: string
  schemaVersion: string
  parentCheckpointId: string | null
  weightsHash: string
  createdAt: string
  approvedExampleIds: string[]
  doc?: unknown
  legacyPayload?: unknown
  payloadRejected?: boolean
  updatedAtMs?: number
  tombstone?: boolean
}

export interface PulledExample {
  exampleId: string
  sourceEpisodeId: string
  tick: number
  approved: boolean
  rationale: string
  preferredActionType: string
  doc?: unknown
  legacyPayload?: unknown
  payloadRejected?: boolean
  updatedAtMs?: number
  tombstone?: boolean
}

export interface PulledState {
  checkpoints: PulledCheckpoint[]
  examples: PulledExample[]
}

export interface MergePlan<T extends { id: string }> {
  /** Local list after adopting server truth (restores + tombstone drops). */
  records: T[]
  /** Keys whose local record changed or was only ever local — need a push. */
  pushKeys: string[]
  meta: Record<string, RecordMeta>
}

function adoptCheckpoint(row: PulledCheckpoint): PolicyCheckpoint | null {
  const candidate = row.doc ?? row.legacyPayload
  if (!candidate || row.payloadRejected === true) return null
  try {
    validateCheckpoint(candidate as PolicyCheckpoint)
    return candidate as PolicyCheckpoint
  } catch {
    return null
  }
}

function adoptExample(row: PulledExample): ArenaTrainingExample | null {
  const candidate = (row.doc ?? row.legacyPayload) as ArenaTrainingExample | undefined | null
  if (!candidate || row.payloadRejected === true) return null
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.sourceEpisodeId !== 'string' ||
    typeof candidate.tick !== 'number' ||
    typeof candidate.observation !== 'object' ||
    candidate.observation === null
  ) return null
  return candidate
}

/**
 * One LWW merge over a generic record table. Server rows carry the
 * authoritative clock view; meta carries what we last proposed.
 */
function mergeTable<T extends { id: string }>({ local, rows, meta, keyOf }: {
  local: T[]
  rows: { rowKey: string; rowMs: number; rowTombstone: boolean; adopt: () => T | null }[]
  meta: Record<string, RecordMeta>
  keyOf: (record: T) => string
}): MergePlan<T> {
  const nextMeta: Record<string, RecordMeta> = { ...meta }
  const byKey = new Map<string, T>()
  for (const record of local) byKey.set(keyOf(record), record)
  const pushKeys: string[] = []

  for (const row of rows) {
    const existing = nextMeta[row.rowKey]
    const localRecord = byKey.get(row.rowKey)
    if (row.rowTombstone) {
      if ((existing?.m ?? 0) <= row.rowMs) {
        // Server delete wins (or we never touched it) — converge locally.
        byKey.delete(row.rowKey)
        nextMeta[row.rowKey] = { h: -1, m: row.rowMs }
      } else if (localRecord) {
        pushKeys.push(row.rowKey) // our newer edit resurfaces it
      }
      continue
    }
    const adopted = row.adopt()
    if (!adopted) continue // rejected/corrupt payload: keep whatever local has
    if (!localRecord) {
      const last = nextMeta[row.rowKey]
      if (last && last.h === -1 && last.m >= row.rowMs) continue // deleted here, not yet tombstoned
      byKey.set(row.rowKey, adopted)
      nextMeta[row.rowKey] = { h: hashRecord(adopted), m: row.rowMs }
      continue
    }
    const ours = nextMeta[row.rowKey]
    if (ours && ours.m >= row.rowMs && ours.h >= 0) {
      if (ours.h !== hashRecord(localRecord)) pushKeys.push(row.rowKey)
      continue
    }
    byKey.set(row.rowKey, adopted)
    nextMeta[row.rowKey] = { h: hashRecord(adopted), m: row.rowMs }
  }

  // Local-only records (or records edited since their last proposal).
  for (const record of byKey.values()) {
    const key = keyOf(record)
    if (pushKeys.includes(key)) continue
    const known = nextMeta[key]
    if (!known) {
      pushKeys.push(key)
      continue
    }
    if (known.h >= 0 && known.h !== hashRecord(record)) pushKeys.push(key)
  }

  const order = new Map<string, number>()
  local.forEach((record, index) => order.set(keyOf(record), index))
  const records = [...byKey.values()].sort((a, b) => {
    const ai = order.get(keyOf(a)) ?? Number.MAX_SAFE_INTEGER
    const bi = order.get(keyOf(b)) ?? Number.MAX_SAFE_INTEGER
    return ai - bi
  })
  return { records, pushKeys, meta: nextMeta }
}

export function planMerge(
  local: { checkpoints: PolicyCheckpoint[]; examples: ArenaTrainingExample[] },
  pulled: PulledState,
  meta: SyncMeta,
): {
  checkpoints: PolicyCheckpoint[]
  examples: ArenaTrainingExample[]
  pushCheckpoints: PolicyCheckpoint[]
  pushExamples: ArenaTrainingExample[]
  meta: SyncMeta
} {
  const ckpt = mergeTable<PolicyCheckpoint>({
    local: local.checkpoints,
    rows: pulled.checkpoints.map(row => ({
      rowKey: checkpointKey(row.checkpointId),
      rowMs: row.updatedAtMs ?? 0,
      rowTombstone: row.tombstone === true,
      adopt: () => adoptCheckpoint(row),
    })),
    meta: meta.records,
    keyOf: record => checkpointKey(record.id),
  })
  const ex = mergeTable<ArenaTrainingExample>({
    local: local.examples,
    rows: pulled.examples.map(row => ({
      rowKey: exampleKey(row.exampleId),
      rowMs: row.updatedAtMs ?? 0,
      rowTombstone: row.tombstone === true,
      adopt: () => adoptExample(row),
    })),
    meta: ckpt.meta,
    keyOf: record => exampleKey(record.id),
  })
  const ckptByKey = new Map(ckpt.records.map(r => [checkpointKey(r.id), r]))
  const exByKey = new Map(ex.records.map(r => [exampleKey(r.id), r]))
  return {
    checkpoints: ckpt.records,
    examples: ex.records,
    pushCheckpoints: ckpt.pushKeys.map(key => ckptByKey.get(key)).filter(Boolean) as PolicyCheckpoint[],
    pushExamples: ex.pushKeys.map(key => exByKey.get(key)).filter(Boolean) as ArenaTrainingExample[],
    meta: { records: ex.meta, matches: meta.matches },
  }
}

// ---------------------------------------------------------------------------
// Wire payloads for convex/sync.ts
// ---------------------------------------------------------------------------

function checkpointUpsertArgs(guestKey: string, record: PolicyCheckpoint, meta: RecordMeta | undefined) {
  return {
    guestKey,
    checkpointId: record.id,
    name: record.name,
    schemaVersion: record.schemaVersion,
    parentCheckpointId: record.parentCheckpointId,
    weightsHash: record.weightsHash,
    createdAt: record.createdAt,
    approvedExampleIds: meta?.ids ?? [],
    doc: record,
    updatedAtMs: 0, // stamped by the caller when the proposal goes out
  }
}

function exampleUpsertArgs(guestKey: string, record: ArenaTrainingExample) {
  return {
    guestKey,
    exampleId: record.id,
    sourceEpisodeId: record.sourceEpisodeId,
    tick: record.tick,
    approved: record.approved,
    rationale: record.rationale,
    preferredActionType: record.preferredAction.type,
    doc: record,
    updatedAtMs: 0,
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface MatchSummary {
  matchId: string
  scenarioId: string
  rulesVersion: string
  scored: boolean
  checkpointId: string | null
  championBanked: number
  rivalBanked: number
  winner: string | null
  linkedExampleIds: string[]
}

export interface TrainingJobSummary {
  jobId: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  parentCheckpointId: string
  resultCheckpointId: string | null
  exampleCount: number
  message: string | null
}

let meta: SyncMeta = EMPTY_META
let outbox: OutboxEntry[] = []
let startedClient: ConvexReactClient | null = null
let started = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let diffTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false

function loadState() {
  if (typeof window === 'undefined') return
  const stored = readJson<Partial<SyncMeta>>(META_KEY, {})
  meta = {
    records: stored.records && typeof stored.records === 'object' ? stored.records : {},
    matches: stored.matches && typeof stored.matches === 'object' ? stored.matches : {},
  }
  outbox = readJson<OutboxEntry[]>(OUTBOX_KEY, []).filter(
    entry => entry && typeof entry.key === 'string' && typeof entry.kind === 'string',
  )
}

function persist() {
  if (typeof window === 'undefined') return
  writeJson(META_KEY, meta)
  writeJson(OUTBOX_KEY, outbox)
  const queueCount = outbox.filter(entry => entry.kind !== 'match' && entry.kind !== 'job').length
  const store = useArenaStore.getState()
  if (store.sync.queued !== queueCount) {
    store.setSync({ queued: queueCount })
  }
}

function setPhase(phase: SyncSnapshot['phase'], message: string | null = null) {
  useArenaStore.getState().setSync({ phase, message })
}

function enqueue(entry: Omit<OutboxEntry, 'updatedAtMs'> & { updatedAtMs?: number }) {
  const updatedAtMs = entry.updatedAtMs ?? Date.now()
  outbox = outbox.filter(candidate => candidate.key !== entry.key) // latest write per key wins
  outbox.push({ ...entry, updatedAtMs })
  const metaEntry = meta.records[entry.key]
  if (metaEntry && (entry.kind === 'checkpoint' || entry.kind === 'example')) {
    meta.records[entry.key] = { ...metaEntry, m: updatedAtMs }
  } else if (entry.kind === 'delete-checkpoint' || entry.kind === 'delete-example') {
    meta.records[entry.key] = { h: -1, m: updatedAtMs }
  }
  persist()
  scheduleFlush(400)
}

/**
 * Diff the store against the last-proposed hashes and enqueue whatever moved.
 * Coalescing by key is what kills the old N×M re-upsert storm.
 */
function diffAndQueue() {
  if (!startedClient || !isConvexConfigured()) return
  const guestKey = getOrCreateGuestKey()
  const state = useArenaStore.getState()
  const pendingKeys = new Set(outbox.map(entry => entry.key))
  for (const checkpoint of state.checkpoints) {
    const key = checkpointKey(checkpoint.id)
    const known = meta.records[key]
    if (known?.h === hashRecord(checkpoint) && known.m > 0 && !pendingKeys.has(key)) continue
    if (pendingKeys.has(key)) continue
    const args = checkpointUpsertArgs(guestKey, checkpoint, known)
    const updatedAtMs = Date.now()
    meta.records[key] = { ...(known ?? {}), h: hashRecord(checkpoint), m: updatedAtMs, ids: known?.ids }
    enqueue({ kind: 'checkpoint', key, payload: { ...args, updatedAtMs }, updatedAtMs })
  }
  for (const example of state.examples) {
    const key = exampleKey(example.id)
    const known = meta.records[key]
    if (known?.h === hashRecord(example) && known.m > 0 && !pendingKeys.has(key)) continue
    if (pendingKeys.has(key)) continue
    const args = exampleUpsertArgs(guestKey, example)
    const updatedAtMs = Date.now()
    meta.records[key] = { h: hashRecord(example), m: updatedAtMs }
    enqueue({ kind: 'example', key, payload: { ...args, updatedAtMs }, updatedAtMs })
  }
  persist()
}

async function runPull(client: ConvexReactClient): Promise<PulledState | null> {
  try {
    const guestKey = getOrCreateGuestKey()
    return await client.query(api.sync.pull, { guestKey })
  } catch {
    return null
  }
}

async function flush(): Promise<void> {
  if (flushing || !startedClient || outbox.length === 0) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (useArenaStore.getState().sync.phase !== 'error') setPhase('offline-queued')
    return
  }
  flushing = true
  const client = startedClient
  let delivered = 0
  try {
    while (outbox.length > 0) {
      const entry = outbox[0]
      try {
        await send(client, entry)
        outbox.shift()
        delivered += 1
        persist()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('cap-exceeded')) {
          // Retrying can never succeed; drop the write and tell the user.
          outbox.shift()
          persist()
          setPhase('error', 'Cloud limit reached — export stays available offline.')
          continue
        }
        if (message.includes('offline') || message.includes('Failed to fetch') || message.includes('network')) {
          if (useArenaStore.getState().sync.phase !== 'error') setPhase('offline-queued')
          scheduleRetry()
          break
        }
        outbox.shift() // rejected-stale / unknown: a later pull converges
        persist()
        setPhase('error', 'Some changes were refused by the server; the next sync reconciles.')
        continue
      }
    }
    if (delivered > 0 && outbox.length === 0 && useArenaStore.getState().sync.phase !== 'error') {
      setPhase('synced')
    }
  } finally {
    flushing = false
  }
}

async function send(client: ConvexReactClient, entry: OutboxEntry): Promise<void> {
  const guestKey = getOrCreateGuestKey()
  switch (entry.kind) {
    case 'checkpoint':
      await client.mutation(api.sync.upsertCheckpoint, entry.payload as never)
      return
    case 'example':
      await client.mutation(api.sync.upsertExample, entry.payload as never)
      return
    case 'delete-checkpoint':
      await client.mutation(api.sync.deleteCheckpoint, {
        guestKey,
        recordId: entry.key.slice('ckpt:'.length),
        updatedAtMs: entry.updatedAtMs,
      })
      return
    case 'delete-example':
      await client.mutation(api.sync.deleteExample, {
        guestKey,
        recordId: entry.key.slice('ex:'.length),
        updatedAtMs: entry.updatedAtMs,
      })
      return
    case 'match':
      await client.mutation(api.matches.record, entry.payload as never)
      meta.matches[entry.key.slice('match:'.length)] = hashRecord(entry.payload)
      return
    case 'job':
      await client.mutation(api.trainingJobs.upsert, entry.payload as never)
      return
  }
}

function scheduleFlush(delay: number) {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flush()
  }, delay)
}

function scheduleRetry() {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flush()
  }, 15_000)
}

/**
 * Public: queue a finished match once. Idempotent by (matchId, payload hash)
 * through persisted meta, so re-running the effect never double-records.
 */
export function queueMatchSync(match: MatchSummary): void {
  if (!startedClient || !isConvexConfigured()) return
  const key = matchKey(match.matchId)
  const hash = hashRecord(match)
  if (meta.matches[match.matchId] === hash) return
  if (outbox.some(entry => entry.key === key && hashRecord(entry.payload) === hash)) return
  const guestKey = getOrCreateGuestKey()
  enqueue({ kind: 'match', key, payload: { guestKey, ...match, finishedAt: new Date().toISOString() } })
}

/** Public: mirror a training job row (status transitions replace the pending write). */
export function queueTrainingJobSync(job: TrainingJobSummary): void {
  if (!startedClient || !isConvexConfigured()) return
  const guestKey = getOrCreateGuestKey()
  enqueue({
    kind: 'job',
    key: jobKey(job.jobId),
    payload: { guestKey, ...job, updatedAt: new Date().toISOString() },
  })
}

/** Public: checkpoint minted by training — carries its approved example ids. */
export function queueCheckpointSync(checkpoint: PolicyCheckpoint, approvedExampleIds: string[]): void {
  if (!startedClient || !isConvexConfigured()) return
  const guestKey = getOrCreateGuestKey()
  const key = checkpointKey(checkpoint.id)
  const updatedAtMs = Date.now()
  meta.records[key] = { h: hashRecord(checkpoint), m: updatedAtMs, ids: approvedExampleIds }
  const args = checkpointUpsertArgs(guestKey, checkpoint, meta.records[key])
  enqueue({ kind: 'checkpoint', key, payload: { ...args, updatedAtMs }, updatedAtMs })
  persist()
}

/** Public: delete an example and propagate the tombstone (fixes the local-only delete bug). */
export function deleteExampleRecord(id: string): void {
  useArenaStore.getState().setExamples(prev => prev.filter(example => example.id !== id))
  if (!startedClient || !isConvexConfigured()) return
  const key = exampleKey(id)
  if (meta.records[key]?.h === -1) return
  enqueue({ kind: 'delete-example', key, payload: {} })
}

export function deleteCheckpointRecord(id: string): void {
  const state = useArenaStore.getState()
  state.setCheckpoints(prev => prev.filter(checkpoint => checkpoint.id !== id))
  if (state.activeCheckpoint.id === id) {
    const remaining = useArenaStore.getState().checkpoints
    state.setActiveCheckpoint(remaining.find(c => c.id !== id) ?? SEASON_0_BASE_CHECKPOINT)
  }
  if (!startedClient || !isConvexConfigured()) return
  const key = checkpointKey(id)
  if (meta.records[key]?.h === -1) return
  enqueue({ kind: 'delete-checkpoint', key, payload: {} })
}

/**
 * Start the protocol. Safe to call from a component effect on every mount;
 * only the first call for a given client boots. Sync never blocks play:
 * the UI runs on local state while booting/flushing happens behind it.
 */
export function startArenaSync(client: ConvexReactClient | null): () => void {
  if (typeof window === 'undefined') return () => {}
  if (started) return () => {}
  started = true
  startedClient = client
  loadState()
  const detachCache = attachLocalCache()
  persist()

  if (!client || !isConvexConfigured()) {
    setPhase('off')
    return () => { detachCache(); started = false; startedClient = null }
  }

  setPhase('booting')
  useArenaStore.getState().setSync({ queued: outbox.length })

  void (async () => {
    const pulled = await runPull(client)
    if (!pulled) {
      setPhase(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline-queued' : 'error',
        'Could not reach Convex — working offline.')
    } else {
      const state = useArenaStore.getState()
      const plan = planMerge(
        { checkpoints: state.checkpoints, examples: state.examples },
        pulled,
        meta,
      )
      meta = plan.meta
      if (plan.checkpoints.length > 0) state.setCheckpoints(plan.checkpoints)
      state.setExamples(plan.examples)
      const active = state.activeCheckpoint
      if (!plan.checkpoints.some(c => c.id === active.id && c.schemaVersion === active.schemaVersion)) {
        const executable = plan.checkpoints.find(c => c.schemaVersion === active.schemaVersion) ?? plan.checkpoints[0]
        if (executable) state.setActiveCheckpoint(executable)
      }
      for (const checkpoint of plan.pushCheckpoints) queueCheckpointSync(checkpoint, meta.records[checkpointKey(checkpoint.id)]?.ids ?? [])
      for (const example of plan.pushExamples) {
        const key = exampleKey(example.id)
        const updatedAtMs = Date.now()
        meta.records[key] = { h: hashRecord(example), m: updatedAtMs }
        enqueue({ kind: 'example', key, payload: { ...exampleUpsertArgs(getOrCreateGuestKey(), example), updatedAtMs }, updatedAtMs })
      }
      persist()
      setPhase('synced')
    }
    if (outbox.length > 0) await flush()
    else if (typeof navigator !== 'undefined' && navigator.onLine === false) setPhase('offline-queued')
  })()

  const unsubscribe = useArenaStore.subscribe((state, prev) => {
    if (state.checkpoints === prev.checkpoints && state.examples === prev.examples) return
    if (diffTimer) clearTimeout(diffTimer)
    diffTimer = setTimeout(() => {
      diffTimer = null
      diffAndQueue()
    }, 500)
  })

  const onOnline = () => {
    setPhase('booting')
    void (async () => {
      const pulled = await runPull(startedClient!)
      if (pulled) {
        const state = useArenaStore.getState()
        const plan = planMerge({ checkpoints: state.checkpoints, examples: state.examples }, pulled, meta)
        meta = plan.meta
        state.setCheckpoints(plan.checkpoints)
        state.setExamples(plan.examples)
        setPhase('synced')
      } else {
        setPhase('offline-queued')
      }
      await flush()
    })()
  }
  const onOffline = () => {
    if (outbox.length > 0) setPhase('offline-queued')
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  return () => {
    unsubscribe()
    detachCache()
    if (diffTimer) clearTimeout(diffTimer)
    if (flushTimer) clearTimeout(flushTimer)
    if (retryTimer) clearTimeout(retryTimer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    started = false
    startedClient = null
  }
}

/** Test seam: reset module state between suites. */
export function __resetSyncEngineForTests(): void {
  started = false
  startedClient = null
  meta = EMPTY_META
  outbox = []
}
