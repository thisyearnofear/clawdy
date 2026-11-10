import type { ArenaCourse } from './arenaCourse'
import type { ArenaScenario } from './arenaEpisode'

/**
 * Track A — "Prompt the Arena" (AI Builder Hackathon, Nov 2026).
 *
 * Free text → a bounded `CustomClashSpec` (flood schedule, core placement and
 * values, duration, rival house bot) → a new **practice-split Clash** on the
 * same pinned grounded world. The LLM never invents geometry: nodes and edges
 * are cloned untouched from the loaded course (`sandstone-basin.glb` collider
 * stays byte-pinned), and every spec field is clamped to the ranges the
 * episode validator enforces. If the spec cannot produce a playable board —
 * the champion must still dry-reach a core — it is rejected before any course
 * is built. Generated Clashes are unranked and never touch held-out ids or
 * the evaluation split, so eval-gate pins are unaffected.
 */

export interface CustomClashSpec {
  /** ≤ 12 windows, each inside [0, durationTicks). Sorted on sanitize. */
  floods: { startTick: number; endTick: number }[]
  /** ≤ 24 cores on existing nodes, value 1..8. */
  resources: { nodeId: string; value: number }[]
  durationTicks: number
  seed: number
  /** Rival house bot for this Clash; `poach` is the session default. */
  rivalStrategy: 'safe' | 'greedy' | 'weather' | 'poach'
}

export const CUSTOM_CLASH_BOUNDS = {
  maxFloods: 12,
  maxResources: 24,
  minDuration: 600,
  maxDuration: 2400,
  maxFloodWindowsPerDuration: 12,
} as const

export const RIVAL_STRATEGIES = ['safe', 'greedy', 'weather', 'poach'] as const
export type RivalStrategy = (typeof RIVAL_STRATEGIES)[number]

const CUSTOM_ID_PREFIX = 'clash-custom'

function isInteger(value: unknown, min: number, max: number): value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return false
  return value >= min && value <= max
}

/** Plain-text digest of the course the translator may place things on. */
export function customClashDigest(course: ArenaCourse): string {
  const scenario = course.scenario
  const lines: string[] = []
  const baseNodeIds = new Set(scenario.entrants.map(entrant => entrant.baseNode))
  lines.push(`Grounded arena: ${course.config.name}. Duration currently ${scenario.durationTicks} ticks (allowed ${CUSTOM_CLASH_BOUNDS.minDuration}–${CUSTOM_CLASH_BOUNDS.maxDuration}).`)
  const floodableNodes = new Set<string>()
  for (const edge of scenario.edges) {
    if (edge.floodable) {
      floodableNodes.add(edge.from)
      floodableNodes.add(edge.to)
    }
  }
  lines.push(`Stations (cores may be placed on any): ${scenario.nodes.filter(node => !baseNodeIds.has(node.id)).map(node => node.id).join(', ')}.`)
  lines.push(`Base pads (cores are never placed here): ${[...baseNodeIds].join(', ')}.`)
  lines.push(`Valley stations (flood-exposed, risky but short): ${[...floodableNodes].join(', ') || 'none'}; all others stay dry.`)
  lines.push(`Champion base: ${scenario.entrants.find(entrant => entrant.id === 'champion')?.baseNode}; rival base: ${scenario.entrants.find(entrant => entrant.id === 'rival')?.baseNode}.`)
  lines.push(`Core values: 1 (common) to 8 (jackpot), at most ${CUSTOM_CLASH_BOUNDS.maxResources} cores total.`)
  lines.push(`Floods: at most ${CUSTOM_CLASH_BOUNDS.maxFloods} windows, each { startTick, endTick } inside the duration, when the valley routes drown.`)
  lines.push(`Rival house bots: ${RIVAL_STRATEGIES.join(', ')} (poach races you to cores, weather plays the flood, safe banks carefully, greedy overextends).`)
  return lines.join('\n')
}

/**
 * Clamps and validates a translator-produced spec against the real course.
 * Returns a normalized spec, or null with a reason the UI can show honestly.
 */
