import { describe, expect, it } from 'vitest'
import { buildCustomClash, customClashDigest, sanitizeCustomClashSpec } from '../arenaCustomClash'
import { parseSpecReply } from '../../app/api/arena-intent/route'

/**
 * A grounded-course stand-in with the same shape `buildArenaCourse` produces:
 * two dry ridge stations, two floodable valley stations, plus both bases.
 * Edge paths are omitted because the pure spec builder never touches geometry.
 */
import type { ArenaCourse } from '../arenaCourse'

const course: ArenaCourse = {
  config: { id: 'sandstone-basin', name: 'Sandstone Basin', terrain: { url: '/t.glb', sha256: 'deadbeef' } },
  center: [7, 0.55, 8],
  floodZones: [],
  scenario: {
    id: 'sandstone-practice-01', worldVersion: 'sandstone-basin.v3', split: 'practice', seed: 20260905, durationTicks: 1200,
    nodes: [
      { id: 'champion-base', position: [0, 0, 0] },
      { id: 'rival-base', position: [10, 0, 0] },
      { id: 'ridge-center', position: [5, 0, 1] },
      { id: 'ridge-s1', position: [5, 0, 2] },
      { id: 'valley-center', position: [5, 0, 0] },
      { id: 'valley-s1', position: [5, 0, 3] },
    ],
    edges: [
      { id: 'e1', from: 'champion-base', to: 'ridge-center', travelTicks: 20, floodable: false },
      { id: 'e2', from: 'ridge-center', to: 'rival-base', travelTicks: 20, floodable: false },
      { id: 'e3', from: 'ridge-center', to: 'valley-center', travelTicks: 10, floodable: true },
      { id: 'e4', from: 'valley-center', to: 'rival-base', travelTicks: 10, floodable: true },
      { id: 'e5', from: 'ridge-s1', to: 'ridge-center', travelTicks: 10, floodable: false },
      { id: 'e6', from: 'valley-s1', to: 'valley-center', travelTicks: 5, floodable: true },
    ],
    entrants: [
      { id: 'champion', baseNode: 'champion-base', policyVersion: 'baseline.safe.v2' },
      { id: 'rival', baseNode: 'rival-base', policyVersion: 'reference.greedy.v2' },
    ],
    resources: [{ id: 'core-1', nodeId: 'ridge-center', value: 2 }],
    floods: [{ startTick: 100, endTick: 400 }],
  },
}

const goodSpec = {
  floods: [{ startTick: 200, endTick: 700 }],
  resources: [
    { nodeId: 'valley-center', value: 3 },
    { nodeId: 'ridge-s1', value: 1 },
  ],
  durationTicks: 900,
  seed: 4242,
  rivalStrategy: 'greedy',
}

