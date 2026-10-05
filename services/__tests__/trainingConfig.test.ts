import { describe, expect, it } from 'vitest'
import type { EsContext } from '../policyES'
import type { PolicyCheckpoint } from '../policyModel'
import {
  configErrors,
  DEFAULT_TRAINING_CONFIG,
  describeTrainingConfig,
  estimatedEvaluations,
  hubPriorSeed,
  isValidTrainingConfig,
  parseTrainingConfig,
  populationSize,
  resetTrainingConfig,
  serializeTrainingConfig,
  setKnob,
  TRAINING_KNOBS,
  TRAINING_LIMITS,
  toEsConfig,
  TRAINING_STORAGE_KEY,
  type EsConfigBase,
  type TrainingConfig,
} from '../trainingConfig'

/** Minimal stand-in for the non-negotiable `EsConfig` fields the panel does not own. */
function esBase(overrides: Partial<EsConfigBase> = {}): EsConfigBase {
  return {
    parent: { id: 'parent', name: 'p', version: 1, createdAt: '2026-01-01T00:00:00.000Z', weights: {}, biases: {} } as unknown as PolicyCheckpoint,
    context: {} as EsContext,
    // The ES step size (--lr 1) is not one of Stream B's five knobs, so the
    // base must carry it; the panel must not clobber it.
    learningRate: 1,
    validationSeeds: [1, 2, 3],
    seed: 7,
    ...overrides,
  }
}

describe('defaults reproduce the builder run (not a taste decision)', () => {
  it('matches the train-es.ts argument defaults', () => {
    // --gens 30 --pairs 8 --sigma 0.08 --hub-prior 0 --tasks 3
    expect(DEFAULT_TRAINING_CONFIG).toEqual({
      generations: 30,
      pairs: 8,
      sigma: 0.08,
      hubPrior: 0,
      scenariosPerGeneration: 3,
    })
  })

  it('hands trainES exactly the config the CLI builds from those defaults', () => {
    // The load-bearing anti-dead-UI test: an untouched panel must produce the
    // same EsConfig the CLI produces today.
    const es = toEsConfig(DEFAULT_TRAINING_CONFIG, esBase())
    expect(es.generations).toBe(30)
    expect(es.pairs).toBe(8)
    expect(es.sigma).toBe(0.08)
    expect(es.trainScenariosPerGen).toBe(3)
  })

  it('leaves everything the panel does not own untouched', () => {
    const base = esBase({ seed: 42 })
    const es = toEsConfig({ ...DEFAULT_TRAINING_CONFIG, generations: 99 }, base)
    expect(es.seed).toBe(42)
    expect(es.parent).toBe(base.parent)
    expect(es.context).toBe(base.context)
    expect(es.validationSeeds).toBe(base.validationSeeds)
    expect(es.learningRate).toBe(1)
  })

  it('reports population as twice the antithetic pairs, per EsConfig', () => {
    expect(populationSize({ ...DEFAULT_TRAINING_CONFIG, pairs: 8 })).toBe(16)
  })

  it('exposes the hub prior as checkpoint seeding, not as an EsConfig field', () => {
    // hubPrior is a --hub-prior arg for extendCheckpointForTimetable, not an
    // EsConfig field. Folding it into the EsConfig would be a dead field.
    expect(hubPriorSeed({ ...DEFAULT_TRAINING_CONFIG, hubPrior: 0.4 })).toEqual({ hubPrior: 0.4 })
    expect(Object.keys(toEsConfig(DEFAULT_TRAINING_CONFIG, esBase()))).not.toContain('hubPrior')
  })
})

describe('validation blocks unusable configs', () => {
  it('accepts the defaults and every knob at its range edges', () => {
    expect(configErrors(DEFAULT_TRAINING_CONFIG)).toEqual([])
    for (const knob of TRAINING_KNOBS) {
      const { min, max } = TRAINING_LIMITS[knob]
      expect(configErrors({ ...DEFAULT_TRAINING_CONFIG, [knob]: min }), knob).toEqual([])
      expect(configErrors({ ...DEFAULT_TRAINING_CONFIG, [knob]: max }), knob).toEqual([])
    }
  })

  it('rejects out-of-range and non-numeric values with a readable message', () => {
    expect(configErrors({ ...DEFAULT_TRAINING_CONFIG, generations: 0 }).join()).toMatch(/between 1 and 500/)
    expect(configErrors({ ...DEFAULT_TRAINING_CONFIG, pairs: 999 }).join()).toMatch(/between 1 and 64/)
    expect(configErrors({ ...DEFAULT_TRAINING_CONFIG, sigma: Number.NaN }).join()).toMatch(/must be a number/)
    expect(isValidTrainingConfig({ ...DEFAULT_TRAINING_CONFIG, hubPrior: -5 })).toBe(false)
  })

  it('clamps rather than throwing, so a slider mid-drag cannot wedge the panel', () => {
    const config = DEFAULT_TRAINING_CONFIG
    expect(setKnob(config, 'generations', 1e9).generations).toBe(TRAINING_LIMITS.generations.max)
    expect(setKnob(config, 'sigma', -3).sigma).toBe(TRAINING_LIMITS.sigma.min)
    expect(setKnob(config, 'generations', Number.NaN)).toBe(config)
  })

  it('rounds counts but keeps sigma and hubPrior fractional', () => {
    expect(setKnob(DEFAULT_TRAINING_CONFIG, 'pairs', 7.6).pairs).toBe(8)
    expect(setKnob(DEFAULT_TRAINING_CONFIG, 'sigma', 0.12345).sigma).toBe(0.123)
    expect(setKnob(DEFAULT_TRAINING_CONFIG, 'hubPrior', -0.25).hubPrior).toBe(-0)
  })

  it('resets to the builder defaults', () => {
    const dirty = setKnob(setKnob(DEFAULT_TRAINING_CONFIG, 'generations', 5), 'sigma', 0.5)
    expect(resetTrainingConfig()).toEqual(DEFAULT_TRAINING_CONFIG)
    expect(dirty).not.toEqual(resetTrainingConfig())
  })
})

