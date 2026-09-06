import type { ArenaScenario } from '../services/arenaEpisode'

const NODES = [
  { id: 'champion-base', position: [0, 0, 0] as [number, number, number] },
  { id: 'rival-base', position: [14, 0, 8] as [number, number, number] },
  { id: 'low-pass', position: [4, 0, 2] as [number, number, number] },
  { id: 'ridge-center', position: [7, 3, 5] as [number, number, number] },
  { id: 'resource-bank', position: [10, 0, 3] as [number, number, number] },
]

const EDGES = [
  { id: 'base-to-low', from: 'champion-base', to: 'low-pass', travelTicks: 25, floodable: true },
  { id: 'base-to-ridge', from: 'champion-base', to: 'ridge-center', travelTicks: 40, floodable: false },
  { id: 'low-to-bank', from: 'low-pass', to: 'resource-bank', travelTicks: 25, floodable: true },
  { id: 'ridge-to-bank', from: 'ridge-center', to: 'resource-bank', travelTicks: 35, floodable: false },
  // Rival is placed on a long, inert edge so the builder scenario focuses on champion behavior.
  { id: 'rival-to-bank', from: 'rival-base', to: 'resource-bank', travelTicks: 1000, floodable: false },
]

const ENTRANTS = [
  { id: 'champion', baseNode: 'champion-base', policyVersion: 'baseline.safe.v2' },
  { id: 'rival', baseNode: 'rival-base', policyVersion: 'reference.greedy.v2' },
]

const RESOURCES = [
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
): ArenaScenario {
  return {
    id,
    worldVersion: 'course-01-v2',
    split,
    seed,
    durationTicks,
    nodes: NODES,
    edges: EDGES,
    entrants: ENTRANTS,
    resources: RESOURCES,
    floods,
  }
}

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

export const HELD_OUT_SCENARIOS: ArenaScenario[] = [
  createBuilderScenario('builder-course-heldout-01', 20260910, 'evaluation', 600, [
    { startTick: 60, endTick: 220 },
    { startTick: 320, endTick: 480 },
  ]),
]
