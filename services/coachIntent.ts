import type { ArenaAction, ArenaObservation } from './arenaEpisode'
import type { ArenaTrainingExample } from './policyTrainer'

/**
 * Plain-language → structured correction, the AI Builder Hackathon path.
 *
 * The LLM (or any future translator) only ever proposes a `CoachIntent`: an
 * action reference plus a rationale. It can never invent a move —
 * `resolveCoachIntent` checks the proposed action against the *recorded*
 * observation's `availableActions` (the same legal set the match authority
 * computed at that tick) and rejects anything else. The output is the same
 * reviewable `ArenaTrainingExample` draft `proposeCorrection` produces, and
 * the human still approves it before any training. Nothing here touches the
 * match authority, the policy, or the trainer; eval-gate pins are unaffected.
 */

export interface CoachIntent {
  action: ArenaAction
  rationale: string
}

const equalAction = (a: ArenaAction, b: ArenaAction) => JSON.stringify(a) === JSON.stringify(b)

let counter = 0
function nextExampleId(): string {
  counter += 1
  return `ex-ai-${Date.now().toString(36)}-${counter.toString(36)}`
}

/**
 * Turns a translated intent into a reviewable draft, or null when the intent
 * does not name a legal, different action at this recorded tick. `viaLabel`
 * is embedded in the rationale so every AI-interpreted example is labeled
 * as such — no invented explainability.
 */
export function resolveCoachIntent(
  intent: unknown,
  observation: ArenaObservation,
  originalAction: ArenaAction,
  episodeId: string,
): ArenaTrainingExample | null {
  if (typeof intent !== 'object' || intent === null) return null
  const { action, rationale } = intent as { action?: unknown; rationale?: unknown }
  if (typeof rationale !== 'string' || rationale.trim().length === 0 || rationale.length > 400) return null
  if (typeof action !== 'object' || action === null) return null
  const candidate = action as { type?: unknown; edgeId?: unknown; resourceId?: unknown }
  let proposed: ArenaAction | undefined
  if (candidate.type === 'move' && typeof candidate.edgeId === 'string') {
    proposed = { type: 'move', edgeId: candidate.edgeId }
  } else if (candidate.type === 'collect' && typeof candidate.resourceId === 'string') {
    proposed = { type: 'collect', resourceId: candidate.resourceId }
  } else if (candidate.type === 'bank' || candidate.type === 'drain' || candidate.type === 'wait') {
    proposed = { type: candidate.type }
  }
  if (!proposed) return null
  // The authority's own legal set, not a re-implementation of its rules.
  if (!observation.availableActions.some(legal => equalAction(legal, proposed!))) return null
  if (equalAction(proposed, originalAction)) return null
  const clean = rationale.trim().replace(/\s+/g, ' ')
  return {
    id: nextExampleId(),
    sourceEpisodeId: episodeId,
    tick: observation.tick,
    observation: structuredClone(observation),
    originalAction: structuredClone(originalAction),
    preferredAction: proposed,
    rationale: `AI-interpreted note: ${clean} (a coach preference, not a measured improvement — approve before training.)`,
    approved: false,
    source: 'draft',
    provenance: { kind: 'human' },
  }
}

/**
 * Compact, plain-text digest of what the rover may legally do at this tick —
 * everything the translator is allowed to choose from. Flood state, blocked
 * edges and travel costs are included so the rationale can be specific, but
 * the resolver above remains the only thing that decides legality.
 */
export function legalActionSummary(observation: ArenaObservation): string {
  const self = observation.self
  const lines: string[] = []
  lines.push(`tick ${observation.tick} of ${observation.tick + observation.remainingTicks}; cargo ${self.cargo}/cap; energy ${self.energy}; flooded: ${observation.weather.flooded ? 'yes' : 'no'}`)
  if (self.transit) lines.push(`currently in transit on route ${self.transit.edgeId} (${self.transit.progressUnits}/${self.transit.requiredUnits})`)
  lines.push(`at node: ${self.nodeId}; base node: ${self.baseNode}`)
  for (const edge of observation.edges) {
    const blocked = edge.blocked ? ' BLOCKED' : ''
    const floodRisk = edge.floodable ? ' (floodable)' : ''
    lines.push(`route ${edge.id}: ${edge.from}→${edge.to}, ${edge.currentTravelTicks} ticks${floodRisk}${blocked}`)
  }
  for (const resource of observation.resources) {
    if (resource.available) lines.push(`collect core ${resource.id} (value ${resource.value}) at node ${resource.nodeId}${self.nodeId === resource.nodeId ? ' — HERE' : ''}`)
  }
  if (observation.availableActions.some(action => action.type === 'bank')) lines.push('bank: deliver cargo at base (available now)')
  if (observation.availableActions.some(action => action.type === 'drain')) lines.push('drain: spend energy to clear flood water (available now)')
  lines.push('wait: hold position (always available)')
  return lines.join('\n')
}
