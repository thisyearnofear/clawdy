import { describe, expect, it } from 'vitest'
import {
  AXIS_SPEND,
  axisSpend,
  affordableBuild,
  baseBuild,
  budgetSpent,
  CHASSIS_BASE,
  CHASSIS_TOTAL,
  DEFAULT_BUILD,
  describeBuildSummary,
  INERT_AXES,
  isValidBuild,
  marginalCost,
  maxAffordableLevel,
  MODULE_IDS,
  MODULE_SLOTS,
  parseBuild,
  refundedPoints,
  remainingBudget,
  selectChassis,
  serializeBuild,
  setAxisLevel,
  STAT_AXES,
  STAT_BUDGET,
  STAT_MAX,
  toggleModule,
  validateBuild,
  type Build,
  type ChassisId,
  type ModuleId,
  type StatAxis,
} from '../buildBudget'

const CHASSIS_IDS_FOR_TEST: ChassisId[] = ['scout', 'hauler', 'raider']

/** A build with explicit points over a chosen chassis base. */
function withPoints(points: Partial<Record<StatAxis, number>>, chassis: ChassisId = 'hauler'): Build {
  return { chassis, points: { ...CHASSIS_BASE[chassis], ...points }, modules: [] }
}

describe('marginal cost curve', () => {
  it('charges the n-th point on an axis n points', () => {
    expect([1, 2, 3].map(marginalCost)).toEqual([1, 2, 3])
  })

  it('accumulates to the documented discrete costs', () => {
    expect([0, 1, 2, 3].map(axisSpend)).toEqual([...AXIS_SPEND])
  })

  it('makes the second point cost as much as the first two combined', () => {
    expect(axisSpend(2)).toBe(3)
  })

  it('rejects nonsense input', () => {
    expect(() => marginalCost(-1)).toThrow(/non-negative integer/)
    expect(() => marginalCost(1.5)).toThrow(/non-negative integer/)
  })
})

describe('budget accounting', () => {
  it('starts a fresh chassis build with the whole discretionary budget', () => {
    for (const chassis of CHASSIS_IDS_FOR_TEST) {
      expect(budgetSpent(baseBuild(chassis))).toBe(0)
      expect(remainingBudget(baseBuild(chassis))).toBe(STAT_BUDGET)
    }
  })

  it('refunds points when an axis is lowered below the chassis base', () => {
    const hauler = baseBuild('hauler')
    expect(refundedPoints(hauler)).toBe(0)
    const lowered = { ...hauler, points: { ...hauler.points, hardiness: hauler.points.hardiness - 2 } }
    expect(refundedPoints(lowered)).toBe(2)
    expect(remainingBudget(lowered)).toBeGreaterThan(STAT_BUDGET)
  })

  it('measures refunds against the build’s own chassis, not the hauler', () => {
    // Scout bases navigation at 4; hauler at 2. Lowering scout navigation to
    // hauler's level must refund 2, not 0.
    const scout = baseBuild('scout')
    const lowered = { ...scout, points: { ...scout.points, navigation: 2 } }
    expect(refundedPoints(lowered)).toBe(2)
    expect(remainingBudget(lowered)).toBe(STAT_BUDGET + 2)
  })

  it('nets a raise and a refund in the same build', () => {
    const hauler = baseBuild('hauler')
    const mixed: Build = { ...hauler, points: { ...hauler.points, speed: hauler.points.speed + 1, hardiness: hauler.points.hardiness - 1 } }
    expect(budgetSpent(mixed)).toBe(0)
  })
})

