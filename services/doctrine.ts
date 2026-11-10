import {
  rolloutOutcomeDelta,
  type ArenaAction,
  type ArenaObservation,
  type ArenaRecording,
  type ArenaSnapshot,
} from './arenaEpisode'
import { collectorPolicy } from './arenaPolicy'
import { recordedCoachContext } from './coachingReview'
import { SPECIALIZATION_FOCI, type SpecializationFocus } from './coachingEngine'
import type { ArenaTrainingExample } from './policyTrainer'

/**
 * Doctrine → Champion (AI Builder Hackathon Track B): a free-text paragraph is
 * translated (server-side LLM, or the local keyword fallback) into a bounded
 * `DoctrineSpec` — a signed weight vector over the same five coaching foci the
 * specialization chips already use. A deterministic expander then walks the
 * recorded practice run and, at every decision tick where the doctrine would
 * have chosen differently, drafts a labeled `ArenaTrainingExample`.
 *
 * Honesty contract (binding, docs/AI_BUILDER_HACKATHON.md review amendments):
 *  - The LLM only proposes weights + a name; it never touches an action. Every
 *    draft's preferred action comes from `recordedCoachContext().alternatives`
 *    — legal, controller-allowed choices at a real recorded tick.
 *  - Each draft carries a measured `outcomeDelta` from the same route-only
 *    counterfactual rollout (`rolloutOutcomeDelta`) the CI syllabus uses, so
 *    "the rover does the dumb thing you described" stays honest: a doctrine
 *    that picks worse moves produces visible negative deltas in the lesson
 *    cards, and only catastrophic picks (hard veto) are dropped.
 *  - Source is 'generated' with doctrine provenance — distinguishable from
 *    human drafts and approvals, exactly as the training contract requires.
 * Nothing here touches the match authority, the policy, or the trainer.
 */

/** Signed weights, −1 (strongly avoid) … +1 (strongly prefer), per focus. */
export type DoctrineWeights = Record<SpecializationFocus, number>

export interface DoctrineSpec {
  /** Player-facing label, sanitized ≤40 chars ("Drowned-valley greeder"). */
  name: string
  weights: DoctrineWeights
  /** One line of interpretation shown to the player (≤140 chars). */
  notes: string
}

const DOCTRINE_NAME_MAX = 40
const DOCTRINE_NOTES_MAX = 140
/** Below this, every focus is noise — not a doctrine. */
const MIN_DOCTRINE_WEIGHT = 0.15
/** Consequence floor: a pick this much worse than the recorded one is dropped. */
const DOCTRINE_HARD_VETO = -4

function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length === 0) return null
  return clean.length > max ? clean.slice(0, max).trimEnd() : clean
}

const clampWeight = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0

/**
 * Validate a translator reply into a bounded spec. Rejects malformed shapes
 * and doctrines with no meaningful weight — the caller falls back to
 * `heuristicDoctrine` or an honest refusal, never a broken expansion.
 */
export function parseDoctrineSpec(raw: unknown): DoctrineSpec | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { name, weights, notes } = raw as { name?: unknown; weights?: unknown; notes?: unknown }
  const cleanName = cleanText(name, DOCTRINE_NAME_MAX)
  const cleanNotes = cleanText(notes, DOCTRINE_NOTES_MAX) ?? 'A doctrine you described.'
  if (!cleanName || typeof weights !== 'object' || weights === null) return null
  const parsed = {} as DoctrineWeights
  let strongest = 0
  for (const focus of SPECIALIZATION_FOCI) {
    const w = clampWeight((weights as Record<string, unknown>)[focus])
    parsed[focus] = w
    strongest = Math.max(strongest, Math.abs(w))
  }
  if (strongest < MIN_DOCTRINE_WEIGHT) return null
  return { name: cleanName, weights: parsed, notes: cleanNotes }
}

/**
 * Deterministic fallback when the translator is unreachable or unconfigured:
 * same spec shape, mapped from doctrine keywords. Returns null when the note
 * names nothing the game understands — honest refusal, not a silent default.
 */
