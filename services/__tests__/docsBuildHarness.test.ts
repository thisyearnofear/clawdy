/**
 * Executes the snippets in docs/BUILD_HARNESS.md verbatim.
 *
 * Ground rule 4 forbids a doc claiming more than is verified. A worked example
 * in a markdown file is prose unless something runs it, so this file is the
 * proof. If the contract moves and these fail, the doc is the thing that broke
 * and it has to be rewritten, not this file.
 */
import { describe, expect, it } from 'vitest'
import {
  baseBuild,
  budgetErrors,
  buildToTraits,
  describeBuildSummary,
  maxAffordableLevel,
  parseBuild,
  remainingBudget,
  serializeBuild,
  setAxisLevel,
  BUILD_STORAGE_KEY,
} from '../buildBudget'
import { legalLeagueBuild } from '../ladderRunner'

describe('docs/BUILD_HARNESS.md — worked example', () => {
  it('reproduces every printed value and comment', () => {
    const build = baseBuild('hauler')
    expect(remainingBudget(build)).toBe(3) // "3 — the full discretionary pool"

    const faster = setAxisLevel(build, 'speed', 3)
    expect(remainingBudget(faster)).toBe(2) // "2"

    const fastest = setAxisLevel(faster, 'speed', 4)
    expect(remainingBudget(fastest)).toBe(0) // "0"
    expect(budgetErrors(fastest)).toEqual([]) // "[] — legal under the league's full gate"
    expect(maxAffordableLevel('defence', fastest)).toBe(2) // "2 — nothing else is affordable"
    expect(describeBuildSummary(fastest)).toMatch(
      /^faster than a hauler.*every point is spent\.$/,
    ) // "faster than a hauler, … every point is spent."
  })

  it('reproduces the three-points-on-one-axis trap the doc describes', () => {
    // "it is flat-legal (total is exactly CHASSIS_TOTAL + STAT_BUDGET) but costs 6"
    const greedy: ReturnType<typeof baseBuild> = {
      chassis: 'hauler',
      points: { navigation: 5, speed: 2, hardiness: 4, defence: 2, attack: 1 },
      modules: [],
    }
    expect(legalLeagueBuild(greedy)).toBeUndefined()
    expect(budgetErrors(greedy)).toEqual(['build costs 6 but the budget is 3'])
  })
})

describe('docs/BUILD_HARNESS.md — round-tripping a build', () => {
  it('reproduces the localStorage snippet with the storage module the doc names', () => {
    const build = setAxisLevel(baseBuild('hauler'), 'speed', 4)
    const store = new Map<string, string>()
    store.set(BUILD_STORAGE_KEY, serializeBuild(build))
    expect(parseBuild(store.get(BUILD_STORAGE_KEY))).toEqual(build)
  })
})

describe('docs/BUILD_HARNESS.md — sweeping builds headlessly', () => {
  it('runs the sweep verbatim and collects only raceable builds', () => {
    const results: { chassis: string; speed: number; traits: unknown }[] = []
    for (const chassis of ['scout', 'hauler', 'raider'] as const) {
      for (const speed of [2, 3, 4]) {
        const build = setAxisLevel(baseBuild(chassis), 'speed', speed)
        if (budgetErrors(build).length > 0) continue // cannot happen, asserted anyway
        if (!legalLeagueBuild(build)) continue // the gate the league actually uses
        results.push({ chassis, speed, traits: buildToTraits(build) })
      }
    }
    // Every collected build is raceable, and the sweep actually collected
    // something — a vacuously empty sweep would also "pass".
    expect(results.length).toBeGreaterThan(0)
    for (const row of results) {
      expect(row.traits).toMatchObject({
        travelSpeed: expect.any(Number),
        maxEnergy: expect.any(Number),
        contactStrength: expect.any(Number),
      })
    }
  })
})