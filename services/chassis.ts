import type { EntrantTraits } from './arenaEpisode'

/**
 * Chassis builds: a base bot plus a small stat/module budget.
 *
 * A build never changes the pinned rules. It resolves to optional per-entrant
 * `EntrantTraits`; an entrant without traits (every pinned scenario and every
 * existing checkpoint) runs exactly as before, which is the `hauler` baseline.
 */
export type ChassisId = 'scout' | 'hauler' | 'raider'
export type StatAxis = 'navigation' | 'speed' | 'hardiness' | 'defence' | 'attack'
export type ModuleId = 'wide-sensor' | 'armour' | 'ram-plate' | 'extra-cell'

export interface Build {
  chassis: ChassisId
  /** Final allocation per axis (not a delta). */
  points: Record<StatAxis, number>
  modules: ModuleId[]
}

export const STAT_AXES: readonly StatAxis[] = ['navigation', 'speed', 'hardiness', 'defence', 'attack']
export const MODULE_IDS: readonly ModuleId[] = ['wide-sensor', 'armour', 'ram-plate', 'extra-cell']
export const CHASSIS_IDS: readonly ChassisId[] = ['scout', 'hauler', 'raider']

export const STAT_MAX = 6
/** Extra points a player may add on top of the chassis base total. */
export const STAT_BUDGET = 3
export const MODULE_SLOTS = 2

/** Axes that change the simulation today. The rest are accepted but inert, and the UI must say so. */
export const ACTIVE_AXES: readonly StatAxis[] = ['speed', 'hardiness', 'defence', 'attack']

/** Every base line sums to the same total so no chassis is strictly better. */
export const CHASSIS_BASE: Readonly<Record<ChassisId, Readonly<Record<StatAxis, number>>>> = Object.freeze({
  scout: Object.freeze({ navigation: 4, speed: 4, hardiness: 1, defence: 1, attack: 1 }),
  hauler: Object.freeze({ navigation: 2, speed: 2, hardiness: 4, defence: 2, attack: 1 }),
  raider: Object.freeze({ navigation: 1, speed: 3, hardiness: 2, defence: 2, attack: 3 }),
})

export const CHASSIS_TOTAL = 11

export const DEFAULT_BUILD: Readonly<Build> = Object.freeze({
  chassis: 'hauler',
  points: CHASSIS_BASE.hauler,
  modules: [],
})

export function baseBuild(chassis: ChassisId): Build {
  return { chassis, points: { ...CHASSIS_BASE[chassis] }, modules: [] }
}

/** Cost of raising one axis `n` points above its chassis base: 1 + 2 + ... + n, so each extra point costs more. */
export function axisSpend(n: number): number {
  return (n * (n + 1)) / 2
}

/**
 * Budget committed by a build, measured against its own chassis base.
 * Points taken below base refund one-for-one. The server uses this as the
 * authority; the Build screen mirrors it.
 */
export function budgetSpent(build: Build): number {
  const base = CHASSIS_BASE[build.chassis]
  if (!base) return 0
  let gross = 0
  let refund = 0
  for (const axis of STAT_AXES) {
    const delta = (build.points?.[axis] ?? 0) - base[axis]
    if (delta > 0) gross += axisSpend(delta)
    else refund += -delta
  }
  return gross - refund
}

export function validateBuild(build: Build): string[] {
  const errors: string[] = []
  if (!CHASSIS_IDS.includes(build.chassis)) errors.push(`unknown chassis: ${String(build.chassis)}`)
  let total = 0
  for (const axis of STAT_AXES) {
    const value = build.points?.[axis]
    if (!Number.isInteger(value) || value < 0 || value > STAT_MAX) {
      errors.push(`${axis} must be an integer from 0 to ${STAT_MAX}`)
    } else {
      total += value
    }
  }
  if (total > CHASSIS_TOTAL + STAT_BUDGET) errors.push(`stat total ${total} exceeds budget ${CHASSIS_TOTAL + STAT_BUDGET}`)
  if (errors.length === 0 && budgetSpent(build) > STAT_BUDGET) {
    errors.push(`build costs ${budgetSpent(build)} but the budget is ${STAT_BUDGET}`)
  }
  const modules = build.modules ?? []
  if (modules.length > MODULE_SLOTS) errors.push(`at most ${MODULE_SLOTS} modules`)
  if (new Set(modules).size !== modules.length) errors.push('duplicate module')
  for (const id of modules) if (!MODULE_IDS.includes(id)) errors.push(`unknown module: ${String(id)}`)
  return errors
}

const HAULER = CHASSIS_BASE.hauler

/**
 * Build → simulation traits, measured against the hauler baseline so that the
 * default build resolves to exactly the pinned rules (identity). Mappings are
 * linear in points but bounded, so extreme allocations stay inside the ranges
 * the sim validates.
 *
 * Modules only adjust the same traits; `wide-sensor` and `extra-cell` have no
 * simulation effect yet (see ACTIVE_AXES) and resolve to nothing.
 */
export function buildToTraits(build: Build): EntrantTraits {
  const errors = validateBuild(build)
  if (errors.length > 0) throw new Error(`Invalid build: ${errors.join('; ')}`)
  const p = build.points
  let travelSpeed = 1 + 0.06 * (p.speed - HAULER.speed)
  let maxEnergy = 12 + (p.hardiness - HAULER.hardiness)
  let contactStrength = 0.5 * ((p.attack - HAULER.attack) + (p.defence - HAULER.defence))
  for (const id of build.modules) {
    if (id === 'armour') { contactStrength += 1; travelSpeed -= 0.05 }
    if (id === 'ram-plate') { contactStrength += 1; maxEnergy -= 1 }
  }
  return {
    travelSpeed: round(clamp(travelSpeed, 0.8, 1.4)),
    maxEnergy: round(clamp(maxEnergy, 6, 14)),
    contactStrength: round(clamp(contactStrength, -3, 3)),
  }
}

/** Normalised stat vector for policy input. Not appended to any encoder yet. */
export function buildToObservation(build: Build): number[] {
  return STAT_AXES.map(axis => (build.points[axis] ?? 0) / STAT_MAX)
}

/** Plain-language summary for the pre-match readout. */
export function describeBuild(build: Build): string {
  const t = buildToTraits(build)
  const parts: string[] = []
  if (t.travelSpeed > 1.05) parts.push('faster than a hauler')
  else if (t.travelSpeed < 0.95) parts.push('slower than a hauler')
  if (t.maxEnergy > 12) parts.push('long-range battery')
  else if (t.maxEnergy < 12) parts.push('short-range battery')
  if (t.contactStrength > 0) parts.push('wins close bumps')
  else if (t.contactStrength < 0) parts.push('loses close bumps')
  return parts.length > 0 ? parts.join(', ') : 'balanced hauler baseline'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
