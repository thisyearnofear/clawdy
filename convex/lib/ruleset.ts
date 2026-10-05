import { ConvexError } from 'convex/values'

/**
 * League rulesets (docs/RULESETS_PLAN.md, stream C). Training Grounds (Season 0)
 * is the default and is stored as an ABSENT `rulesetId`, so every row written
 * before rulesets existed already belongs to it and nothing needs a backfill.
 * Only named rulesets are stored explicitly. Ladders, pools, rounds and ratings
 * never mix across rulesets: every read filters on the same normalised value.
 */
export const LEAGUE_RULESETS = ['skirmish'] as const
export type LeagueRulesetId = (typeof LEAGUE_RULESETS)[number]

/** The stored form of a ruleset: `undefined` for Training Grounds. */
export type StoredRuleset = LeagueRulesetId | undefined

/** Validates a client-supplied ruleset id; absent means Training Grounds. */
export function normalizeRuleset(rulesetId: string | undefined | null): StoredRuleset {
  if (rulesetId === undefined || rulesetId === null) return undefined
  if (!LEAGUE_RULESETS.includes(rulesetId as LeagueRulesetId)) throw new ConvexError('unknown-ruleset')
  return rulesetId as LeagueRulesetId
}

/** Reads a stored row's ruleset (rows from before rulesets carry none). */
export function rulesetOf(row: { rulesetId?: string }): StoredRuleset {
  return row.rulesetId === undefined ? undefined : normalizeRuleset(row.rulesetId)
}

/** Round refs are namespaced so two rulesets can both have a "round 1". */
export function roundRef(rulesetId: StoredRuleset, round: number): string {
  return rulesetId ? `${rulesetId}-round-${round}` : `round-${round}`
}
