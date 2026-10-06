'use client'

import { useId, useMemo } from 'react'
import {
  baseBuild,
  budgetErrors,
  CHASSIS_BASE,
  CHASSIS_IDS,
  CHASSIS_LABELS,
  describeBuildSummary,
  INERT_AXES,
  marginalCost,
  STAT_AXES,
  STAT_BUDGET,
  STAT_HINTS,
  STAT_LABELS,
  maxAffordableLevel,
  MODULE_HINTS,
  MODULE_IDS,
  MODULE_LABELS,
  MODULE_SLOTS,
  remainingBudget,
  setAxisLevel,
  STAT_MAX,
  toggleModule,
  type Build,
} from '../../services/buildBudget'
import type { RulesetId } from '../../services/chassis'
import { PROVERBS, useFlavourZh, withProverb } from '../../services/flavour'
import { chassisRuleSummary } from '../../services/workbenchRuleset'
import styles from '../environment/ArenaScene.module.css'

/**
 * The Build screen (Stream B, docs/LEAGUE_PLAN.md).
 *
 * Presentational only: every number here comes from `services/buildBudget.ts`,
 * which is why the over-budget rule is enforced by a function and tested, not
 * by this component. If a slider cannot overspend it is because
 * `maxAffordableLevel` refused to offer the level, not because a stylesheet
 * greys the input out.
 *
 * The alert reads `budgetErrors`, not `validateBuild`, because the league's gate
 * (`legalLeagueBuild`) is the flat cap *and* the escalating curve. Announcing
 * only the flat cap would let a player finish a build the league will refuse to
 * race with no warning on screen.
 *
 * Accessibility follows the research: a native `input[type=range]` already
 * exposes value/min/max to assistive tech, and `aria-valuetext` carries the
 * meaning a bare number cannot ("Battery 4, next point costs 2"). The readout is
 * an `aria-live` region so the consequence of a change is announced, not just
 * drawn.
 */
export function BuildScreen({
  build,
  onChange,
  disabled = false,
  rulesetId,
}: {
  build: Build
  onChange: (next: Build) => void
  disabled?: boolean
  rulesetId?: RulesetId
}) {
  const headingId = useId()
  const flavourZh = useFlavourZh()
  const errors = useMemo(() => budgetErrors(build), [build])
  const remaining = remainingBudget(build)
  const blocked = errors.length > 0

  return (
    <section className={styles.buildScreen} aria-labelledby={headingId}>
      <h3 id={headingId}>Build for {rulesetId === 'skirmish' ? 'Skirmish' : 'Training Grounds'}</h3>
      <p className={styles.buildReadout}>{withProverb('Teach to the student: pick the chassis that fits how you want to coach.', PROVERBS.student, flavourZh)}</p>
      <p className={styles.buildReadout}>
        {rulesetId === 'skirmish'
          ? 'Your build applies to this unranked preview. The house rival uses a base Hauler.'
          : 'This course keeps the original rules. Your chassis changes its look here; build stats apply in build-enabled matches.'}
      </p>
      <div className={styles.buildChassisRow} role="radiogroup" aria-labelledby={headingId}>
        {CHASSIS_IDS.map(id => {
          const selected = build.chassis === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={styles.chassisPicker}
              data-selected={selected}
              disabled={disabled}
              onClick={() => onChange(baseBuild(id))}
            >
              <strong>{CHASSIS_LABELS[id]}</strong>
              <span>
                {CHASSIS_BASE[id].speed} speed · {CHASSIS_BASE[id].hardiness} battery
              </span>
              <span>{chassisRuleSummary(id, rulesetId)}</span>
            </button>
          )
        })}
      </div>

      <div className={styles.buildBudgetRow}>
        <strong>
          {remaining < 0 ? `${-remaining} over the ${STAT_BUDGET}-point budget` : `${remaining} of ${STAT_BUDGET} points left`}
        </strong>
      </div>

      <div className={styles.buildStatList}>
        {STAT_AXES.map(axis => {
          const level = Math.min(build.points[axis] ?? 0, STAT_MAX)
          const held = Math.max(0, level - CHASSIS_BASE[build.chassis][axis])
          const nextCost = marginalCost(held + 1)
          const max = Math.min(maxAffordableLevel(axis, build), STAT_MAX)
          const inert = INERT_AXES.includes(axis)
          const label = `${STAT_LABELS[axis]} ${level} of ${STAT_MAX}${inert ? ', no effect in this sim yet' : ''}`
          return (
            <div key={axis} className={styles.buildStat} data-inert={inert}>
              <label htmlFor={`build-axis-${axis}`}>
                {STAT_LABELS[axis]}
                {inert && <em className={styles.buildRoadmapTag}>roadmap</em>}
              </label>
              <input
                id={`build-axis-${axis}`}
                type="range"
                min={0}
                max={max}
                step={1}
                value={level}
                disabled={disabled}
                aria-valuetext={label}
                aria-describedby={`build-axis-${axis}-cost`}
                onChange={e => onChange(setAxisLevel(build, axis, Number(e.target.value)))}
              />
              <span id={`build-axis-${axis}-cost`} className={styles.buildStatCost}>
                {level} · next costs {nextCost} · {STAT_HINTS[axis]}
              </span>
            </div>
          )
        })}
      </div>

      <div className={styles.buildModuleRow} role="group" aria-label={`Module slots, ${MODULE_SLOTS} available`}>
        {MODULE_IDS.map(id => {
          const active = build.modules.includes(id)
          return (
            <button
              key={id}
              type="button"
              className={styles.buildModuleChip}
              data-active={active}
              aria-pressed={active}
              title={MODULE_HINTS[id]}
              disabled={disabled || (!active && build.modules.length >= MODULE_SLOTS)}
              onClick={() => onChange(toggleModule(build, id))}
            >
              {MODULE_LABELS[id]}
            </button>
          )
        })}
      </div>

      <p className={styles.buildReadout} role="status" aria-live="polite">
        {describeBuildSummary(build)}
      </p>

      {blocked && (
        <ul className={styles.buildErrors} role="alert">
          {errors.map(message => <li key={message}>{message}</li>)}
        </ul>
      )}
    </section>
  )
}
