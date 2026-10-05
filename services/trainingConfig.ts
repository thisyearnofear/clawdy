/**
 * Training controls for the Coach panel (Stream B, docs/LEAGUE_PLAN.md).
 *
 * ## What this is, and what it deliberately is not
 *
 * Stream B asks for "generations, population size, mutation, hub prior, and
 * scenario mix" that "feed `TrainingConfig` into the existing trainer". Those
 * five are not `TrainingOptions` (epochs / learningRate / momentum /
 * weightDecay) — they are the **evolution-strategy** knobs in
 * `services/policyES.ts` and `scripts/train-es.ts`. They drive `trainES`.
 *
 * They are explicitly *not* the browser Coach-train optimizer. That one is
 * frozen: `services/__tests__/versions.test.ts` pins the literal text
 * `epochs: 60,` / `learningRate: 0.008,` /
 * `learningRateDecay: { atEpoch: 30, factor: 0.5 }` inside
 * `components/environment/ArenaScene.tsx`, and the eval pin `525eba353d75`
 * reproduces the weights that config produced. Making the sold learning path
 * configurable would break a deliberate pin, so the Train button keeps its
 * pinned config and this panel configures the builder instead.
 *
 * ## The defaults reproduce the builder run exactly
 *
 * `DEFAULT_TRAINING_CONFIG` is not a taste decision — it is transcribed from
 * the `train-es.ts` argument defaults, so a player who never opens this panel
 * gets the same run the CLI gives today:
 *
 *     gens: 30, pairs: 8, sigma: 0.08, hub-prior: 0, tasks: 3
 *
 * `toEsConfig` is the single handoff, and a test asserts that
 * `toEsConfig(DEFAULT_TRAINING_CONFIG, base)` is byte-identical to the config
 * the CLI builds from those defaults. That is what stops this screen from
 * becoming dead UI: the object it produces is the object `trainES` receives.
 */

import type { EsConfig } from './policyES'

/** The five knobs Stream B names, in the order the panel shows them. */
export interface TrainingConfig {
  /** `--gens`. Evolution generations to run. */
  generations: number
  /** `--pairs`. Antithetic pairs per generation; population is twice this. */
  pairs: number
  /** `--sigma`. Mutation size in weight space. */
  sigma: number
  /** `--hub-prior`. Seeds the hub edge weight of the parent checkpoint. */
  hubPrior: number
  /** `--tasks`. Practice scenarios sampled per generation (the "scenario mix"). */
  scenariosPerGeneration: number
}

/**
 * Transcribed from `scripts/train-es.ts`'s argument defaults so that an
 * untouched panel reproduces the builder run byte for byte.
 */
export const DEFAULT_TRAINING_CONFIG: Readonly<TrainingConfig> = Object.freeze({
  generations: 30,
  pairs: 8,
  sigma: 0.08,
  hubPrior: 0,
  scenariosPerGeneration: 3,
})

/** Accepted ranges. Generous enough to be useful, tight enough to stay honest. */
export const TRAINING_LIMITS = Object.freeze({
  generations: { min: 1, max: 500 },
  pairs: { min: 1, max: 64 },
  sigma: { min: 0.001, max: 1 },
  hubPrior: { min: -1, max: 1 },
  scenariosPerGeneration: { min: 1, max: 20 },
})

export const TRAINING_KNOBS = Object.freeze([
  'generations',
  'pairs',
  'sigma',
  'hubPrior',
  'scenariosPerGeneration',
] as const satisfies readonly (keyof TrainingConfig)[])

export type TrainingKnob = (typeof TRAINING_KNOBS)[number]

export const TRAINING_LABELS: Readonly<Record<TrainingKnob, string>> = Object.freeze({
  generations: 'Generations',
  pairs: 'Population pairs',
  sigma: 'Mutation size',
  hubPrior: 'Hub prior',
  scenariosPerGeneration: 'Scenarios per generation',
})

/** One-line help shown under each control. */
export const TRAINING_HINTS: Readonly<Record<TrainingKnob, string>> = Object.freeze({
  generations: 'How many improvement rounds to run. More is slower and usually steadier.',
  pairs: 'Matched plus/minus candidates per round. Population is twice this.',
  sigma: 'How far each candidate can wander from its parent. Bigger explores, and overshoots.',
  hubPrior: 'Starting lean toward the hub edge. 0 is neutral.',
  scenariosPerGeneration: 'Different practice boards sampled per round. More covers more ground, slower per round.',
})

/** `EsConfig` minus the four knobs this panel owns. */
export type EsConfigBase = Omit<EsConfig, 'generations' | 'pairs' | 'sigma' | 'trainScenariosPerGen'>

/** Population actually evaluated per generation — `EsConfig` uses antithetic pairs. */
export function populationSize(config: TrainingConfig): number {
  return config.pairs * 2
}

/**
 * The single handoff from this panel into the trainer.
 *
 * Spreads `base` so anything the panel does not own (parent checkpoint,
 * context, validation seeds, seed, evaluator) survives untouched, then
 * overrides exactly the four `EsConfig` knobs this screen controls.
 *
 * `hubPrior` is absent on purpose: it is not an `EsConfig` field but a
 * checkpoint-seeding argument, so it is applied by `hubPriorSeed` when the
 * parent is built. Folding it in here would be a field the trainer ignores.
 */
