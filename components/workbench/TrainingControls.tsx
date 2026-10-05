'use client'

import { useId, useMemo } from 'react'
import {
  configErrors,
  DEFAULT_TRAINING_CONFIG,
  describeTrainingConfig,
  resetTrainingConfig,
  setKnob,
  TRAINING_HINTS,
  TRAINING_KNOBS,
  TRAINING_LABELS,
  TRAINING_LIMITS,
  type TrainingConfig,
  type TrainingKnob,
} from '../../services/trainingConfig'
import styles from '../environment/ArenaScene.module.css'

/**
 * Training controls (Stream B, docs/LEAGUE_PLAN.md): generations, population
 * size, mutation, hub prior, and scenario mix.
 *
 * Presentational only, exactly like `BuildScreen`: every number comes from
 * `services/trainingConfig.ts`, so the panel cannot drift from the trainer.
 *
 * This configures the **evolution-strategy builder**, not the frozen browser
 * Coach-train optimizer. The Train button keeps its pinned
 * 60 epochs / 0.008 / 0.5x-at-30 config, which `versions.test.ts` guards and
 * which the eval pin reproduces; nothing here touches it.
 *
 * Accessibility follows the same rules as the build sliders: a native
 * `input[type=range]` already exposes value/min/max, so `aria-valuetext`
 * carries what the bare number cannot ("Generations 30 of 500") and the hint is
 * wired through `aria-describedby` rather than left as unlabelled prose.
 */
export function TrainingControls({
  config,
  onChange,
  disabled = false,
}: {
  config: TrainingConfig
  onChange: (next: TrainingConfig) => void
  disabled?: boolean
}) {
  const headingId = useId()
  const errors = useMemo(() => configErrors(config), [config])
  const dirty = TRAINING_KNOBS.some(knob => config[knob] !== DEFAULT_TRAINING_CONFIG[knob])

  const stepFor = (knob: TrainingKnob): number => {
    const { min, max } = TRAINING_LIMITS[knob]
    // Keep a slider's native step meaningful: small ranges get a fine step so
    // sigma and hubPrior are actually reachable by keyboard.
    const span = max - min
    return knob === 'sigma' ? Math.max(0.001, Math.round(span / 1000)) : 1
  }

  return (
    <section className={styles.buildScreen} aria-labelledby={headingId}>
      <div className={styles.buildBudgetRow}>
        <strong id={`${headingId}-summary`}>{describeTrainingConfig(config)}</strong>
        <button
          type="button"
          className={styles.actionButtonSmall}
          onClick={() => onChange(resetTrainingConfig())}
          disabled={disabled || !dirty}
        >
          Reset to builder defaults
        </button>
      </div>

      <div className={styles.buildStatList}>
        {TRAINING_KNOBS.map(knob => {
          const { min, max } = TRAINING_LIMITS[knob]
          const value = config[knob]
          const id = `training-${knob}`
          return (
            <div key={knob} className={styles.buildStat}>
              <label htmlFor={id}>{TRAINING_LABELS[knob]}</label>
              <input
                id={id}
                type="range"
                min={min}
                max={max}
                step={stepFor(knob)}
                value={value}
                disabled={disabled}
                aria-valuetext={`${TRAINING_LABELS[knob]} ${value} of ${max}`}
                aria-describedby={`${id}-hint`}
                onChange={e => onChange(setKnob(config, knob, Number(e.target.value)))}
              />
              <span id={`${id}-hint`} className={styles.buildStatCost}>
                {value} · {TRAINING_HINTS[knob]}
              </span>
            </div>
          )
        })}
      </div>

      {dirty && (
        <p className={styles.buildRoadmapTag} role="status" aria-live="polite">
          Changed from the builder defaults — a scripted sweep will use these instead.
        </p>
      )}

      {errors.length > 0 && (
        <ul className={styles.buildErrors} role="alert">
          {errors.map(message => <li key={message}>{message}</li>)}
        </ul>
      )}
    </section>
  )
}