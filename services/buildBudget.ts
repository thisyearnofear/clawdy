/**
 * Stat-budget affordances for the Build screen (Stream B, docs/LEAGUE_PLAN.md).
 *
 * ## Relationship to `services/chassis.ts` (Stream A)
 *
 * `chassis.ts` owns the contract and is authoritative: the per-axis integer
 * range, the module slots, `validateBuild`'s flat stat cap, and the escalating
 * `axisSpend`/`budgetSpent` curve. This module does not redefine any of that.
 * It re-exports the pieces the UI needs and adds only the two things
 * `chassis.ts` deliberately leaves to the presentation layer:
 *
 *  1. **A marginal-cost label for sliders**, so a drag can say "the next one
 *     costs 2" without reimplementing the accumulation.
 *  2. **Clamping and save/load helpers**, so the UI cannot offer a build the
 *     league would reject.
 *
 * ## The legality gate is two checks, not one
 *
 * `validateBuild` enforces the *flat* total (the sim only cares about the final
 * stat vector), but the match authority in `services/ladderRunner.ts`
 * (`legalLeagueBuild`, reused by `convex/leagueRun.ts`) additionally rejects
 * anything over the escalating curve:
 *
 *     validateBuild(build).length > 0 || budgetSpent(build) > STAT_BUDGET
 *
 * So a hand-authored build can be flat-legal and still be unable to race. This
 * module treats **both** as the definition of "over budget" via `budgetErrors`,
 * and every guard below uses it, so the panel blocks a build at the point of
 * purchase rather than letting a player assemble something the league will
 * refuse with a message they cannot act on. The error string is deliberately
 * byte-identical to the server's, so the UI and the API say the same thing.
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
 * "give up 2 battery to buy 2 speed" is expressible. `affordableBuild` is the
 * hard guarantee the UI leans on: anything it produces satisfies `budgetErrors`.
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

/**
 * Player-facing axis names. Labels mirror the live sim traits from
 * `buildToTraits` (travel speed, battery / maxEnergy, bump / contactStrength)
 * so the Build screen does not advertise Hardiness / Defence / Attack as if
 * those were separate combat stats the episode does not have.
 */
export const STAT_LABELS: Record<StatAxis, string> = {
  navigation: 'Navigation',
  speed: 'Speed',
  hardiness: 'Battery',
  defence: 'Bump defence',
  attack: 'Bump attack',
}

/**
 * Short help under each slider: what the points actually buy in the sim.
 * Units are the live traits (travel multiplier, energy capacity, bump strength),
 * not the 0–6 allocation itself.
 */
export const STAT_HINTS: Record<StatAxis, string> = {
  navigation: 'No effect in this sim yet — roadmap spend',
  speed: 'Raises route travel rate vs the hauler baseline',
  hardiness: 'Raises battery capacity (energy before empty)',
  defence: 'Adds to bump strength (shared with Bump attack)',
  attack: 'Adds to bump strength (shared with Bump defence)',
}

export const MODULE_LABELS: Record<ModuleId, string> = {
  'wide-sensor': 'Wide sensor',
  armour: 'Armour',
  'ram-plate': 'Ram plate',
  'extra-cell': 'Extra cell',
}

/** What each module does in `buildToTraits` today — empty means inert. */
export const MODULE_HINTS: Record<ModuleId, string> = {
  'wide-sensor': 'No simulation effect yet',
  armour: '+1 bump strength, −0.05 travel speed',
  'ram-plate': '+1 bump strength, −1 battery',
  'extra-cell': 'No simulation effect yet',
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
 * Everything wrong with `build`, as the *league* would judge it — not just
 * `validateBuild`'s flat cap.
 *
 * This is the check the Build screen has to make. Stream A's `validateBuild`
 * alone is not enough: it accepts a build that sits on the flat cap but breaks
 * the escalating curve, and `legalLeagueBuild` (`services/ladderRunner.ts`,
 * reused by `convex/leagueRun.ts`) rejects that same build. A panel that only
 * called `validateBuild` would therefore let a player assemble something the
 * league refuses to race, and they would meet the rejection at submit time with
 * no way to act on it.
 *
 * The curve message is byte-identical to the server's
 * (`build costs N but the budget is 3`), so the panel and the API agree on the
 * wording rather than describing the same failure two different ways.
 */
export function budgetErrors(build: Build): string[] {
  const errors = validateBuild(build)
  // Only worth adding when the flat checks passed; otherwise the first error is
  // the actionable one and a second message would just be noise.
  if (errors.length > 0) return errors
  const spent = budgetSpent(build)
  if (spent > STAT_BUDGET) errors.push(`build costs ${spent} but the budget is ${STAT_BUDGET}`)
  return errors
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
  // league's own gate agrees with us.
  if (budgetErrors(next).length > 0) return build
  return next
}

/** Whether the league would accept this build — both the flat cap and the curve. */
export function isValidBuild(build: unknown): build is Build {
  return budgetErrors(build as Build).length === 0
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
  return budgetErrors(next).length === 0 ? next : build
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
  // a build it rejects. The readout sits next to the error list in the same
  // render, so it must not throw there: an illegal build gets a readable line
  // and the error alert below carries the detail. Guarded with `budgetErrors`
  // rather than `validateBuild` so an over-curve build also degrades instead
  // of describing traits the league will never run.
  const invalid = budgetErrors(build)
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
  const errors = budgetErrors(build)
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
    return budgetErrors(parsed).length === 0 ? parsed : baseBuild(DEFAULT_BUILD.chassis)
  } catch {
    return baseBuild(DEFAULT_BUILD.chassis)
  }
}
