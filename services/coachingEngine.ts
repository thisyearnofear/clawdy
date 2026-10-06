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
export type SpecializationFocus = 'weather' | 'banking' | 'collection' | 'contest' | 'energy'

export type SpecializationChip = {
  id: string
  label: string
  blurb: string
  prompt: string
  focus: SpecializationFocus
}

export type FocusVector = Record<SpecializationFocus, number>

export const SPECIALIZATION_FOCI: readonly SpecializationFocus[] = Object.freeze([
  'weather',
  'banking',
  'collection',
  'contest',
  'energy',
])

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

export const FOCUS_LABELS: Record<SpecializationFocus, string> = {
  weather: 'weather / ridge',
  banking: 'bank & cargo',
  collection: 'core collection',
  contest: 'contesting cores',
  energy: 'energy & drain',
}

export function emptyFocusVector(): FocusVector {
  return { weather: 0, banking: 0, collection: 0, contest: 0, energy: 0 }
}

export function classifyExampleFocus(example: {
  rationale: string
  preferredAction: { type: string }
}): SpecializationFocus {
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

export function focusVectorFromExamples(
  examples: ReadonlyArray<{ rationale: string; preferredAction: { type: string }; approved?: boolean }>,
): FocusVector {
  const counts = emptyFocusVector()
  let total = 0
  for (const example of examples) {
    if (example.approved === false) continue
    const focus = classifyExampleFocus(example)
    counts[focus] += 1
    total += 1
  }
  if (total === 0) return emptyFocusVector()
  const vector = emptyFocusVector()
  for (const key of SPECIALIZATION_FOCI) vector[key] = counts[key] / total
  return vector
}

export function houseFocusVector(strategy: 'safe' | 'greedy' | 'weather' | 'learned' | 'poach'): FocusVector {
  if (strategy === 'greedy') {
    return { weather: 0.08, banking: 0.18, collection: 0.42, contest: 0.24, energy: 0.08 }
  }
  if (strategy === 'poach') {
    return { weather: 0.1, banking: 0.12, collection: 0.16, contest: 0.52, energy: 0.1 }
  }
  if (strategy === 'weather') {
    return { weather: 0.48, banking: 0.1, collection: 0.12, contest: 0.05, energy: 0.25 }
  }
  if (strategy === 'learned') {
    return { weather: 0.2, banking: 0.2, collection: 0.2, contest: 0.2, energy: 0.2 }
  }
  return { weather: 0.32, banking: 0.26, collection: 0.24, contest: 0.08, energy: 0.1 }
}

export function topFocusLabels(vector: FocusVector, limit = 2): string[] {
  return SPECIALIZATION_FOCI
    .map(focus => ({ focus, value: vector[focus] }))
    .filter(entry => entry.value > 0.04)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map(entry => FOCUS_LABELS[entry.focus])
}

/** One-line summary of what this training batch emphasized. */
export function summarizeCoachFocus(
  examples: ReadonlyArray<{ rationale: string; preferredAction: { type: string }; approved?: boolean }>,
): string | null {
  const approved = examples.filter(example => example.approved !== false)
  if (approved.length === 0) return null
  const vector = focusVectorFromExamples(approved)
  const top = topFocusLabels(vector, 2)
  if (top.length === 0) return null
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
  // Drain chip: propose drain only during flooded transit. If the frame is
  // not a legal drain moment (e.g. parked at a station), fall through so
  // ridge/flood coaching can still fire — never hard-return null here.
  if (lower.includes('drain')) {
    const drain = available.find(action => action.type === 'drain')
    if (drain && observation.weather.flooded && observation.self.transit) {
      return {
        id: `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        sourceEpisodeId: episodeId,
        tick: observation.tick,
        observation,
        originalAction: currentAction,
        preferredAction: drain,
        rationale: 'Coach prefers draining during flooded transit. It spends energy and clears the valley for both rovers; improvement is not guaranteed.',
        approved: false,
        source: 'draft' as TrainingExampleSource,
      }
    }
  }
  // Ridge / flood coaching. Also matches drain prompts that fell through so
  // the energy-drain chip can still suggest the high path at a flooded station.
  if (lower.includes('flood') || lower.includes('high') || lower.includes('ridge') || lower.includes('water') || lower.includes('drain')) {
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

      // Drain fallback: transit-only. Proposing drain at a station fights the
      // weather teacher's restraint arm (routing/collect beats a 2-energy spend).
      const drainAction = available.find(a => a.type === 'drain')
      if (drainAction && observation.self.transit) {
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

  // 4. Unsupported guidance needs an explicit choice, never an arbitrary move.
  return null
}

/**
 * Per-example importance for the browser coach-train path. Weather and energy
 * (drain) notes weigh more so flood timing moves the weights harder than
 * routine routing — mirrors consequence weighting on the distill path.
 */
export function coachingSampleWeights(
  examples: ReadonlyArray<{ rationale: string; preferredAction: { type: string }; approved?: boolean }>,
): number[] {
  return examples
    .filter(example => example.approved !== false)
    .map(example => {
      const focus = classifyExampleFocus(example)
      return focus === 'weather' || focus === 'energy' ? 2 : 1
    })
}

/**
 * When the approved batch is weather-led (ridge/flood or drain), compare the
 * new brain against the weather house bot — not the live session rival
 * (default poach). Contest/bank/collect batches keep the session rival.
 */
export function comparisonRivalForCoaching<R>(
  examples: ReadonlyArray<{ rationale: string; preferredAction: { type: string }; approved?: boolean }>,
  sessionRival: R,
): R | 'weather' {
  const vector = focusVectorFromExamples(examples)
  if (vector.weather + vector.energy >= 0.5) return 'weather'
  return sessionRival
}