export function heuristicDoctrine(note: string): DoctrineSpec | null {
  const lower = note.toLowerCase()
  const weights: DoctrineWeights = { weather: 0, banking: 0, collection: 0, contest: 0, energy: 0 }
  const hit = (...words: string[]) => words.some(word => lower.includes(word))
  if (hit('low road', 'valley', 'hug the', 'wet', 'swim')) weights.weather -= 0.7
  if (hit('panic')) weights.weather -= 0.4
  if (hit('flood', 'water', 'ridge', 'high road', 'weather', 'dry', 'safe')) weights.weather += 0.8
  if (hit('hoard', 'never bank', 'keep cargo', 'hold on to')) weights.banking -= 0.7
  if (hit('bank', 'deliver', 'deposit', 'home', 'base', 'unload')) weights.banking += 0.8
  if (hit('collect', 'harvest', 'core', 'grab', 'scaveng', 'greed', 'loot', 'every')) weights.collection += 0.8
  if (hit('rival', 'steal', 'contest', 'beat', 'race', 'outrun')) weights.contest += 0.8
  if (hit('drain', 'battery')) weights.energy += 0.7
  if (hit('frugal', 'conserve', 'save energy', 'stingy')) weights.energy -= 0.6
  if (SPECIALIZATION_FOCI.every(focus => Math.abs(weights[focus]) < MIN_DOCTRINE_WEIGHT)) return null
  const words = note.replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ')
  return { name: words.length > 0 ? words : 'Custom doctrine', weights, notes: 'Parsed locally from your words.' }
}

function describeAction(action: ArenaAction): string {
  switch (action.type) {
    case 'move': return `route ${action.edgeId}`
    case 'collect': return 'collect now'
    case 'bank': return 'bank cargo'
    case 'drain': return 'drain energy'
    default: return 'hold position'
  }
}

const actionKey = (a: ArenaAction) => JSON.stringify(a)

/**
 * The deterministic doctrine scorer: how strongly each legal action agrees
 * with the weights, computed from observation facts only — never invented
 * context. `pool` defaults to the full legal set but the expander passes the
 * recorded frame's `alternatives`, so a doctrine can never re-pick the
 * recorded action or a controller-overridden one.
 */
export function doctrinePreferredAction(
  observation: ArenaObservation,
  spec: DoctrineSpec,
  pool: readonly ArenaAction[] = observation.availableActions,
): ArenaAction | null {
  const w = spec.weights
  const self = observation.self
  const flooded = observation.weather.flooded
  const rivalVisible = observation.rivals.some(rival => rival.visible)
  const resourceValueAt = (nodeId: string) =>
    observation.resources
      .filter(r => r.nodeId === nodeId && r.available)
      .reduce((sum, r) => sum + r.value, 0)

  const score = (a: ArenaAction): number => {
    if (a.type === 'move') {
      const edge = observation.edges.find(e => e.id === a.edgeId)
      if (!edge) return Number.NEGATIVE_INFINITY
      const target = edge.to === self.nodeId ? edge.from : edge.to
      const resValue = resourceValueAt(target)
      return -edge.currentTravelTicks * 0.01
        + w.weather * (edge.floodable ? (flooded ? -2 : -0.4) : 1.5)
        + w.collection * resValue * 0.8
        + w.banking * (target === self.baseNode ? (self.cargo > 0 ? 1.5 + self.cargo * 0.5 : 0.2) : 0)
        + (rivalVisible && resValue > 0 ? w.contest * 0.8 : 0)
    }
    if (a.type === 'collect') return w.collection * 2 + w.contest * (rivalVisible ? 1 : 0.3)
    if (a.type === 'bank') return w.banking * (self.cargo > 0 ? 2 + self.cargo * 0.5 : 0.5)
    if (a.type === 'drain') return w.energy >= 0 ? w.energy * (flooded && self.transit ? 2 : -1) : w.energy * 2
    // wait: near-neutral; a cautious doctrine tolerates it slightly more in a flood.
    return flooded && self.transit ? w.weather * 0.3 : 0.05
  }

  let best: ArenaAction | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const action of [...pool].sort((a, b) => actionKey(a).localeCompare(actionKey(b)))) {
    const s = score(action)
    if (s > bestScore) {
      bestScore = s
      best = action
    }
  }
  return best
}

