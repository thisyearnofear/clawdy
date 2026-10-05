import type { ArenaScenario, EntrantTraits } from './arenaEpisode'
import { ArenaRunner, type EntrantPolicyOption } from './arenaPolicy'
import { computeWeightsHash, POLICY_SCHEMA_VERSION, type PolicyCheckpoint, type PolicyWeights } from './policyModel'
import { createRng, gaussian } from './rng'
import { rushVariant, swapSides, type RushVariantKind } from './rushVariants'

/**
 * Evolution strategies over a checkpoint's weights.
 *
 * Why ES and not more supervised learning: imitation can only copy its teacher
 * (the repo's own eval shows the trained rover ties or trails the safe
 * teacher). ES optimises what we actually care about, banked margin against
 * real opponents on unseen Rush maps, with no gradients, so it runs on the
 * headless simulator in a worker and reports a fitness curve while it goes.
 */

// ---------------------------------------------------------------- weights

type Layer = { weights: number[][]; biases: number[] }

function layersOf(weights: PolicyWeights): Layer[] {
  if (!weights.edgeHead) throw new Error('ES needs a v3 checkpoint with an edge head')
  return [weights.hidden1, weights.hidden2, weights.actionHead, weights.edgeHead]
}

export function flattenWeights(weights: PolicyWeights): Float64Array {
  const out: number[] = []
  for (const layer of layersOf(weights)) {
    for (const row of layer.weights) out.push(...row)
    out.push(...layer.biases)
  }
  return Float64Array.from(out)
}

/** Rebuild weights with the template's shapes from a flat vector. */
export function weightsFromVector(template: PolicyWeights, vector: ArrayLike<number>): PolicyWeights {
  let cursor = 0
  const take = (count: number) => {
    const slice = Array.from({ length: count }, (_, index) => vector[cursor + index])
    cursor += count
    return slice
  }
  const rebuild = (layer: Layer): Layer => ({
    weights: layer.weights.map(row => take(row.length)),
    biases: take(layer.biases.length),
  })
  const next: PolicyWeights = {
    hidden1: rebuild(template.hidden1),
    hidden2: rebuild(template.hidden2),
    actionHead: rebuild(template.actionHead),
    edgeHead: rebuild(template.edgeHead!),
  }
  if (cursor !== vector.length) throw new Error(`weight vector length mismatch (used ${cursor} of ${vector.length})`)
  return next
}

export function checkpointFromVector(
  parent: PolicyCheckpoint,
  vector: ArrayLike<number>,
  meta: { name: string; generation: number; fitness: number; matches: number; seed: number },
): PolicyCheckpoint {
  const weights = weightsFromVector(parent.weights, vector)
  const weightsHash = computeWeightsHash(weights)
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id: `es-g${meta.generation}-${weightsHash.slice(-6)}`,
    name: meta.name,
    parentCheckpointId: parent.id,
    createdAt: new Date().toISOString(),
    weightsHash,
    trainingSummary: {
      epochs: meta.generation,
      loss: Math.round(-meta.fitness * 10000) / 10000,
      sampleCount: meta.matches,
      datasetHash: `es-seed-${meta.seed}`,
      accuracy: 0,
    },
    weights,
  }
}

// ---------------------------------------------------------------- fitness

/** One scored match-up: a seeded Rush variant against pool opponent `opponent`, both sides. */
export interface EsTask {
  kind: RushVariantKind
  seed: number
  opponent: number
}

export interface EsContext {
  rushBase: ArenaScenario
  opponents: EntrantPolicyOption[]
  /** Build traits for the scored rover, so worker threads train and score the same chassis. */
  traits?: EntrantTraits
}

export interface EsScore {
  /** Mean per-match fitness: banked margin plus a win/loss bonus. */
  fitness: number
  /** Mean banked margin alone (own minus rival). */
  margin: number
  /** Mean banked by the scored rover / by its opponent. */
  ownBanked: number
  foeBanked: number
  wins: number
  losses: number
  matches: number
}

const WIN_BONUS = 1.5

export function scoreCheckpoint(checkpoint: PolicyCheckpoint, tasks: readonly EsTask[], context: EsContext, traits?: EntrantTraits): EsScore {
  const option: EntrantPolicyOption = { strategy: 'learned', checkpoint }
  traits ??= context.traits
  let fitness = 0, margin = 0, own = 0, foeTotal = 0, wins = 0, losses = 0, matches = 0
  for (const task of tasks) {
    const opponent = context.opponents[task.opponent]
    if (!opponent) throw new Error(`Unknown opponent index ${task.opponent}`)
    const variant = rushVariant(context.rushBase, task.kind, task.seed)
    for (const played of [variant, swapSides(variant)]) {
      // The scored brain is always the champion slot; a build's traits ride
      // with it on both sides. `undefined` runs the pinned rover unchanged.
      const scenario = traits ? { ...played, entrants: [{ ...played.entrants[0], traits }, played.entrants[1]] } : played
      const runner = new ArenaRunner(scenario, { champion: option, rival: opponent }, undefined, { record: false })
      runner.advanceTicks(scenario.durationTicks)
      const snap = runner.snapshot()
      const ownBanked = snap.agents.find(agent => agent.id === 'champion')!.banked
      const foe = snap.agents.find(agent => agent.id === 'rival')!.banked
      const diff = ownBanked - foe
      own += ownBanked
      foeTotal += foe
      margin += diff
      fitness += diff + (diff > 0 ? WIN_BONUS : diff < 0 ? -WIN_BONUS : 0)
      if (diff > 0) wins++
      else if (diff < 0) losses++
      matches++
    }
  }
  return { fitness: fitness / matches, margin: margin / matches, ownBanked: own / matches, foeBanked: foeTotal / matches, wins, losses, matches }
}

