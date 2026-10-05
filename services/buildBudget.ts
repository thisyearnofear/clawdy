/**
 * Stat-budget affordances for the Build screen (Stream B, docs/LEAGUE_PLAN.md).
 *
 * ## Relationship to `services/chassis.ts` (Stream A)
 *
 * `chassis.ts` owns the contract and is authoritative: the flat stat cap, the
 * per-axis integer range, the module slots, and `validateBuild`. This module
 * does not redefine any of that. It re-exports the pieces the UI needs and adds
 * only the two things `chassis.ts` deliberately leaves to the presentation
 * layer:
 *
 *  1. **An escalating marginal cost curve** over the small discretionary
 *     budget, so the sliders express a real tradeoff instead of a flat buy.
 *  2. **Clamping and save/load helpers**, so the UI cannot offer a build the
 *     sim would reject.
 *
 * `chassis.ts` validates the flat total because the sim only cares about the
 * final stat vector. That is the right rule for the authority. It is not by
 * itself a rule for *how a player spends three points*, which is a UX
 * decision — that is what lives here.
 *
 * ## The cost curve
 *
 * Stream A's budget is 3 discretionary points on top of an 11-point chassis
 * base. The marginal cost of the n-th point added to the same axis is n, so:
 *
 *   axis spend = 0 → 0   1 → 1   2 → 3   3 → 6
 *
 * The first point is cheap, the second costs as much as the first two together,
 * and no axis can take all three. Within a 3-point budget that yields exactly
 * the tradeoff the screen exists to teach: spread thin and stay balanced, or
 * double down on one axis and pay for it. This is the D&D point-buy shape
 * (escalating marginal cost per step), chosen over a logarithmic curve because
 * logs diminish "fast and hard" and need per-game tuning, while an integer
 * curve is legible on a slider ("the next one costs 2") and trivially
 * reversible.
 *
 * Lowering an axis below its chassis base refunds its points to the budget, so
 * "give up 2 hardiness to buy 2 speed" is expressible. The flat cap in
 * `validateBuild` is therefore always respected by construction, and
 * `affordableBuild` is the hard guarantee the UI leans on.
 */

import {
  ACTIVE_AXES,
  axisSpend,
  budgetSpent,
  CHASSIS_BASE,
  CHASSIS_IDS,
  CHASSIS_TOTAL,
  DEFAULT_BUILD,
  MODULE_IDS,
  MODULE_SLOTS,
  STAT_AXES,
  STAT_BUDGET,
  STAT_MAX,
  baseBuild,
  buildToTraits,
  describeBuild as describeBuildTraits,
  validateBuild,
  type Build,
  type ChassisId,
  type ModuleId,
  type StatAxis,
} from './chassis'

export {
  ACTIVE_AXES,
  axisSpend,
  budgetSpent,
  CHASSIS_BASE,
  CHASSIS_IDS,
  CHASSIS_TOTAL,
  DEFAULT_BUILD,
  MODULE_IDS,
  MODULE_SLOTS,
  STAT_AXES,
  STAT_BUDGET,
  STAT_MAX,
  baseBuild,
  buildToTraits,
  validateBuild,
}
export type { Build, ChassisId, ModuleId, StatAxis }

/** Player-facing axis names. A raw axis id is never a heading. */
export const STAT_LABELS: Record<StatAxis, string> = {
  navigation: 'Navigation',
  speed: 'Speed',
  hardiness: 'Hardiness',
  defence: 'Defence',
  attack: 'Attack',
}

export const MODULE_LABELS: Record<ModuleId, string> = {
  'wide-sensor': 'Wide sensor',
  armour: 'Armour',
  'ram-plate': 'Ram plate',
  'extra-cell': 'Extra cell',
}

export const CHASSIS_LABELS: Record<ChassisId, string> = {
  scout: 'Scout',
  hauler: 'Hauler',
  raider: 'Raider',
}