describe('maxAffordableLevel', () => {
  it('never offers a level that breaks Stream A’s flat cap (cross-module guard)', () => {
    // The load-bearing guarantee: whatever the UI offers, chassis.validateBuild
    // must accept. If Stream A tightens the cap, this fails here first.
    for (const chassis of CHASSIS_IDS_FOR_TEST) {
      for (let seed = 0; seed < 4; seed++) {
        const candidate = withPoints(
          Object.fromEntries(STAT_AXES.map((axis, i) => [axis, (i * (seed + 1)) % (STAT_MAX + 1)])) as Record<StatAxis, number>,
          chassis,
        )
        if (validateBuild(candidate).length > 0) continue
        for (const axis of STAT_AXES) {
          const level = maxAffordableLevel(axis, candidate)
          const offered: Build = { ...candidate, points: { ...candidate.points, [axis]: level } }
          expect(validateBuild(offered), `${chassis} ${axis}=${level}`).toEqual([])
        }
      }
    }
  })

  it('reserves escalating cost, so one axis cannot swallow the whole budget', () => {
    const hauler = baseBuild('hauler')
    // Two points on one axis cost 1 + 2 = 3, which is exactly the budget.
    const first = maxAffordableLevel('speed', hauler)
    expect(first).toBe(hauler.points.speed + 2)
    const afterFirst = setAxisLevel(hauler, 'speed', first)
    expect(remainingBudget(afterFirst)).toBe(0)
    // With the budget exhausted, a third point on the same axis is unreachable.
    expect(maxAffordableLevel('speed', afterFirst)).toBe(first)
    expect(maxAffordableLevel('defence', afterFirst)).toBe(CHASSIS_BASE.hauler.defence)
  })

  it('respects STAT_MAX as a hard ceiling', () => {
    const rich: Build = { ...baseBuild('hauler'), points: { ...CHASSIS_BASE.hauler, speed: STAT_MAX - 1 } }
    expect(maxAffordableLevel('speed', rich)).toBeLessThanOrEqual(STAT_MAX)
  })

  it('cannot lower an axis below zero', () => {
    const zeroed = setAxisLevel(baseBuild('hauler'), 'navigation', -5)
    expect(zeroed.points.navigation).toBeGreaterThanOrEqual(0)
  })
})

describe('setAxisLevel', () => {
  it('applies a legal move', () => {
    const hauler = baseBuild('hauler')
    const next = setAxisLevel(hauler, 'speed', hauler.points.speed + 1)
    expect(next.points.speed).toBe(hauler.points.speed + 1)
    expect(validateBuild(next)).toEqual([])
  })

  it('clamps an unaffordable request instead of throwing (slider mid-drag)', () => {
    const hauler = baseBuild('hauler')
    const next = setAxisLevel(hauler, 'speed', STAT_MAX)
    expect(validateBuild(next)).toEqual([])
    expect(remainingBudget(next)).toBeGreaterThanOrEqual(0)
    // It clamped to what the budget allows rather than granting the whole axis.
    expect(next.points.speed).toBe(maxAffordableLevel('speed', hauler))
  })

  it('ignores an unknown axis', () => {
    const hauler = baseBuild('hauler')
    expect(setAxisLevel(hauler, 'thrust' as StatAxis, 4)).toBe(hauler)
  })

  it('rounds a fractional drag target', () => {
    const hauler = baseBuild('hauler')
    const next = setAxisLevel(hauler, 'speed', hauler.points.speed + 1.4)
    expect(Number.isInteger(next.points.speed)).toBe(true)
  })
})

describe('chassis and modules', () => {
  it('switching chassis resets to that chassis base', () => {
    const spent = setAxisLevel(baseBuild('hauler'), 'speed', 4)
    const scout = selectChassis('scout')
    expect(scout.points).toEqual(CHASSIS_BASE.scout)
    expect(budgetSpent(scout)).toBe(0)
    expect(spent.points.speed).toBeGreaterThan(CHASSIS_BASE.hauler.speed)
  })

  it('toggles a module on and off', () => {
    const hauler = baseBuild('hauler')
    const on = toggleModule(hauler, 'armour')
    expect(on.modules).toEqual(['armour'])
    expect(toggleModule(on, 'armour').modules).toEqual([])
  })

  it('refuses a third module rather than overfilling the slots', () => {
    const build = toggleModule(toggleModule(toggleModule(baseBuild('hauler'), 'armour'), 'ram-plate'), 'wide-sensor')
    expect(build.modules.length).toBe(MODULE_SLOTS)
  })

  it('every module id is accepted and slots are per Stream A', () => {
    for (const id of MODULE_IDS) {
      expect(validateBuild(toggleModule(baseBuild('hauler'), id))).toEqual([])
    }
    expect(MODULE_SLOTS).toBe(2)
  })
})