// ------------------------------------------------------------------- loop

/** Scores many candidates on the same tasks (common random numbers). */
export type EsEvaluator = (
  checkpoints: readonly PolicyCheckpoint[],
  tasks: readonly EsTask[],
) => Promise<EsScore[]>

export interface EsConfig {
  parent: PolicyCheckpoint
  context: EsContext
  generations: number
  /** Antithetic pairs per generation; population is twice this. */
  pairs: number
  sigma: number
  /** Step size in units of sigma. */
  learningRate: number
  trainScenariosPerGen: number
  /**
   * Opponent indices cycled through when picking training opponents. Repeat an
   * index to train against it more often (default: each opponent once).
   */
  opponentSchedule?: readonly number[]
  /** Seeds (train kind) for the fixed in-loop validation set. */
  validationSeeds: readonly number[]
  seed: number
  evaluator?: EsEvaluator
  name?: string
}

export interface EsProgress {
  generation: number
  /** Mean fitness of this generation's population on its training tasks. */
  mean: number
  /** Fitness of the current parent on the fixed validation set. */
  validation: EsScore
  /** Best validation fitness so far. */
  best: number
  /** Best-validated checkpoint so far. */
  checkpoint: PolicyCheckpoint
  elapsedMs: number
}

export const inProcessEvaluator = (context: EsContext): EsEvaluator => async (checkpoints, tasks) =>
  checkpoints.map(checkpoint => scoreCheckpoint(checkpoint, tasks, context))

function centeredRanks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index)
  const ranks = new Array<number>(values.length)
  order.forEach(({ index }, rank) => { ranks[index] = values.length === 1 ? 0 : rank / (values.length - 1) - 0.5 })
  return ranks
}

export async function* trainES(config: EsConfig): AsyncGenerator<EsProgress> {
  const evaluate = config.evaluator ?? inProcessEvaluator(config.context)
  const rng = createRng(config.seed)
  const name = config.name ?? 'ES champion'
  const dimension = flattenWeights(config.parent.weights).length
  const theta = flattenWeights(config.parent.weights)
  const validationTasks: EsTask[] = config.validationSeeds.flatMap(seed =>
    config.context.opponents.map((_, opponent) => ({ kind: 'train' as const, seed, opponent })))
  const schedule = config.opponentSchedule?.length ? config.opponentSchedule : config.context.opponents.map((_, index) => index)
  const started = Date.now()

  const asCheckpoint = (vector: ArrayLike<number>, generation: number, score: EsScore) =>
    checkpointFromVector(config.parent, vector, { name, generation, fitness: score.fitness, matches: score.matches, seed: config.seed })

  const best = (await evaluate([config.parent], validationTasks))[0]
  let bestCheckpoint = config.parent
  let bestFitness = best.fitness

  for (let generation = 1; generation <= config.generations; generation++) {
    const noise = Array.from({ length: config.pairs }, () => Float64Array.from({ length: dimension }, () => gaussian(rng)))
    const population: PolicyCheckpoint[] = []
    for (const eps of noise) {
      for (const sign of [1, -1]) {
        const candidate = theta.map((value, index) => value + sign * config.sigma * eps[index])
        population.push(asCheckpoint(candidate, generation, { fitness: 0, margin: 0, ownBanked: 0, foeBanked: 0, wins: 0, losses: 0, matches: 0 }))
      }
    }
    const tasks: EsTask[] = Array.from({ length: config.trainScenariosPerGen }, (_, index) => ({
      kind: 'train' as const,
      seed: 1000 + generation * config.trainScenariosPerGen + index,
      opponent: schedule[(generation * config.trainScenariosPerGen + index) % schedule.length],
    }))
    const scores = await evaluate(population, tasks)
    const fitnesses = scores.map(score => score.fitness)
    const utilities = centeredRanks(fitnesses)
    for (let index = 0; index < dimension; index++) {
      let gradient = 0
      for (let pair = 0; pair < config.pairs; pair++) {
        gradient += (utilities[2 * pair] - utilities[2 * pair + 1]) * noise[pair][index]
      }
      theta[index] += config.learningRate * config.sigma * (gradient / config.pairs)
    }

    const current = checkpointFromVector(config.parent, theta, { name, generation, fitness: 0, matches: 0, seed: config.seed })
    const validation = (await evaluate([current], validationTasks))[0]
    if (validation.fitness > bestFitness) {
      bestFitness = validation.fitness
      bestCheckpoint = asCheckpoint(theta, generation, validation)
    }
    yield {
      generation,
      mean: fitnesses.reduce((sum, value) => sum + value, 0) / fitnesses.length,
      validation,
      best: bestFitness,
      checkpoint: bestCheckpoint,
      elapsedMs: Date.now() - started,
    }
  }
}
