import { capacityOf, visibleNodeSet, type ArenaScenario, type EntrantTraits } from './arenaEpisode'

/**
 * Rule legibility: pure helpers that turn per-entrant rule parameters
 * (capacity, vision) into what the world view draws, so a player sees a rule
 * instead of having to read about it. Presentation only: nothing here feeds
 * back into the sim, and `visionNodes` reuses the sim's own `visibleNodeSet`
 * so the ring can never disagree with what the rover actually observes.
 */

/** Most cargo slots the stack will draw (the sim validates capacity 1 to 8). */
export const MAX_SLOTS_SHOWN = 8

/**
 * Whether an entrant carries a ruleset perk. Season 0 builds set speed,
 * battery and contact traits only, so they return false and keep the plain
 * stack; the extra legibility appears only under a ruleset that changes rules.
 */
export function hasRulesetPerk(traits: EntrantTraits | undefined): boolean {
  return traits?.capacity !== undefined || traits?.stealAll === true || (traits?.visionHops ?? 1) > 1
}

export interface CargoSlots {
  /** Slots the rover can carry, clamped to what the stack can draw. */
  capacity: number
  /** Slots holding a core. */
  filled: number
  /** Slots to draw: all of them under a ruleset perk, only the filled ones otherwise. */
  drawn: number
}

export function cargoSlots(agent: { cargo: number; traits?: EntrantTraits }): CargoSlots {
  const capacity = Math.min(MAX_SLOTS_SHOWN, Math.max(1, capacityOf(agent)))
  const filled = Math.min(Math.max(0, agent.cargo), capacity)
  return { capacity, filled, drawn: hasRulesetPerk(agent.traits) ? capacity : filled }
}

/** Slot position on the chassis (x, y): two columns, rows going up. */
export function slotOffset(index: number): [number, number] {
  return [((index % 2) - 0.5) * 0.16, Math.floor(index / 2) * 0.13]
}

/**
 * Nodes an extended-vision rover can see beyond the one it stands on, in the
 * sim's own terms. Empty for everyone on the default one-hop view, so only a
 * perk (the Scout's two hops) draws a ring.
 */
export function visionNodes(scenario: ArenaScenario, agent: { nodeId: string; traits?: EntrantTraits }): string[] {
  if ((agent.traits?.visionHops ?? 1) <= 1) return []
  return [...visibleNodeSet(scenario, agent)].filter(id => id !== agent.nodeId).sort()
}