export function toEsConfig(config: TrainingConfig, base: EsConfigBase): EsConfig {
  return {
    ...base,
    generations: config.generations,
    pairs: config.pairs,
    sigma: config.sigma,
    trainScenariosPerGen: config.scenariosPerGeneration,
  }
}

/** The `{ hubPrior }` seeding argument `extendCheckpointForTimetable` expects. */
export function hubPriorSeed(config: TrainingConfig): { hubPrior: number } {
  return { hubPrior: config.hubPrior }
}

/** Why `config` cannot be used, in the same plain language as the build screen. */
export function configErrors(config: Partial<TrainingConfig>): string[] {
  const errors: string[] = []
  for (const knob of TRAINING_KNOBS) {
    const value = config[knob]
    const { min, max } = TRAINING_LIMITS[knob]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${TRAINING_LABELS[knob]} must be a number`)
    } else if (value < min || value > max) {
      errors.push(`${TRAINING_LABELS[knob]} must be between ${min} and ${max}`)
    }
  }
  return errors
}

export function isValidTrainingConfig(config: unknown): config is TrainingConfig {
  if (typeof config !== 'object' || config === null) return false
  return configErrors(config as Partial<TrainingConfig>).length === 0
}

/** Clamp one knob into its range and round it the way that knob expects. */
export function setKnob(config: TrainingConfig, knob: TrainingKnob, raw: number): TrainingConfig {
  const { min, max } = TRAINING_LIMITS[knob]
  if (!Number.isFinite(raw)) return config
  const clamped = Math.min(max, Math.max(min, raw))
  // Counts are whole; sigma is a fraction and hubPrior may be negative.
  const value = knob === 'sigma' ? Math.round(clamped * 1000) / 1000 : Math.round(clamped)
  const next = { ...config, [knob]: value }
  return configErrors(next).length === 0 ? next : config
}

/** Reset to the builder defaults. */
export function resetTrainingConfig(): TrainingConfig {
  return { ...DEFAULT_TRAINING_CONFIG }
}

/**
 * Rough cost of a run, in candidate evaluations. It is `generations ×
 * population`, because `trainES` scores every antithetic pair each generation.
 * Purely an estimate for the readout — it is what scales the wait, so a player
 * can see the cost of a change before they commit to it.
 */
export function estimatedEvaluations(config: TrainingConfig): number {
  return config.generations * populationSize(config)
}

/** Plain-language readout. No knob ids, no unit soup. */
export function describeTrainingConfig(config: TrainingConfig): string {
  const evals = estimatedEvaluations(config)
  const perGeneration = populationSize(config)
  const breadth = config.scenariosPerGeneration <= 1
    ? 'one scenario, so it can overfit that board'
    : `${config.scenariosPerGeneration} scenarios per round, so it should not overfit a single board`
  const size = evals >= 2000 ? 'a long run' : evals >= 500 ? 'a medium run' : 'a short run'
  const mutation = config.sigma > 0.3
    ? 'wide mutation, which explores fast but can overshoot'
    : config.sigma < 0.03
      ? 'tight mutation, which refines but can stall early'
      : 'steady mutation'
  return `${config.generations} generations of ${perGeneration} candidates (${size}, about ${evals.toLocaleString('en-US')} match evaluations), ${breadth}. ${mutation.charAt(0).toUpperCase()}${mutation.slice(1)}.`
}

// -------------------------------------------------------------- persistence

export const TRAINING_STORAGE_KEY = 'clawdy_training_config_v1'

/** Serialise for localStorage / JSON export. Refuses an unusable config. */
export function serializeTrainingConfig(config: TrainingConfig): string {
  const errors = configErrors(config)
  if (errors.length > 0) throw new Error(`Refusing to save an invalid training config: ${errors.join('; ')}`)
  return JSON.stringify(config)
}

/**
 * Parse a stored config.
 *
 * Additive and versioned (ground rule 2): a config saved before a knob existed
 * is missing that field, so every field falls back to its default instead of
 * the whole value being discarded. Anything genuinely unusable — malformed JSON,
 * out-of-range numbers — resolves to the defaults rather than throwing, for the
 * same reason `parseBuild` does: a stored string must never wedge the panel.
 */
export function parseTrainingConfig(raw: string | null | undefined): TrainingConfig {
  if (!raw) return resetTrainingConfig()
  try {
    const parsed = JSON.parse(raw) as Partial<TrainingConfig>
    const merged = { ...DEFAULT_TRAINING_CONFIG }
    for (const knob of TRAINING_KNOBS) {
      const value = parsed?.[knob]
      if (typeof value === 'number' && Number.isFinite(value)) merged[knob] = value
    }
    const clamped = configErrors(merged).length === 0 ? merged : resetTrainingConfig()
    return { ...clamped }
  } catch {
    return resetTrainingConfig()
  }
}