/**
 * Axes that change the simulation today, per Stream A's `ACTIVE_AXES`.
 * Anything outside this set is spendable but inert, and the readout says so
 * rather than implying an effect the sim does not produce (ground rule 4).
 */
export const INERT_AXES: readonly StatAxis[] = STAT_AXES.filter(axis => !ACTIVE_AXES.includes(axis))

/** The chassis base line for `axis`, which is the reference every spend is measured against. */
export function baseFor(chassis: ChassisId, axis: StatAxis): number {
  return CHASSIS_BASE[chassis]?.[axis] ?? 0
}

/** Signed points of `axis` relative to its chassis base: positive is spend, negative is a refund. */
export function discretionaryPoints(axis: StatAxis, points: number, chassis: ChassisId = DEFAULT_BUILD.chassis): number {
  return (points ?? 0) - baseFor(chassis, axis)
}

/** Points refunded to the budget by lowering axes below this build's chassis base. */
export function refundedPoints(build: Build): number {
  return STAT_AXES.reduce((sum, axis) => {
    const delta = discretionaryPoints(axis, build.points[axis], build.chassis)
    return sum + (delta < 0 ? -delta : 0)
  }, 0)
}

/**
 * Marginal cost of the n-th point added to a single axis on top of its base.
 * n is 1-indexed: the first point costs 1, the second 2, the third 3.
 *
 * The accumulated curve is `chassis.axisSpend` (1 + 2 + ... + n), which is the
 * server-authoritative implementation. This mirrors only the *marginal* step so
 * a slider can label "the next one costs N"; there is deliberately no second
 * copy of the accumulation.
 */
export function marginalCost(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error(`n must be a non-negative integer, got ${n}`)
  return n
}

/** Discrete running totals, handy for the slider label and for tests. */
export const AXIS_SPEND = [0, 1, 3, 6] as const

export function remainingBudget(build: Build): number {
  return STAT_BUDGET - budgetSpent(build)
}

/**
 * The highest level `axis` can reach in `build` without exceeding the budget or
 * `STAT_MAX`. A slider reads this as its `max`, so a drag can never overspend.
 */
export function maxAffordableLevel(axis: StatAxis, build: Build): number {
  const base = baseFor(build.chassis, axis)
  let available = remainingBudget(build)
  // Start from the current level, not the base: a build that already holds a
  // point in this axis must be able to keep it, and raising a *second* point
  // from here costs `marginalCost(n)` where n is the points already held.
  const held = Math.max(0, discretionaryPoints(axis, build.points[axis], build.chassis))
  let level = Math.max(0, build.points[axis] ?? base)
  // Each accepted step must be *paid for*, not merely affordable one at a time,
  // otherwise this hands out every point in the budget on the first axis.
  for (let step = held + 1; level < STAT_MAX; step++) {
    const cost = marginalCost(step)
    if (cost > available) break
    available -= cost
    level += 1
  }
  return level
}

/**
 * The lowest level `axis` can drop to, so the UI never lets a player refund
 * more than the build actually holds.
 */
export function minLevel(axis: StatAxis, build: Build): number {
  return Math.min(0, CHASSIS_BASE[build.chassis][axis])
}

/**
 * Move one axis to `level`, clamped to what the budget allows, and reject the
 * move outright when it would make the build illegal. Returns the build
 * unchanged rather than throwing, so a slider mid-drag cannot wedge the panel.
 */
export function setAxisLevel(build: Build, axis: StatAxis, level: number): Build {
  if (!STAT_AXES.includes(axis)) return build
  const requested = Math.max(minLevel(axis, build), Math.round(level))
  const ceiling = maxAffordableLevel(axis, build)
  const clamped = Math.max(minLevel(axis, build), Math.min(requested, ceiling))
  const next: Build = { ...build, points: { ...build.points, [axis]: clamped } }
  // The clamp is the guarantee; this is the belt-and-braces check that the
  // flat rule in `validateBuild` agrees with us.
  if (validateBuild(next).length > 0) return build
  return next
}

