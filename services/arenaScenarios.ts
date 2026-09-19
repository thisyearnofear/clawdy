import type { ArenaScenario } from './arenaEpisode'

const NODES: ArenaScenario['nodes'] = [
  // Valley corridor (floodable low route)
  { id: 'champion-base', position: [0, 0, 0] as [number, number, number] },
  { id: 'valley-n1', position: [0, 0, 2] as [number, number, number] },
  { id: 'valley-center', position: [0, 0, 5] as [number, number, number] },
  { id: 'valley-s1', position: [0, 0, 8] as [number, number, number] },
  { id: 'rival-base', position: [0, 0, 10] as [number, number, number] },
  // Ridge corridor (safe high route)
  { id: 'ridge-north', position: [8, 3, 0] as [number, number, number] },
  { id: 'ridge-n1', position: [8, 3, 2] as [number, number, number] },
  { id: 'ridge-center', position: [8, 3, 5] as [number, number, number] },
  { id: 'ridge-s1', position: [8, 3, 8] as [number, number, number] },
  { id: 'ridge-south', position: [8, 3, 10] as [number, number, number] },
  // Cross-route junctions (mid-elevation)
  { id: 'cross-n', position: [4, 1, 2] as [number, number, number] },
  { id: 'cross-c', position: [4, 1, 5] as [number, number, number] },
  { id: 'cross-s', position: [4, 1, 8] as [number, number, number] },
]

const EDGES: ArenaScenario['edges'] = [
  // Valley corridor (floodable)
  { id: 'valley-cb-n1', from: 'champion-base', to: 'valley-n1', travelTicks: 20, floodable: true },
  { id: 'valley-n1-vc', from: 'valley-n1', to: 'valley-center', travelTicks: 25, floodable: true },
  { id: 'valley-vc-s1', from: 'valley-center', to: 'valley-s1', travelTicks: 25, floodable: true },
  { id: 'valley-s1-rb', from: 'valley-s1', to: 'rival-base', travelTicks: 20, floodable: true },
  // Ridge corridor (dry)
  { id: 'ridge-rn-r1', from: 'ridge-north', to: 'ridge-n1', travelTicks: 20, floodable: false },
  { id: 'ridge-r1-rc', from: 'ridge-n1', to: 'ridge-center', travelTicks: 25, floodable: false },
  { id: 'ridge-rc-r1s', from: 'ridge-center', to: 'ridge-s1', travelTicks: 25, floodable: false },
  { id: 'ridge-r1s-rs', from: 'ridge-s1', to: 'ridge-south', travelTicks: 20, floodable: false },
  // Base-to-ridge direct
  { id: 'base-cb-rn', from: 'champion-base', to: 'ridge-north', travelTicks: 35, floodable: false },
  { id: 'base-rb-rs', from: 'rival-base', to: 'ridge-south', travelTicks: 35, floodable: false },
  // Cross-route connections
  { id: 'cross-vn-cn', from: 'valley-n1', to: 'cross-n', travelTicks: 15, floodable: false },
  { id: 'cross-cn-r1', from: 'cross-n', to: 'ridge-n1', travelTicks: 15, floodable: false },
  { id: 'cross-vc-cc', from: 'valley-center', to: 'cross-c', travelTicks: 15, floodable: false },
  { id: 'cross-cc-rc', from: 'cross-c', to: 'ridge-center', travelTicks: 15, floodable: false },
  { id: 'cross-vs-cs', from: 'valley-s1', to: 'cross-s', travelTicks: 15, floodable: false },
  { id: 'cross-cs-r1s', from: 'cross-s', to: 'ridge-s1', travelTicks: 15, floodable: false },
  // Cross-route internal
  { id: 'cross-cn-cc', from: 'cross-n', to: 'cross-c', travelTicks: 20, floodable: false },
  { id: 'cross-cc-cs', from: 'cross-c', to: 'cross-s', travelTicks: 20, floodable: false },
  // Floodable shortcuts
  { id: 'shortcut-cb-cn', from: 'champion-base', to: 'cross-n', travelTicks: 25, floodable: true },
  { id: 'shortcut-rb-cs', from: 'rival-base', to: 'cross-s', travelTicks: 25, floodable: true },
  // Long diagonal shortcuts (floodable)
  { id: 'diag-vn-rn', from: 'valley-n1', to: 'ridge-north', travelTicks: 30, floodable: true },
  { id: 'diag-vs-rs', from: 'valley-s1', to: 'ridge-south', travelTicks: 30, floodable: true },
  // Valley long jumps (floodable)
  { id: 'valley-cb-vc', from: 'champion-base', to: 'valley-center', travelTicks: 40, floodable: true },
  { id: 'valley-rb-vc', from: 'rival-base', to: 'valley-center', travelTicks: 40, floodable: true },
  // Ridge long jumps (dry)
  { id: 'ridge-rn-rc', from: 'ridge-north', to: 'ridge-center', travelTicks: 40, floodable: false },
  { id: 'ridge-rs-rc', from: 'ridge-south', to: 'ridge-center', travelTicks: 40, floodable: false },
]

