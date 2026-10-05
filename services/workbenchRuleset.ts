import type { ArenaCourse } from './arenaCourse'
import { capacityOf } from './arenaEpisode'
import { baseBuild, buildToTraits, type Build, type ChassisId, type RulesetId } from './chassis'

export const SKIRMISH_UNLOCK_KEY = 'clawdy_skirmish_unlocked_v1'
const UNLOCK_EVENT = 'clawdy:skirmish-unlocked'
let sessionUnlocked = false

export function skirmishDisclosure(progress: { unlocked: boolean; hasCompletedRun: boolean; hasOwnBrain: boolean }) {
  return {
    canSelect: progress.unlocked,
    canSkip: !progress.unlocked && (progress.hasCompletedRun || progress.hasOwnBrain),
  }
}

export function isSkirmishUnlocked(): boolean {
  try { return sessionUnlocked || (typeof window !== 'undefined' && window.localStorage.getItem(SKIRMISH_UNLOCK_KEY) === '1') }
  catch { return sessionUnlocked }
}

/** Publishing or skipping only adds access, including when storage is unavailable. */
export function unlockSkirmish(): void {
  sessionUnlocked = true
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(SKIRMISH_UNLOCK_KEY, '1') } catch { /* Session access still works. */ }
  window.dispatchEvent(new Event(UNLOCK_EVENT))
}

export function subscribeSkirmishUnlock(listener: () => void): () => void {
  window.addEventListener(UNLOCK_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(UNLOCK_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

export function leagueBrainId(checkpointId: string, rulesetId?: RulesetId): string {
  return rulesetId ? `${checkpointId}::${rulesetId}` : checkpointId
}

/** Omitted ruleset keeps the pinned Training Grounds course unchanged. */
export function courseForRuleset(course: ArenaCourse, build: Build, rulesetId?: RulesetId): ArenaCourse {
  if (rulesetId === undefined) return course
  const next = structuredClone(course)
  next.scenario.id = `${course.scenario.id}.${rulesetId}`
  next.scenario.rulesetId = rulesetId
  next.scenario.entrants = next.scenario.entrants.map(entrant => ({
    ...entrant,
    traits: buildToTraits(entrant.id === 'champion' ? build : baseBuild('hauler'), rulesetId),
  }))
  return next
}

export function chassisRuleSummary(chassis: ChassisId, rulesetId?: RulesetId): string {
  const traits = buildToTraits(baseBuild(chassis), rulesetId)
  const capacity = capacityOf({ traits })
  if (rulesetId === undefined) return `Carries ${capacity} cargo. Sees one route hop. No signature perk in Training Grounds.`
  if (traits.stealAll) return `Carries ${capacity} cargo. A winning bump steals the rival's whole load, limited by free cargo space.`
  if ((traits.visionHops ?? 1) > 1) return `Carries ${capacity} cargo. Sees two route hops, including cores beyond the next junction.`
  return `Carries ${capacity} cargo instead of 3. Bank a bigger load per trip.`
}
