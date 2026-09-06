import type { ArenaScenario } from './arenaEpisode'

const NODES: ArenaScenario['nodes'] = [
  { id: 'champion-base', position: [0, 0, 0] as [number, number, number] },
  { id: 'rival-base', position: [14, 0, 8] as [number, number, number] },
  { id: 'low-pass', position: [4, 0, 2] as [number, number, number] },
  { id: 'ridge-center', position: [7, 3, 5] as [number, number, number] },
  { id: 'resource-bank', position: [10, 0, 3] as [number, number, number] },
]

const EDGES: ArenaScenario['edges'] = [
  { id: 'base-to-low', from: 'champion-base', to: 'low-pass', travelTicks: 25, floodable: true },
  { id: 'base-to-ridge', from: 'champion-base', to: 'ridge-center', travelTicks: 40, floodable: false },
  { id: 'low-to-bank', from: 'low-pass', to: 'resource-bank', travelTicks: 25, floodable: true },
  { id: 'ridge-to-bank', from: 'ridge-center', to: 'resource-bank', travelTicks: 35, floodable: false },
  // Rival is placed on a long, inert edge so the builder scenario focuses on champion behavior.
  { id: 'rival-to-bank', from: 'rival-base', to: 'resource-bank', travelTicks: 1000, floodable: false },
]

const DEFAULT_ENTRANTS: ArenaScenario['entrants'] = [
  { id: 'champion', baseNode: 'champion-base', policyVersion: 'baseline.safe.v2' },
  { id: 'rival', baseNode: 'rival-base', policyVersion: 'reference.greedy.v2' },
]

const DEFAULT_RESOURCES: ArenaScenario['resources'] = [
  { id: 'core-1', nodeId: 'resource-bank', value: 1 },
  { id: 'core-2', nodeId: 'resource-bank', value: 1 },
  { id: 'core-3', nodeId: 'ridge-center', value: 1 },
  { id: 'core-4', nodeId: 'resource-bank', value: 1 },
]

function createBuilderScenario(
  id: string,
  seed: number,
  split: 'practice' | 'evaluation',
  durationTicks = 600,
  floods: { startTick: number; endTick: number }[] = [
    { startTick: 50, endTick: 300 },
    { startTick: 400, endTick: 550 },
  ],
  entrants: ArenaScenario['entrants'] = DEFAULT_ENTRANTS,
  resources: ArenaScenario['resources'] = DEFAULT_RESOURCES,
): ArenaScenario {
  return {
    id,
    worldVersion: 'course-01-v2',
    split,
    seed,
    durationTicks,
    nodes: NODES,
    edges: EDGES,
    entrants,
    resources,
    floods,
  }
}

/**
 * Practice scenarios used for collecting demonstrations and training.
 */
export const PRACTICE_SCENARIOS: ArenaScenario[] = [
  createBuilderScenario('builder-course-01', 20260905, 'practice', 600, [
    { startTick: 50, endTick: 300 },
    { startTick: 400, endTick: 550 },
  ]),
  createBuilderScenario('builder-course-02', 20260906, 'practice', 600, [
    { startTick: 75, endTick: 250 },
    { startTick: 350, endTick: 500 },
  ]),
  createBuilderScenario('builder-course-03', 20260907, 'practice', 600, [
    { startTick: 100, endTick: 275 },
    { startTick: 375, endTick: 525 },
  ]),
]

/**
 * Held-out evaluation scenarios. These must never be used as training/coaching
 * data; the registry below exposes helpers to guard against that.
 *
 * Includes:
 * - A baseline held-out with different seed and flood timing.
 * - A "swapped start" held-out where the champion starts at the bank node and
 *   the rival starts at the champion base, with resources placed on low/ridge.
 * - An adversarial "long flood" held-out where the low route is submerged for
 *   most of a longer episode.
 */
export const HELD_OUT_SCENARIOS: ArenaScenario[] = [
  createBuilderScenario('builder-course-heldout-01', 20260910, 'evaluation', 600, [
    { startTick: 60, endTick: 220 },
    { startTick: 320, endTick: 480 },
  ]),
  createBuilderScenario(
    'builder-course-heldout-02',
    20260911,
    'evaluation',
    600,
    [
      { startTick: 50, endTick: 200 },
      { startTick: 400, endTick: 550 },
    ],
    [
      { id: 'champion', baseNode: 'resource-bank', policyVersion: 'baseline.safe.v2' },
      { id: 'rival', baseNode: 'champion-base', policyVersion: 'reference.greedy.v2' },
    ],
    [
      { id: 'core-1', nodeId: 'low-pass', value: 2 },
      { id: 'core-2', nodeId: 'ridge-center', value: 1 },
      { id: 'core-3', nodeId: 'ridge-center', value: 1 },
    ],
  ),
  createBuilderScenario(
    'builder-course-heldout-03',
    20260912,
    'evaluation',
    800,
    [{ startTick: 50, endTick: 500 }],
    DEFAULT_ENTRANTS,
    [
      { id: 'core-1', nodeId: 'resource-bank', value: 1 },
      { id: 'core-2', nodeId: 'resource-bank', value: 1 },
      { id: 'core-3', nodeId: 'ridge-center', value: 1 },
      { id: 'core-4', nodeId: 'ridge-center', value: 1 },
    ],
  ),
]

const ALL_SCENARIOS = [...PRACTICE_SCENARIOS, ...HELD_OUT_SCENARIOS]
const EVALUATION_IDS = new Set(HELD_OUT_SCENARIOS.map(s => s.id))

export function getScenarioById(id: string): ArenaScenario | undefined {
  return ALL_SCENARIOS.find(s => s.id === id)
}

export function isEvaluationScenario(id: string): boolean {
  return EVALUATION_IDS.has(id)
}

/**
 * Throws if any training example was drawn from a held-out evaluation scenario.
 * Use this in trainer entry points to keep the practice/held-out split honest.
 */
export function rejectEvaluationExamples(examples: readonly { sourceEpisodeId?: string }[]): void {
  const leak = examples.find(ex => ex.sourceEpisodeId && isEvaluationScenario(ex.sourceEpisodeId))
  if (leak) {
    throw new Error(`Training data leak: example from held-out scenario "${leak.sourceEpisodeId}" cannot be used for training.`)
  }
}
