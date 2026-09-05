import type { ArenaAction, ArenaObservation } from './arenaEpisode'
import type { ArenaTrainingExample } from './policyTrainer'

export interface CoachingRule {
  id: string
  label: string
  description: string
  category: 'weather' | 'routing' | 'banking' | 'collection'
}

export const COACHING_RULES: readonly CoachingRule[] = Object.freeze([
  {
    id: 'avoid-flood',
    label: 'Climb the Ridge in Floods',
    description: 'Switch to the elevated ridge route whenever the low valley is submerged in water.',
    category: 'weather',
  },
  {
    id: 'drain-speedup',
    label: 'Drain when low route is urgent',
    description: 'Spend energy to clear flood water when carrying cargo through the short valley path.',
    category: 'weather',
  },
  {
    id: 'bank-at-capacity',
    label: 'Deliver when full',
    description: 'Prioritize returning to base as soon as cargo reaches maximum capacity.',
    category: 'banking',
  },
  {
    id: 'quick-collect',
    label: 'Prioritize adjacent cores',
    description: 'Always harvest an energy core when stopped at a resource station.',
    category: 'collection',
  },
])

/**
 * Analyzes an observation and chosen action against coach guidance, proposing a structured correction.
 */
export function proposeCorrection(
  prompt: string,
  observation: ArenaObservation,
  currentAction: ArenaAction,
  episodeId = 'practice-ep-1'
): ArenaTrainingExample | null {
  const lower = prompt.toLowerCase()
  const available = observation.availableActions

  // 1. Weather / Flood avoidance coaching
  if (lower.includes('flood') || lower.includes('high') || lower.includes('ridge') || lower.includes('water')) {
    if (observation.weather.flooded) {
      // Find a legal non-floodable ridge move
      const ridgeMove = available.find(a => {
        if (a.type !== 'move') return false
        const edge = observation.edges.find(e => e.id === a.edgeId)
        return edge && !edge.floodable
      })
      if (ridgeMove) {
        return {
          id: `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          sourceEpisodeId: episodeId,
          tick: observation.tick,
          observation,
          originalAction: currentAction,
          preferredAction: ridgeMove,
          rationale: 'Flooding is active; taking the non-floodable high ridge route avoids a 4x movement delay.',
          approved: false,
        }
      }

      // Or if carrying energy and in transit, drain!
      const drainAction = available.find(a => a.type === 'drain')
      if (drainAction) {
        return {
          id: `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          sourceEpisodeId: episodeId,
          tick: observation.tick,
          observation,
          originalAction: currentAction,
          preferredAction: drainAction,
          rationale: 'Flooding is active; activating drain ability opens the low route for safe passage.',
          approved: false,
        }
      }
    }
  }

  // 2. Banking coaching
  if (lower.includes('bank') || lower.includes('deliver') || lower.includes('home') || lower.includes('base')) {
    const bankAction = available.find(a => a.type === 'bank')
    if (bankAction) {
      return {
        id: `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        sourceEpisodeId: episodeId,
        tick: observation.tick,
        observation,
        originalAction: currentAction,
        preferredAction: bankAction,
        rationale: 'Station is base and rover has cargo; deliver banked resources.',
        approved: false,
      }
    }

    const homeMove = available.find(a => {
      if (a.type !== 'move') return false
      const edge = observation.edges.find(e => e.id === a.edgeId)
      if (!edge) return false
      const target = edge.from === observation.self.nodeId ? edge.to : edge.from
      return target === observation.self.baseNode
    })
    if (homeMove) {
      return {
        id: `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        sourceEpisodeId: episodeId,
        tick: observation.tick,
        observation,
        originalAction: currentAction,
        preferredAction: homeMove,
        rationale: 'Return cargo to base node along shortest path.',
        approved: false,
      }
    }
  }

  // 3. Collection coaching
  if (lower.includes('collect') || lower.includes('harvest') || lower.includes('core')) {
    const collectAction = available.find(a => a.type === 'collect')
    if (collectAction) {
      return {
        id: `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        sourceEpisodeId: episodeId,
        tick: observation.tick,
        observation,
        originalAction: currentAction,
        preferredAction: collectAction,
        rationale: 'Resource available at station; collect into cargo.',
        approved: false,
      }
    }
  }

  // 4. Manual move override to legal action
  if (available.length > 0) {
    const alternateMove = available.find(a => JSON.stringify(a) !== JSON.stringify(currentAction))
    if (alternateMove) {
      return {
        id: `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        sourceEpisodeId: episodeId,
        tick: observation.tick,
        observation,
        originalAction: currentAction,
        preferredAction: alternateMove,
        rationale: `Manual coach intervention: preferred ${alternateMove.type} over current choice.`,
        approved: false,
      }
    }
  }

  return null
}
