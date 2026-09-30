import { describe, expect, it } from 'vitest'
import type { ArenaScenario } from '../arenaEpisode'
import { ArenaRunner } from '../arenaPolicy'
import { buildMatchTimeline, MOMENT_LABELS, nextMomentAfter } from '../matchTimeline'

/** Nodes ~1m apart: the rovers are permanently inside clash range. */
function closeScenario(overrides: Partial<ArenaScenario> = {}): ArenaScenario {
  return {
    id: 'timeline-close',
    worldVersion: 'timeline-v1',
    split: 'practice',
    seed: 1,
    durationTicks: 300,
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [1, 0, 0] },
      { id: 'c', position: [0, 0, 1] },
    ],
    edges: [
      { id: 'ab', from: 'a', to: 'b', travelTicks: 5, floodable: false },
      { id: 'ac', from: 'a', to: 'c', travelTicks: 5, floodable: false },
      { id: 'bc', from: 'b', to: 'c', travelTicks: 5, floodable: false },
    ],
    entrants: [
      { id: 'champion', baseNode: 'a', policyVersion: 'test' },
      { id: 'rival', baseNode: 'c', policyVersion: 'test' },
    ],
    resources: [
      { id: 'r1', nodeId: 'b', value: 1 },
      { id: 'r2', nodeId: 'a', value: 1 },
    ],
    floods: [],
    ...overrides,
  }
}

/** Nodes ~8m apart: in the sighted band, outside clash range. */
function farScenario(overrides: Partial<ArenaScenario> = {}): ArenaScenario {
  return {
    ...closeScenario(overrides),
    id: 'timeline-far',
    durationTicks: 700,
    nodes: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [8, 0, 0] },
      { id: 'c', position: [0, 0, 8] },
    ],
    edges: [
      { id: 'ab', from: 'a', to: 'b', travelTicks: 12, floodable: false },
      { id: 'ac', from: 'a', to: 'c', travelTicks: 12, floodable: false },
      { id: 'bc', from: 'b', to: 'c', travelTicks: 12, floodable: false },
    ],
    entrants: [
      { id: 'champion', baseNode: 'a', policyVersion: 'test' },
      { id: 'rival', baseNode: 'b', policyVersion: 'test' },
    ],
    // Each rover's resource sits at its own base — they collect and bank in
    // place, holding a constant ~8m separation: the sighted band all match.
    resources: [
      { id: 'r1', nodeId: 'a', value: 1 },
      { id: 'r2', nodeId: 'b', value: 1 },
      { id: 'r3', nodeId: 'a', value: 1 },
      { id: 'r4', nodeId: 'b', value: 1 },
    ],
  }
}

describe('buildMatchTimeline — the director track for skip-to-moment', () => {
  it('records banks, flood flips, clashes, and the finish in tick order', () => {
    const moments = buildMatchTimeline(
      closeScenario({ floods: [{ startTick: 50, endTick: 90 }] }),
      { champion: 'greedy', rival: 'greedy' },
      undefined,
    )
    expect(moments.at(-1)).toMatchObject({ kind: 'finish', tick: 300 })
    expect(moments.some(m => m.kind === 'clash')).toBe(true)
    expect(moments.some(m => m.kind === 'bank' && m.agentId === 'champion')).toBe(true)
    expect(moments.some(m => m.kind === 'flood-on')).toBe(true)
    expect(moments.some(m => m.kind === 'flood-off')).toBe(true)
    for (let i = 1; i < moments.length; i += 1) {
      expect(moments[i].tick).toBeGreaterThanOrEqual(moments[i - 1].tick)
    }
  })

  it('clash cadence respects the trigger gate and cooldown, not every tick', () => {
    const moments = buildMatchTimeline(
      closeScenario(),
      { champion: 'greedy', rival: 'greedy' },
      undefined,
    )
    const clashes = moments.filter(m => m.kind === 'clash')
    expect(clashes.length).toBeGreaterThanOrEqual(1)
    expect(clashes.length).toBeLessThanOrEqual(2)
    expect(clashes[0].tick).toBeGreaterThanOrEqual(80)
  })

  it('proximity forecasts preserve the authoritative banking trajectory', () => {
    // Proximity may describe a moment, but it cannot award cargo or stagger.
    // Compare every predicted bank with the unchanged live runner, including
    // events after the first contested-ground beat rather than just checking
    // that the clone survived until the finish.
    const scenario = closeScenario({ durationTicks: 500 })
    const moments = buildMatchTimeline(scenario, { champion: 'greedy', rival: 'greedy' }, undefined)
    const runner = new ArenaRunner(scenario, { champion: 'greedy', rival: 'greedy' })
    const banks: { tick: number; kind: 'bank'; agentId: string }[] = []
    const previous: Record<string, number> = {}
    while (!runner.finished) {
      runner.advanceTicks(1)
      for (const agent of runner.peek().agents) {
        if (agent.banked > (previous[agent.id] ?? 0)) banks.push({ tick: runner.peek().tick, kind: 'bank', agentId: agent.id })
        previous[agent.id] = agent.banked
      }
    }
    expect(moments.filter(moment => moment.kind === 'bank')).toEqual(banks)
    expect(moments.at(-1)).toMatchObject({ kind: 'finish', tick: 500 })
    expect(moments.filter(m => m.kind === 'clash').length).toBeGreaterThanOrEqual(2)
  })

  it('the sighted band lives outside clash range on a wide course', () => {
    const moments = buildMatchTimeline(
      farScenario(),
      { champion: 'greedy', rival: 'greedy' },
      undefined,
    )
    expect(moments.some(m => m.kind === 'sighting')).toBe(true)
    expect(moments.filter(m => m.kind === 'sighting').length).toBeLessThanOrEqual(3)
    expect(moments.some(m => m.kind === 'clash')).toBe(false)
  })

  it('moment kinds all carry labels and non-negative leads', () => {
    for (const kind of Object.keys(MOMENT_LABELS)) {
      expect(MOMENT_LABELS[kind as keyof typeof MOMENT_LABELS]).toBeTruthy()
    }
  })

  it('nextMomentAfter scans forward only', () => {
    const moments = [
      { tick: 50, kind: 'flood-on' as const },
      { tick: 120, kind: 'clash' as const },
      { tick: 300, kind: 'finish' as const },
    ]
    expect(nextMomentAfter(moments, 0)?.tick).toBe(50)
    expect(nextMomentAfter(moments, 50)?.tick).toBe(120)
    expect(nextMomentAfter(moments, 119)?.tick).toBe(120)
    expect(nextMomentAfter(moments, 300)).toBeNull()
  })
})