export function isValidBuild(build: unknown): build is Build {
  return validateBuild(build as Build).length === 0
}

/** Switching chassis resets to that chassis's base, discarding spend. */
export function selectChassis(chassis: ChassisId): Build {
  return baseBuild(chassis)
}

export function toggleModule(build: Build, id: ModuleId): Build {
  const has = build.modules.includes(id)
  if (has) return { ...build, modules: build.modules.filter(existing => existing !== id) }
  if (build.modules.length >= MODULE_SLOTS) return build
  const next: Build = { ...build, modules: [...build.modules, id] }
  return validateBuild(next).length === 0 ? next : build
}

/**
 * Every build reachable from `build` by one legal axis move, for tests and for
 * a future "spend it differently" suggestion.
 */
export function affordableBuild(build: Build): Build {
  return STAT_AXES.reduce((acc, axis) => setAxisLevel(acc, axis, maxAffordableLevel(axis, acc)), build)
}

// ------------------------------------------------------------------ readout

/**
 * The pre-match readout: Stream A's trait-derived summary, plus the tradeoff
 * that their trait mapping deliberately does not express.
 *
 * Their `describeBuild` is derived from `buildToTraits`, i.e. from the numbers
 * the sim will actually use, which is the honest base for any claim we make.
 * This wraps rather than replaces it, adding the budget story ("you have 1
 * point left") and flagging axes that are spendable but inert.
 */
export function describeBuildSummary(build: Build): string {
  // Stream A's `describeBuild` derives from `buildToTraits`, which *throws* on
  // an invalid build. The readout sits next to the error list in the same
  // render, so it must not throw there: an illegal build gets a readable line
  // and the error alert below carries the detail.
  const invalid = validateBuild(build)
  const traits = invalid.length === 0 ? describeBuildTraits(build) : 'This build is not legal yet'
  const clauses: string[] = [traits]

  const inert = STAT_AXES.filter(axis => (build.points[axis] ?? 0) > 0 && INERT_AXES.includes(axis))
  if (inert.length > 0) {
    clauses.push(`${inert.map(axis => STAT_LABELS[axis].toLowerCase()).join(' and ')} spend does nothing in this sim yet — it is roadmap, not a strength`)
  }
  const free = (build.modules ?? []).filter(id => !['armour', 'ram-plate'].includes(id))
  if (free.length > 0) {
    clauses.push(`${free.map(id => MODULE_LABELS[id].toLowerCase()).join(' and ')} ${free.length > 1 ? 'have' : 'has'} no simulation effect yet`)
  }

  const left = remainingBudget(build)
  if (left > 0) clauses.push(`${left} point${left === 1 ? '' : 's'} unspent`)
  else if (left < 0) clauses.push(`${-left} point${left === -1 ? '' : 's'} over budget`)
  else clauses.push('every point is spent')

  return `${clauses.join('. ')}.`
}

// -------------------------------------------------------------- persistence

export const BUILD_STORAGE_KEY = 'clawdy_build_v1'

/** Serialise for localStorage / JSON export. */
export function serializeBuild(build: Build): string {
  const errors = validateBuild(build)
  if (errors.length > 0) throw new Error(`Refusing to save an invalid build: ${errors.join('; ')}`)
  return JSON.stringify(build)
}

/**
 * Parse a stored build. A brain saved before this screen existed has no build,
 * so a missing or malformed value must resolve to the default rather than
 * throwing — the same additive-and-versioned rule the checkpoint format uses.
 */
export function parseBuild(raw: string | null | undefined): Build {
  if (!raw) return baseBuild(DEFAULT_BUILD.chassis)
  try {
    const parsed = JSON.parse(raw) as Build
    return validateBuild(parsed).length === 0 ? parsed : baseBuild(DEFAULT_BUILD.chassis)
  } catch {
    return baseBuild(DEFAULT_BUILD.chassis)
  }
}
