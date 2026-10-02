import type { ArenaAction } from './arenaEpisode'

/**
 * Makes the trained checkpoint legible.
 *
 * The comparison run already records every champion decision for both brains,
 * but the panel only ever surfaced a single score delta and the one tick where
 * the two first differed. That hides the actual lesson: a player who teaches
 * "avoid flooded low routes" cannot tell whether the brain learned it. This
 * module reduces the two decision traces to the shape of the change — how many
 * decisions moved, which action kinds shifted, and how often each brain got
 * stuck — so the UI can say "5 of 9 decisions changed; 4 fewer flooded-route
 * calls" instead of "loss 0.1841".
 *
 * Pure and derived from data already collected; nothing here affects the sim.
 */

export interface DecisionTrace {
  tick: number
  action: ArenaAction
  accepted: boolean
}

export interface ActionClassCounts {
  move: number
  collect: number
  bank: number
  drain: number
  wait: number
  /** Decisions the controller rejected — the clearest read on a stuck brain. */
  rejected: number
}

export interface BehaviourDelta {
  /** Decisions both runs made (same tick), split by identical vs changed. */
  compared: number
  changed: number
  /** Parent's action kind → trained's action kind, most common pairs first. */
  shifts: { from: string; to: string; count: number }[]
  parentCounts: ActionClassCounts
  trainedCounts: ActionClassCounts
  /** Counts where the trained run has fewer/more rejections than the parent. */
  rejectionDelta: number
  /** Earliest tick where the two brains took different accepted actions. */
  firstChangedTick: number | null
}

function emptyCounts(): ActionClassCounts {
  return { move: 0, collect: 0, bank: 0, drain: 0, wait: 0, rejected: 0 }
}

function tally(trace: DecisionTrace[]): ActionClassCounts {
  const counts = emptyCounts()
  for (const decision of trace) {
    if (!decision.accepted) {
      counts.rejected += 1
      continue
    }
    counts[decision.action.type] += 1
  }
  return counts
}

function sameAction(a: ArenaAction, b: ArenaAction) {
  if (a.type !== b.type) return false
  if (a.type === 'move' && b.type === 'move') return a.edgeId === b.edgeId
  if (a.type === 'collect' && b.type === 'collect') return a.resourceId === b.resourceId
  return true
}

/**
 * Compare two champion decision traces and summarize how the trained brain
 * behaves differently. Traces need not be the same length — only ticks present
 * in both are compared, which is exactly the population the original
 * first-divergence check used.
 */
export function summarizeBehaviourChange(
  parent: DecisionTrace[],
  trained: DecisionTrace[],
): BehaviourDelta {
  const trainedByTick = new Map(trained.map(decision => [decision.tick, decision]))
  const shifts = new Map<string, number>()
  let compared = 0
  let changed = 0
  let firstChangedTick: number | null = null

  for (const decision of parent) {
    const other = trainedByTick.get(decision.tick)
    if (!other) continue
    // Only accepted-on-both decisions are behaviour, not controller cadence.
    if (!decision.accepted || !other.accepted) continue
    compared += 1
    if (sameAction(decision.action, other.action)) continue
    changed += 1
    if (firstChangedTick === null) firstChangedTick = decision.tick
    const key = `${decision.action.type}→${other.action.type}`
    shifts.set(key, (shifts.get(key) ?? 0) + 1)
  }

  const parentCounts = tally(parent)
  const trainedCounts = tally(trained)

  return {
    compared,
    changed,
    shifts: [...shifts.entries()]
      .map(([key, count]) => ({ from: key.split('→')[0], to: key.split('→')[1], count }))
      .sort((a, b) => b.count - a.count),
    parentCounts,
    trainedCounts,
    rejectionDelta: trainedCounts.rejected - parentCounts.rejected,
    firstChangedTick,
  }
}

/**
 * One plain sentence describing the change, tuned for a player who did not
 * train the model and does not want to read logits.
 */
export function describeBehaviourChange(delta: BehaviourDelta): string {
  if (delta.compared === 0) return 'No shared decisions to compare on this run.'
  const rejectionNote = delta.rejectionDelta < 0
    ? ` · ${Math.abs(delta.rejectionDelta)} fewer stuck moments`
    : delta.rejectionDelta > 0
      ? ` · ${delta.rejectionDelta} more stuck moments`
      : ''
  if (delta.changed === 0) {
    // Escaping stuck moments is itself a lesson, so report it even when every
    // accepted decision matched.
    return rejectionNote
      ? `Chose the same ${delta.compared} decisions, but${rejectionNote} — this lesson stopped it getting stuck.`
      : `Identical play across all ${delta.compared} matched decisions — this lesson didn't change how it drives.`
  }
  const share = Math.round((delta.changed / delta.compared) * 100)
  const top = delta.shifts[0]
  const shiftNote = top && delta.changed > 1 ? ` — mostly ${top.from} → ${top.to}` : ''
  return `Changed ${delta.changed} of ${delta.compared} decisions (${share}%)${rejectionNote}${shiftNote}.`
}