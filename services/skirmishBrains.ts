import scoutJson from '../starter/skirmish-scout.json'
import haulerJson from '../starter/skirmish-hauler.json'
import raiderJson from '../starter/skirmish-raider.json'
import type { ChassisId, RulesetId } from './chassis'
import { validateCheckpoint, type PolicyCheckpoint } from './policyModel'
import { SEASON_0_STARTER_CHECKPOINT, isBundledStarter } from './starterCheckpoint'

/**
 * House brains trained under Skirmish, one per chassis (docs/CHASSIS_RESULTS.md,
 * seed 11). They read the chassis traits, so they only make sense with the
 * matching build. Balance is not claimed; Hauler↔Scout is near-parity under v5+ levers.
 */
const BRAINS: Record<ChassisId, PolicyCheckpoint> = {
  scout: scoutJson as PolicyCheckpoint,
  hauler: haulerJson as PolicyCheckpoint,
  raider: raiderJson as PolicyCheckpoint,
}
for (const brain of Object.values(BRAINS)) validateCheckpoint(brain)

const SKIRMISH_IDS = new Set(Object.values(BRAINS).map(brain => brain.id))

export const SKIRMISH_HOUSE_BRAINS: Readonly<Record<ChassisId, PolicyCheckpoint>> = Object.freeze(BRAINS)

export function isSkirmishHouseBrain(checkpoint: { id: string }): boolean {
  return SKIRMISH_IDS.has(checkpoint.id)
}

/**
 * The brain that should be active for a ruleset and chassis. House brains swap
 * automatically; a player's own brain is never replaced.
 */
export function brainForRuleset(active: PolicyCheckpoint, chassis: ChassisId, rulesetId?: RulesetId): PolicyCheckpoint {
  const isHouse = isBundledStarter(active) || isSkirmishHouseBrain(active)
  if (!isHouse) return active
  return rulesetId === 'skirmish' ? BRAINS[chassis] : SEASON_0_STARTER_CHECKPOINT
}