interface DoctrineFrame {
  tick: number
  observation: ArenaObservation
  originalAction: ArenaAction
  alternatives: ArenaAction[]
  snapshot: ArenaSnapshot
}

/**
 * Evenly-spaced decision frames from a practice recording — each with a real
 * legal alternative. Practice-split only (recordedCoachContext refuses
 * evaluation scenarios, so doctrine can never touch held-out data).
 */
export function doctrineFramesFromRecording(recording: ArenaRecording, maxFrames = 10): DoctrineFrame[] {
  const total = recording.checkpoints.length
  if (total === 0) return []
  const frames: DoctrineFrame[] = []
  const step = Math.max(1, Math.floor(total / (maxFrames * 3)))
  for (let index = 0; index < total && frames.length < maxFrames; index += step) {
    const context = recordedCoachContext(recording, index)
    if (!context || context.alternatives.length === 0) continue
    const snapshot = recording.checkpoints.find(frame => frame.state.tick === context.tick)?.state
    if (!snapshot) continue
    frames.push({ ...context, snapshot })
  }
  return frames
}

export interface DoctrineExpansion {
  spec: DoctrineSpec
  examples: ArenaTrainingExample[]
  /** Decision frames sampled from the recording. */
  framesSampled: number
  /** Picks dropped by the consequence veto (measurably catastrophic). */
  vetoed: number
}

export interface DoctrineExpansionOptions {
  maxFrames?: number
  horizonTicks?: number
  hardVeto?: number
}

let counter = 0
function nextExampleId(): string {
  counter += 1
  return `ex-doc-${Date.now().toString(36)}-${counter.toString(36)}`
}

/**
 * Expand a doctrine into labeled draft examples across the recording. Each
 * emitted example (a) picks a legal alternative at a real recorded tick and
 * (b) carries a measured outcome delta — the consequence-veto machinery from
 * eval-lib, reused in the browser. Picks the rollout finds catastrophically
 * worse (< hardVeto) are dropped; merely worse picks survive *with their
 * measured delta in the rationale*, because a doctrine is a preference the
 * human reviews — including deliberately suboptimal ones.
 */
export function expandDoctrine(
  recording: ArenaRecording,
  spec: DoctrineSpec,
  options: DoctrineExpansionOptions = {},
): DoctrineExpansion {
  const horizon = options.horizonTicks ?? 120
  const hardVeto = options.hardVeto ?? DOCTRINE_HARD_VETO
  const frames = doctrineFramesFromRecording(recording, options.maxFrames ?? 10)
  const championContinuation = (obs: ArenaObservation) => collectorPolicy(obs, 'safe')
  const rivalContinuation = (obs: ArenaObservation) => collectorPolicy(obs, 'greedy')

  const examples: ArenaTrainingExample[] = []
  let vetoed = 0
  for (const frame of frames) {
    const preferred = doctrinePreferredAction(frame.observation, spec, frame.alternatives)
    if (!preferred) continue
    const delta = rolloutOutcomeDelta(
      recording.scenario, frame.snapshot, preferred, frame.originalAction,
      championContinuation, rivalContinuation, horizon,
    )
    if (delta < hardVeto) {
      vetoed += 1
      continue
    }
    const signed = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`
    examples.push({
      id: nextExampleId(),
      sourceEpisodeId: recording.scenario.id,
      tick: frame.tick,
      observation: structuredClone(frame.observation),
      originalAction: structuredClone(frame.originalAction),
      preferredAction: structuredClone(preferred),
      rationale: `Doctrine "${spec.name}": ${describeAction(preferred)} over the recorded ${describeAction(frame.originalAction)} — measures ${signed} over the next ${horizon} ticks (route model). Generated from your doctrine; a preference to review, not a guaranteed improvement.`,
      approved: false,
      source: 'generated',
      outcomeDelta: delta,
      provenance: { kind: 'doctrine', name: spec.name, outcomeDelta: delta },
    })
  }
  return { spec, examples, framesSampled: frames.length, vetoed }
}