export function sanitizeCustomClashSpec(
  raw: unknown,
  course: ArenaCourse,
): { spec: CustomClashSpec } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'The arena translator returned nothing usable.' }
  const candidate = raw as Record<string, unknown>
  const nodeIds = new Set(course.scenario.nodes.map(node => node.id))
  const baseNodeIds = new Set(course.scenario.entrants.map(entrant => entrant.baseNode))

  const duration = candidate.durationTicks
  if (!isInteger(duration, CUSTOM_CLASH_BOUNDS.minDuration, CUSTOM_CLASH_BOUNDS.maxDuration)) {
    return { error: `Pick a Clash length between ${CUSTOM_CLASH_BOUNDS.minDuration} and ${CUSTOM_CLASH_BOUNDS.maxDuration} ticks.` }
  }

  const floodsRaw = candidate.floods
  if (!Array.isArray(floodsRaw) || floodsRaw.length === 0 || floodsRaw.length > CUSTOM_CLASH_BOUNDS.maxFloods) {
    return { error: `Describe between 1 and ${CUSTOM_CLASH_BOUNDS.maxFloods} flood windows.` }
  }
  const floods: { startTick: number; endTick: number }[] = []
  for (const window of floodsRaw) {
    if (typeof window !== 'object' || window === null) return { error: 'A flood window was malformed.' }
    const { startTick, endTick } = window as { startTick?: unknown; endTick?: unknown }
    if (!isInteger(startTick, 0, duration - 1) || !isInteger(endTick, startTick + 1, duration)) {
      return { error: 'A flood window falls outside the Clash length or is empty.' }
    }
    floods.push({ startTick, endTick })
  }
  floods.sort((a, b) => a.startTick - b.startTick)

  const resourcesRaw = candidate.resources
  if (!Array.isArray(resourcesRaw) || resourcesRaw.length === 0 || resourcesRaw.length > CUSTOM_CLASH_BOUNDS.maxResources) {
    return { error: `Place between 1 and ${CUSTOM_CLASH_BOUNDS.maxResources} cores on the stations.` }
  }
  const resources: { nodeId: string; value: number }[] = []
  for (const resource of resourcesRaw) {
    if (typeof resource !== 'object' || resource === null) return { error: 'A core placement was malformed.' }
    const { nodeId, value } = resource as { nodeId?: unknown; value?: unknown }
    if (typeof nodeId !== 'string' || !nodeIds.has(nodeId)) return { error: `Cores can only sit on real stations — "${String(nodeId)}" is not one.` }
    if (isInteger(value, 1, 8)) resources.push({ nodeId, value })
    else return { error: 'Core values run from 1 to 8.' }
  }

  const seedRaw = candidate.seed
  const seed = isInteger(seedRaw, 0, 0xffffffff) ? seedRaw : (Date.now() & 0xffffffff)

  const rivalRaw = candidate.rivalStrategy
  const rivalStrategy: RivalStrategy = typeof rivalRaw === 'string' && (RIVAL_STRATEGIES as readonly string[]).includes(rivalRaw)
    ? (rivalRaw as RivalStrategy)
    : 'poach'

  // Playability mirrors of the episode validator's structural rules, checked
  // eagerly so a broken spec never reaches the session.
  const adjacency = new Map<string, { to: string; floodable: boolean }[]>()
  for (const edge of course.scenario.edges) {
    for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]] as const) {
      const list = adjacency.get(from) ?? []
      list.push({ to, floodable: edge.floodable })
      adjacency.set(from, list)
    }
  }
  const reach = (from: string, dryOnly: boolean): Set<string> => {
    const seen = new Set<string>([from])
    const queue = [from]
    while (queue.length > 0) {
      const current = queue.pop()!
      for (const next of adjacency.get(current) ?? []) {
        if (dryOnly && next.floodable) continue
        if (!seen.has(next.to)) {
          seen.add(next.to)
          queue.push(next.to)
        }
      }
    }
    return seen
  }
  const resourceNodes = new Set(resources.map(resource => resource.nodeId))
  for (const entrant of course.scenario.entrants) {
    const reachable = reach(entrant.baseNode, false)
    if (![...resourceNodes].some(node => reachable.has(node))) {
      return { error: 'Every rover must be able to reach at least one core — place cores closer to both bases.' }
    }
  }
  const championBase = course.scenario.entrants.find(entrant => entrant.id === 'champion')?.baseNode
  if (!championBase) return { error: 'This course has no champion base.' }
  const dryReach = reach(championBase, true)
  if (![...resourceNodes].some(node => dryReach.has(node))) {
    return { error: 'The champion must have one core reachable without crossing floodable valley routes — keep at least one core on high ground.' }
  }
  // Cores never spawn on a base pad: banking next to an instant core trivializes the loop.
  if ([...resourceNodes].some(node => baseNodeIds.has(node))) {
    return { error: 'Cores cannot sit on a base pad — put them out on the routes.' }
  }

  return { spec: { floods, resources, durationTicks: duration, seed, rivalStrategy } }
}

/**
 * Builds the playable Clash course from a sanitized spec. Same grounded world
 * (nodes/edges/path geometry cloned untouched), new practice-split scenario.
 * The scenario id is namespaced so every recorded fact about it is visibly
 * player-authored, and `isEvaluationScenario` never matches it.
 */
export function buildCustomClash(course: ArenaCourse, spec: CustomClashSpec): ArenaCourse {
  const next = structuredClone(course)
  const scenario: ArenaScenario = next.scenario
  scenario.id = `${CUSTOM_ID_PREFIX}-${spec.seed.toString(36)}`
  scenario.split = 'practice'
  scenario.seed = spec.seed
  scenario.durationTicks = spec.durationTicks
  scenario.floods = spec.floods.map(window => ({ ...window }))
  scenario.resources = spec.resources.map((resource, index) => ({ id: `core-${index + 1}`, nodeId: resource.nodeId, value: resource.value }))
  scenario.entrants = scenario.entrants.map(entrant =>
    entrant.id === 'rival' ? { ...entrant, policyVersion: `reference.${spec.rivalStrategy}.v2` } : entrant,
  )
  // A described Clash is Training Grounds only: no ruleset perks, no rush contact.
  delete scenario.rulesetId
  delete scenario.rush
  return next
}
