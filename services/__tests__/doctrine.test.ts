import { describe, expect, it } from 'vitest'
import { ArenaRunner } from '../arenaPolicy'
import {
  doctrineFramesFromRecording,
  doctrinePreferredAction,
  expandDoctrine,
  heuristicDoctrine,
  parseDoctrineSpec,
  type DoctrineSpec,
} from '../doctrine'
import type { ArenaScenario } from '../arenaEpisode'

/**
 * Small abstract board: base `a`, a dry ridge fork `ab`, a floodable low road
 * `ac`, cores on both ends. Route-only rollouts are exact here — the same
 * model the CI syllabus uses for its consequence veto.
 */
const scenario: ArenaScenario = {
  id: 'doctrine-practice', worldVersion: 'doctrine-fixture-v1', split: 'practice', seed: 1, durationTicks: 200,
  nodes: [
    { id: 'a', position: [0, 0, 0] },
    { id: 'b', position: [1, 0, 0] },
    { id: 'c', position: [0, 0, 1] },
  ],
  edges: [
    { id: 'ab', from: 'a', to: 'b', travelTicks: 5, floodable: false },
    { id: 'ac', from: 'a', to: 'c', travelTicks: 5, floodable: true },
  ],
  entrants: [{ id: 'champion', baseNode: 'a', policyVersion: 'test' }, { id: 'rival', baseNode: 'b', policyVersion: 'test' }],
  resources: [{ id: 'core-b', nodeId: 'b', value: 1 }, { id: 'core-c', nodeId: 'c', value: 2 }],
  floods: [{ startTick: 10, endTick: 60 }],
}

function recording() {
  const runner = new ArenaRunner(scenario, { champion: 'safe', rival: 'greedy' })
  runner.advanceTicks(scenario.durationTicks)
  return runner.recording()
}

const weights = (over: Partial<DoctrineSpec['weights']> = {}): DoctrineSpec['weights'] =>
  ({ weather: 0, banking: 0, collection: 0, contest: 0, energy: 0, ...over })

const spec = (over: Partial<DoctrineSpec> = {}): DoctrineSpec =>
  ({ name: 'Test doctrine', notes: 'fixture', weights: weights(over.weights), ...over })

describe('parseDoctrineSpec', () => {
  it('accepts a bounded spec and clamps weights', () => {
    const parsed = parseDoctrineSpec({
      name: '  Greedy   scavenger ',
      notes: 'hugs cores',
      weights: { weather: -2, banking: 0.5, collection: 1, contest: 0, energy: 'x' },
    })!
    expect(parsed.name).toBe('Greedy scavenger')
    expect(parsed.weights.weather).toBe(-1)
    expect(parsed.weights.collection).toBe(1)
    expect(parsed.weights.energy).toBe(0)
  })

  it('rejects malformed and meaningless specs', () => {
    expect(parseDoctrineSpec(null)).toBeNull()
    expect(parseDoctrineSpec({ name: 'x', weights: {} })).toBeNull()
    expect(parseDoctrineSpec({ weights: { collection: 1 } })).toBeNull()
    expect(parseDoctrineSpec({ name: 'x', weights: { collection: 0.01 } })).toBeNull()
  })
})

describe('heuristicDoctrine', () => {
  it('maps doctrine words to signed weights', () => {
    const greedy = heuristicDoctrine('a greedy scavenger that hugs the low road but panics in floods')!
    expect(greedy.weights.collection).toBeGreaterThan(0)
    expect(greedy.weights.weather).toBeLessThan(0)
    const cautious = heuristicDoctrine('bank early and stay on the ridge in floods')!
    expect(cautious.weights.banking).toBeGreaterThan(0)
    expect(cautious.weights.weather).toBeGreaterThan(0)
  })

  it('refuses notes it cannot understand', () => {
    expect(heuristicDoctrine('be excellent')).toBeNull()
    expect(heuristicDoctrine('')).toBeNull()
  })
})

describe('doctrinePreferredAction', () => {
  it('picks the doctrine-aligned legal action, never an illegal one', () => {
    const recorded = recording()
    const frames = doctrineFramesFromRecording(recorded, 4)
    expect(frames.length).toBeGreaterThan(0)
    for (const frame of frames) {
      const greedy = doctrinePreferredAction(frame.observation, spec({ weights: weights({ collection: 1 }) }), frame.alternatives)
      // The pick must come from the recorded frame's legal alternatives.
      if (greedy) expect(frame.alternatives).toContainEqual(greedy)
      const cautious = doctrinePreferredAction(frame.observation, spec({ weights: weights({ weather: 1 }) }), frame.alternatives)
      if (cautious) expect(frame.alternatives).toContainEqual(cautious)
    }
  })
})

describe('expandDoctrine', () => {
  it('drafts labeled generated examples with measured deltas', () => {
    const recorded = recording()
    const expansion = expandDoctrine(recorded, spec({ name: 'Greedy scavenger', weights: weights({ collection: 1 }) }), { maxFrames: 8 })
    for (const example of expansion.examples) {
      expect(example.source).toBe('generated')
      expect(example.approved).toBe(false)
      expect(example.provenance?.kind).toBe('doctrine')
      expect(typeof example.outcomeDelta).toBe('number')
      expect(example.rationale).toContain('Greedy scavenger')
      // Every preferred action differs from the recorded one and is an
      // action type the authority actually supports.
      expect(example.preferredAction).not.toEqual(example.originalAction)
      expect(example.sourceEpisodeId).toBe(scenario.id)
    }
    expect(expansion.framesSampled).toBeLessThanOrEqual(8)
  })

  it('samples only practice recordings', () => {
    const evalScenario = { ...scenario, id: 'doctrine-eval', split: 'evaluation' as const }
    const runner = new ArenaRunner(evalScenario, { champion: 'safe', rival: 'greedy' })
    runner.advanceTicks(evalScenario.durationTicks)
    const expansion = expandDoctrine(runner.recording(), spec({ weights: weights({ collection: 1 }) }))
    expect(expansion.examples).toHaveLength(0)
  })
})