const DEFAULT_ENTRANTS: ArenaScenario['entrants'] = [
  { id: 'champion', baseNode: 'champion-base', policyVersion: 'baseline.safe.v2' },
  { id: 'rival', baseNode: 'rival-base', policyVersion: 'reference.greedy.v2' },
]

const DEFAULT_RESOURCES: ArenaScenario['resources'] = [
  // Valley center: high-volume, floodable risk
  { id: 'core-1', nodeId: 'valley-center', value: 1 },
  { id: 'core-2', nodeId: 'valley-center', value: 1 },
  { id: 'core-3', nodeId: 'valley-center', value: 1 },
  { id: 'core-4', nodeId: 'valley-center', value: 1 },
  // Ridge center: safe, high-value
  { id: 'core-5', nodeId: 'ridge-center', value: 2 },
  { id: 'core-6', nodeId: 'ridge-center', value: 2 },
  // Cross-route junctions: medium, safe
  { id: 'core-7', nodeId: 'cross-n', value: 1 },
  { id: 'core-8', nodeId: 'cross-n', value: 1 },
  { id: 'core-9', nodeId: 'cross-s', value: 1 },
  { id: 'core-10', nodeId: 'cross-s', value: 1 },
  // Ridge junctions: safe, spread out
  { id: 'core-11', nodeId: 'ridge-n1', value: 1 },
  { id: 'core-12', nodeId: 'ridge-s1', value: 1 },
]