describe('config round-trips through save and load (Stream B acceptance criterion)', () => {
  it('survives a JSON round-trip unchanged', () => {
    const original = setKnob(DEFAULT_TRAINING_CONFIG, 'generations', 120)
    expect(parseTrainingConfig(serializeTrainingConfig(original))).toEqual(original)
  })

  it('round-trips every knob at a distinct value, so no field is dropped', () => {
    const original: TrainingConfig = {
      generations: 77,
      pairs: 13,
      sigma: 0.456,
      hubPrior: -0.75,
      scenariosPerGeneration: 11,
    }
    expect(parseTrainingConfig(serializeTrainingConfig(original))).toEqual(original)
  })

  it('falls back to the defaults for missing or malformed data (additive rule)', () => {
    expect(parseTrainingConfig(null)).toEqual(DEFAULT_TRAINING_CONFIG)
    expect(parseTrainingConfig(undefined)).toEqual(DEFAULT_TRAINING_CONFIG)
    expect(parseTrainingConfig('{not json')).toEqual(DEFAULT_TRAINING_CONFIG)
    expect(parseTrainingConfig('null')).toEqual(DEFAULT_TRAINING_CONFIG)
    expect(parseTrainingConfig('[]')).toEqual(DEFAULT_TRAINING_CONFIG)
  })

  it('fills in a knob added by a later version instead of discarding the config', () => {
    // Additive and versioned (ground rule 2): a config saved before
    // `scenariosPerGeneration` existed must keep the other four values.
    const legacy = JSON.stringify({ generations: 99, pairs: 4, sigma: 0.2, hubPrior: 0.5 })
    const parsed = parseTrainingConfig(legacy)
    expect(parsed.generations).toBe(99)
    expect(parsed.pairs).toBe(4)
    expect(parsed.sigma).toBe(0.2)
    expect(parsed.hubPrior).toBe(0.5)
    expect(parsed.scenariosPerGeneration).toBe(DEFAULT_TRAINING_CONFIG.scenariosPerGeneration)
  })

  it('drops non-numeric and out-of-range stored values rather than trusting them', () => {
    const parsed = parseTrainingConfig(JSON.stringify({ ...DEFAULT_TRAINING_CONFIG, generations: 'lots', sigma: 99 }))
    expect(parsed.generations).toBe(DEFAULT_TRAINING_CONFIG.generations)
    expect(parsed.sigma).toBe(DEFAULT_TRAINING_CONFIG.sigma)
  })

  it('refuses to serialise an invalid config', () => {
    expect(() => serializeTrainingConfig({ ...DEFAULT_TRAINING_CONFIG, generations: 0 }))
      .toThrow(/Refusing to save an invalid training config/)
  })

  it('uses its own storage key, separate from the build', () => {
    expect(TRAINING_STORAGE_KEY).toBe('clawdy_training_config_v1')
  })
})

describe('readout honesty (ground rule 4)', () => {
  it('describes cost in real candidate evaluations', () => {
    expect(estimatedEvaluations({ ...DEFAULT_TRAINING_CONFIG, generations: 30, pairs: 8 })).toBe(480)
    expect(describeTrainingConfig(DEFAULT_TRAINING_CONFIG)).toMatch(/30 generations of 16 candidates/)
    expect(describeTrainingConfig(DEFAULT_TRAINING_CONFIG)).toMatch(/480/)
  })

  it('warns that a single scenario can overfit, rather than hiding it', () => {
    const narrow = { ...DEFAULT_TRAINING_CONFIG, scenariosPerGeneration: 1 }
    expect(describeTrainingConfig(narrow)).toMatch(/overfit/)
  })

  it('flags wide and tight mutation in plain words', () => {
    expect(describeTrainingConfig({ ...DEFAULT_TRAINING_CONFIG, sigma: 0.9 })).toMatch(/overshoot/)
    expect(describeTrainingConfig({ ...DEFAULT_TRAINING_CONFIG, sigma: 0.001 })).toMatch(/stall/)
  })

  it('never leaks a knob id into player-facing copy', () => {
    const text = describeTrainingConfig(setKnob(setKnob(DEFAULT_TRAINING_CONFIG, 'generations', 50), 'sigma', 0.4))
    // Plain English is fine ("50 generations"); what must never surface is a raw
    // camelCase field name or a `key: value` pair, which is the internal shape.
    expect(text).not.toMatch(/scenariosPerGeneration|hubPrior/)
    expect(text).not.toMatch(/\w+:\s*-?[\d.]/)
    for (const knob of TRAINING_KNOBS.filter(name => /[A-Z]/.test(name))) {
      expect(text).not.toContain(knob)
    }
  })

  it('always returns non-empty copy', () => {
    expect(describeTrainingConfig(DEFAULT_TRAINING_CONFIG).trim().length).toBeGreaterThan(0)
  })
})