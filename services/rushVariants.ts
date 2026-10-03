import type { ArenaScenario } from './arenaEpisode'
import { createRng } from './rng'

/**
 * Seeded Rush variants of one base scenario. The map stays the same, but the
 * spawn waves and flood windows move, so a rover cannot memorise a timetable.
 *
 * - `train` variants are practice-split and may be used to learn from.
 * - `hidden` variants are evaluation-split (ids start with
 *   `sandstone-rush-hidden`, which `isEvaluationScenario` refuses for
 *   training). The ladder picks their seeds server-side.
 *
 * Pure and deterministic: (base, kind, seed) always yields the same scenario.
 */
export type RushVariantKind = 'train' | 'hidden'

/** Also the half-width of the public wave windows: a variant never spawns outside them. */
export const WAVE_JITTER_TICKS = 60
const MIN_WAVE_GAP_TICKS = 150

export function rushVariant(base: ArenaScenario, kind: RushVariantKind, seed: number): ArenaScenario {
  if (!base.rush) throw new Error('rushVariant needs a Rush base scenario')
  const rng = createRng(seed * 2654435761 + (kind === 'hidden' ? 1 : 0))
  const jitter = (amount: number) => Math.round((rng() * 2 - 1) * amount)

  // Waves keep their order and a minimum gap, and stay inside the match.
  const spawnIndexes = base.resources.flatMap((resource, index) => (resource.spawnTick === undefined ? [] : [index]))
  const spawnTicks: number[] = []
  for (const index of spawnIndexes) {
    const nominal = base.resources[index].spawnTick!
    const previous = spawnTicks.at(-1)
    const earliest = previous === undefined ? 60 : previous + MIN_WAVE_GAP_TICKS
    spawnTicks.push(Math.min(base.durationTicks - 100, Math.max(earliest, nominal + jitter(WAVE_JITTER_TICKS))))
  }

  const floods = base.floods.map(flood => {
    const startTick = Math.max(0, Math.min(base.durationTicks - 120, flood.startTick + jitter(70)))
    const length = Math.max(150, flood.endTick - flood.startTick + jitter(60))
    return { startTick, endTick: Math.min(base.durationTicks, startTick + length) }
  })

  const resources = base.resources.map((resource, index) => {
    const at = spawnIndexes.indexOf(index)
    return at === -1 ? { ...resource } : { ...resource, spawnTick: spawnTicks[at] }
  })

  return {
    ...base,
    id: `sandstone-rush-${kind}-${seed}`,
    split: kind === 'hidden' ? 'evaluation' : 'practice',
    seed: (base.seed + seed * 7919) >>> 0,
    resources,
    floods,
  }
}

/** The same scenario with the two entrants' starting bases exchanged. */
export function swapSides(scenario: ArenaScenario): ArenaScenario {
  const [first, second] = scenario.entrants
  return {
    ...scenario,
    entrants: [
      { ...first, baseNode: second.baseNode },
      { ...second, baseNode: first.baseNode },
    ],
  }
}