function createBuilderScenario(
  id: string,
  seed: number,
  split: 'practice' | 'evaluation',
  durationTicks = 800,
  floods: { startTick: number; endTick: number }[] = [
    { startTick: 50, endTick: 300 },
    { startTick: 400, endTick: 650 },
  ],
  entrants: ArenaScenario['entrants'] = DEFAULT_ENTRANTS,
  resources: ArenaScenario['resources'] = DEFAULT_RESOURCES,
): ArenaScenario {
  return {
    id,
    // Abstract topology fixtures for headless training/eval — illustrative
    // positions only, never collider-grounded. See docs/COMPATIBILITY.md §4.
    worldVersion: 'builder-abstract-v1',
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
 * Each has different flood timing to teach multi-factor route selection.
 */
export const PRACTICE_SCENARIOS: ArenaScenario[] = [
  createBuilderScenario('builder-course-01', 20260905, 'practice', 800, [
    { startTick: 50, endTick: 300 },
    { startTick: 400, endTick: 650 },
  ]),
  createBuilderScenario('builder-course-02', 20260906, 'practice', 800, [
    { startTick: 100, endTick: 250 },
    { startTick: 350, endTick: 500 },
    { startTick: 600, endTick: 750 },
  ]),
  createBuilderScenario('builder-course-03', 20260907, 'practice', 800, [
    { startTick: 75, endTick: 400 },
    { startTick: 500, endTick: 700 },
  ]),
]

/**
 * Held-out evaluation scenarios. These must never be used as training/coaching
 * data; the registry below exposes helpers to guard against that.
 *
 * Includes:
 * - A baseline held-out with different seed and flood timing.
 * - A "swapped start" held-out where the champion starts at a resource node
 *   and the rival starts at the champion base, with resources redistributed.
 * - An adversarial "long flood" held-out where the low route is submerged for
 *   most of a longer episode.
 * - A "resource shift" held-out where high-value resources are moved to
 *   remote ridge nodes, testing long-route planning.
 */
export const HELD_OUT_SCENARIOS: ArenaScenario[] = [
  createBuilderScenario('builder-course-heldout-01', 20260910, 'evaluation', 800, [
    { startTick: 60, endTick: 220 },
    { startTick: 320, endTick: 480 },
    { startTick: 560, endTick: 720 },
  ]),
  createBuilderScenario(
    'builder-course-heldout-02',
    20260911,
    'evaluation',
    800,
    [
      { startTick: 50, endTick: 200 },
      { startTick: 400, endTick: 550 },
    ],
    [
      { id: 'champion', baseNode: 'ridge-center', policyVersion: 'baseline.safe.v2' },
      { id: 'rival', baseNode: 'champion-base', policyVersion: 'reference.greedy.v2' },
    ],
    [
      { id: 'core-1', nodeId: 'valley-n1', value: 2 },
      { id: 'core-2', nodeId: 'valley-s1', value: 2 },
      { id: 'core-3', nodeId: 'cross-n', value: 1 },
      { id: 'core-4', nodeId: 'cross-s', value: 1 },
      { id: 'core-5', nodeId: 'ridge-n1', value: 1 },
      { id: 'core-6', nodeId: 'ridge-s1', value: 1 },
    ],
  ),
  createBuilderScenario(
    'builder-course-heldout-03',
    20260912,
    'evaluation',
    1000,
    [{ startTick: 50, endTick: 700 }],
    DEFAULT_ENTRANTS,
    [
      { id: 'core-1', nodeId: 'valley-center', value: 1 },
      { id: 'core-2', nodeId: 'valley-center', value: 1 },
      { id: 'core-3', nodeId: 'ridge-center', value: 1 },
      { id: 'core-4', nodeId: 'ridge-center', value: 1 },
      { id: 'core-5', nodeId: 'ridge-n1', value: 1 },
      { id: 'core-6', nodeId: 'ridge-s1', value: 1 },
    ],
  ),
  createBuilderScenario(
    'builder-course-heldout-04',
    20260913,
    'evaluation',
    800,
    [
      { startTick: 100, endTick: 350 },
      { startTick: 450, endTick: 600 },
    ],
    DEFAULT_ENTRANTS,
    [
      // High-value resources on remote ridge nodes
      { id: 'core-1', nodeId: 'ridge-north', value: 2 },
      { id: 'core-2', nodeId: 'ridge-south', value: 2 },
      { id: 'core-3', nodeId: 'cross-c', value: 1 },
      { id: 'core-4', nodeId: 'cross-c', value: 1 },
      { id: 'core-5', nodeId: 'valley-center', value: 1 },
      { id: 'core-6', nodeId: 'valley-center', value: 1 },
    ],
  ),
]

const ALL_SCENARIOS = [...PRACTICE_SCENARIOS, ...HELD_OUT_SCENARIOS]
const EVALUATION_IDS = new Set(HELD_OUT_SCENARIOS.map(s => s.id))

export function getScenarioById(id: string): ArenaScenario | undefined {
  return ALL_SCENARIOS.find(s => s.id === id)
}

export function isEvaluationScenario(id: string): boolean {
  return EVALUATION_IDS.has(id) || id.startsWith('cloudbank-compete') || id.startsWith('sandstone-compete') || id.startsWith('sandstone-family')
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