describe('custom Clash spec sanitizing (LLM proposes, sim disposes)', () => {
  it('normalizes a good spec: sorted floods, defaults for missing optional fields', () => {
    const result = sanitizeCustomClashSpec({ ...goodSpec, seed: 7 }, course)
    expect('spec' in result).toBe(true)
    if (!('spec' in result)) return
    expect(result.spec.durationTicks).toBe(900)
    expect(result.spec.rivalStrategy).toBe('greedy')
    expect(result.spec.seed).toBe(7)
  })

  it('rejects invented stations, base-pad cores, bad values, and empty/oversized floods', () => {
    expect('error' in sanitizeCustomClashSpec({ ...goodSpec, resources: [{ nodeId: 'mars', value: 1 }] }, course)).toBe(true)
    expect('error' in sanitizeCustomClashSpec({ ...goodSpec, resources: [{ nodeId: 'champion-base', value: 1 }] }, course)).toBe(true)
    expect('error' in sanitizeCustomClashSpec({ ...goodSpec, resources: [{ nodeId: 'ridge-s1', value: 9 }] }, course)).toBe(true)
    expect('error' in sanitizeCustomClashSpec({ ...goodSpec, floods: [] }, course)).toBe(true)
    expect('error' in sanitizeCustomClashSpec({ ...goodSpec, durationTicks: 100 }, course)).toBe(true)
    expect('error' in sanitizeCustomClashSpec({ ...goodSpec, floods: [{ startTick: 500, endTick: 500 }] }, course)).toBe(true)
  })

  it('rejects boards the champion cannot dry-reach or a rover cannot reach at all', () => {
    // Everything in the flooded valley: no dry core for the champion.
    expect('error' in sanitizeCustomClashSpec(
      { ...goodSpec, resources: [{ nodeId: 'valley-center', value: 1 }, { nodeId: 'valley-s1', value: 1 }] }, course,
    )).toBe(true)
    // valley-s1 is reachable only via valley-center (floodable) — not dry.
    expect('error' in sanitizeCustomClashSpec({ ...goodSpec, resources: [{ nodeId: 'ridge-s1', value: 1 }] }, course)).toBe(false)
  })

  it('falls back to poach and a derived seed when the translator skips those fields', () => {
    const result = sanitizeCustomClashSpec({ floods: goodSpec.floods, resources: goodSpec.resources, durationTicks: 900 }, course)
    expect('spec' in result).toBe(true)
    if (!('spec' in result)) return
    expect(result.spec.rivalStrategy).toBe('poach')
    expect(Number.isSafeInteger(result.spec.seed)).toBe(true)
  })

  it('rejects non-object payloads outright', () => {
    expect('error' in sanitizeCustomClashSpec(null, course)).toBe(true)
    expect('error' in sanitizeCustomClashSpec('make it spicy', course)).toBe(true)
  })
})

describe('custom Clash course building', () => {
  it('keeps the grounded world untouched and names the scenario as player-authored practice', () => {
    const sanitized = sanitizeCustomClashSpec(goodSpec, course)
    if (!('spec' in sanitized)) throw new Error('expected spec')
    const built = buildCustomClash(course, sanitized.spec)
    expect(built).not.toBe(course)
    // Grounded geometry is cloned, never replaced.
    expect(built.config.terrain.sha256).toBe(course.config.terrain.sha256)
    expect(built.scenario.nodes).toEqual(course.scenario.nodes)
    expect(built.scenario.edges).toEqual(course.scenario.edges)
    expect(built.scenario.split).toBe('practice')
    expect(built.scenario.id).toMatch(/^clash-custom-/)
    expect(built.scenario.id).not.toBe(course.scenario.id)
    expect(built.scenario.floods).toEqual([{ startTick: 200, endTick: 700 }])
    expect(built.scenario.resources).toEqual([
      { id: 'core-1', nodeId: 'valley-center', value: 3 },
      { id: 'core-2', nodeId: 'ridge-s1', value: 1 },
    ])
    expect(built.scenario.entrants.find(entrant => entrant.id === 'rival')?.policyVersion).toBe('reference.greedy.v2')
    expect(built.scenario.rush).toBeUndefined()
    // The original course is untouched.
    expect(course.scenario.id).toBe('sandstone-practice-01')
    expect(course.scenario.durationTicks).toBe(1200)
  })

  it('digest lists real stations, exposure and bots without secrets', () => {
    const digest = customClashDigest(course)
    expect(digest).toContain('ridge-center')
    expect(digest).toContain('valley-center')
    expect(digest).toContain('poach')
    expect(digest).toContain('champion-base')
    expect(digest).not.toContain('sha256')
  })

  it('never invites the translator to place cores on base pads', () => {
    const digest = customClashDigest(course)
    const stations = /Stations \(cores may be placed on any\): (.*)\./.exec(digest)![1]
    expect(stations).not.toContain('champion-base')
    expect(stations).not.toContain('rival-base')
    expect(stations).toContain('ridge-center')
    expect(digest).toContain('Base pads (cores are never placed here): champion-base, rival-base.')
  })
})

describe('arena-intent API reply parsing', () => {
  it('parses JSON and fenced JSON, rejects non-objects', () => {
    expect(parseSpecReply('{"floods":[]}')).toEqual({ floods: [] })
    expect(parseSpecReply('```json\n{"floods":[]}\n```')).toEqual({ floods: [] })
    expect(parseSpecReply('"just a string"')).toBeNull()
    expect(parseSpecReply('nope')).toBeNull()
  })
})