describe('over-budget builds are rejected (Stream B acceptance criterion)', () => {
  it('rejects a flat total over the cap with Stream A’s own error', () => {
    const over: Build = {
      chassis: 'hauler',
      points: Object.fromEntries(STAT_AXES.map(axis => [axis, STAT_MAX])) as Record<StatAxis, number>,
      modules: [],
    }
    expect(isValidBuild(over)).toBe(false)
    expect(validateBuild(over).join(' ')).toMatch(/exceeds budget/)
  })

  it('accepts a build sitting exactly on the cap', () => {
    const exact: Build = { chassis: 'hauler', points: { navigation: 3, speed: 3, hardiness: 4, defence: 3, attack: 1 }, modules: [] }
    const total = STAT_AXES.reduce((sum, axis) => sum + exact.points[axis], 0)
    expect(total).toBe(CHASSIS_TOTAL + STAT_BUDGET)
    expect(isValidBuild(exact)).toBe(true)
  })

  it('refuses to serialise an invalid build', () => {
    const over: Build = {
      chassis: 'hauler',
      points: Object.fromEntries(STAT_AXES.map(axis => [axis, STAT_MAX])) as Record<StatAxis, number>,
      modules: [],
    }
    expect(() => serializeBuild(over)).toThrow(/Refusing to save an invalid build/)
  })
})

describe('build and config round-trip through save and load (Stream B acceptance criterion)', () => {
  it('survives a JSON round-trip unchanged', () => {
    const original = withPoints({ speed: 3 }, 'raider')
    const loaded = parseBuild(serializeBuild(original))
    expect(loaded).toEqual(original)
  })

  it('round-trips each chassis', () => {
    for (const chassis of CHASSIS_IDS_FOR_TEST) {
      const build = baseBuild(chassis)
      expect(parseBuild(serializeBuild(build))).toEqual(build)
    }
  })

  it('round-trips every legal module count', () => {
    for (let count = 0; count <= MODULE_SLOTS; count++) {
      let build = baseBuild('hauler')
      for (const id of MODULE_IDS.slice(0, count)) build = toggleModule(build, id)
      expect(parseBuild(serializeBuild(build))).toEqual(build)
    }
  })

  it('falls back to the default for missing or malformed stored data (additive rule)', () => {
    expect(parseBuild(null)).toEqual(baseBuild(DEFAULT_BUILD.chassis))
    expect(parseBuild(undefined)).toEqual(baseBuild(DEFAULT_BUILD.chassis))
    expect(parseBuild('{not json')).toEqual(baseBuild(DEFAULT_BUILD.chassis))
    expect(parseBuild('{"chassis":"tank","points":{}}')).toEqual(baseBuild(DEFAULT_BUILD.chassis))
  })
})

describe('readout honesty (ground rule 4)', () => {
  it('describes the base build from real traits', () => {
    expect(describeBuildSummary(baseBuild('hauler'))).toMatch(/balanced hauler baseline/i)
  })

  it('never claims an effect for an inert axis', () => {
    // navigation is spendable but not in Stream A's ACTIVE_AXES, so a build
    // that spends into it must be labelled roadmap, not a strength.
    expect(INERT_AXES).toContain('navigation')
    const text = describeBuildSummary(withPoints({ navigation: 5 }))
    expect(text).toMatch(/roadmap/i)
  })

  it('flags modules with no simulation effect', () => {
    const build: Build = { ...baseBuild('hauler'), modules: ['wide-sensor'] }
    expect(describeBuildSummary(build)).toMatch(/no simulation effect yet/i)
  })

  it('reports unspent budget in plain words', () => {
    expect(describeBuildSummary(baseBuild('hauler'))).toMatch(/3 points unspent/)
    expect(describeBuildSummary(affordableBuild(baseBuild('hauler')))).toMatch(/every point is spent/)
  })

  it('describes a hand-authored build that breaks the point-buy curve honestly', () => {
    // A build can satisfy Stream A's flat cap while breaking this layer's
    // escalating-cost rule. The readout must say so rather than hide it.
    const greedy = withPoints({ navigation: 5 })
    expect(validateBuild(greedy)).toEqual([])
    expect(describeBuildSummary(greedy)).toMatch(/3 points over budget/)
  })

  it('always returns non-empty copy for every chassis', () => {
    for (const chassis of CHASSIS_IDS_FOR_TEST) {
      expect(describeBuildSummary(baseBuild(chassis)).trim().length).toBeGreaterThan(0)
    }
  })
})
