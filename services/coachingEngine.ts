import type { ArenaAction, ArenaObservation } from './arenaEpisode'
import type { ArenaTrainingExample, TrainingExampleSource } from './policyTrainer'

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

/** High-level training focus chips — map to proposeCorrection prompts, not new algorithms. */
export type SpecializationChip = {
  id: string
  label: string
  blurb: string
  prompt: string
  focus: 'weather' | 'banking' | 'collection' | 'contest' | 'energy'
}

export const SPECIALIZATION_CHIPS: readonly SpecializationChip[] = Object.freeze([
  {
    id: 'weather-ridge',
    label: 'Weather / Ridge',
    blurb: 'Survive floods on the high path',
    prompt: 'take the ridge route during flood',
    focus: 'weather',
  },
  {
    id: 'bank-cargo',
    label: 'Bank & cargo',
    blurb: 'Deliver when full; hustle home',
    prompt: 'bank cargo at base when full',
    focus: 'banking',
  },
  {
    id: 'grab-cores',
    label: 'Grab cores',
    blurb: 'Harvest whenever you stop on a core',
    prompt: 'prioritize energy core',
    focus: 'collection',
  },
  {
    id: 'energy-drain',
    label: 'Energy & drain',
    blurb: 'Spend energy to open the valley',
    prompt: 'drain when low route is urgent',
    focus: 'energy',
  },
  {
    id: 'contest',
    label: 'Contest cores',
    blurb: 'Beat the rival to contested stations',
    prompt: 'prioritize adjacent energy core before the rival',
    focus: 'contest',
  },
])

const FOCUS_LABELS: Record<SpecializationChip['focus'], string> = {
  weather: 'weather / ridge',
  banking: 'bank & cargo',
  collection: 'core collection',
  contest: 'contesting cores',
  energy: 'energy & drain',
}

function classifyExampleFocus(example: { rationale: string; preferredAction: { type: string } }): SpecializationChip['focus'] {
  const text = `${example.rationale} ${example.preferredAction.type}`.toLowerCase()
  if (text.includes('flood') || text.includes('ridge') || text.includes('water')) return 'weather'
  if (text.includes('drain') || text.includes('energy')) return 'energy'
  if (text.includes('bank') || text.includes('deliver') || text.includes('base') || example.preferredAction.type === 'bank') {
    return 'banking'
  }
  if (text.includes('rival') || text.includes('contest')) return 'contest'
  if (text.includes('collect') || text.includes('core') || text.includes('harvest') || example.preferredAction.type === 'collect') {
    return 'collection'
  }
  return 'collection'
}

/** One-line summary of what this training batch emphasized. */
export function summarizeCoachFocus(
  examples: ReadonlyArray<{ rationale: string; preferredAction: { type: string }; approved?: boolean }>,
): string | null {
  const approved = examples.filter(example => example.approved !== false)
  if (approved.length === 0) return null
  const counts = new Map<SpecializationChip['focus'], number>()
  for (const example of approved) {
    const focus = classifyExampleFocus(example)
    counts.set(focus, (counts.get(focus) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top = ranked.slice(0, 2).map(([focus]) => FOCUS_LABELS[focus])
  if (top.length === 1) return `This session focused on ${top[0]}.`
  return `This session focused on ${top[0]} and ${top[1]}.`
}

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
        source: 'draft' as TrainingExampleSource,
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
        source: 'draft' as TrainingExampleSource,
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
        source: 'draft' as TrainingExampleSource,
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
        source: 'draft' as TrainingExampleSource,
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
        source: 'draft' as TrainingExampleSource,
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
        source: 'draft' as TrainingExampleSource,
      }
    }
  }

  return null
}
