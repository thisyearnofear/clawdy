import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

/**
 * League schedule (docs/LEAGUE_PLAN.md, Stream C): every six hours the listed
 * brains in each mode are paired by rating and raced on fresh hidden seeds.
 * Matches are ~0.3 s of server CPU each, so a round stays cheap even as the
 * pool grows. Rounds can also be run on demand:
 * `npx convex run --prod leagueRun:runRound '{"mode":"rush"}'` is not possible
 * (internal), but a deployment admin can invoke it from the Convex dashboard
 * or a dev shell.
 */
const crons = cronJobs()

crons.interval('league tournament round', { hours: 6 }, internal.leagueRun.runRound, { mode: 'rush' })

// Per-ruleset rounds: Skirmish has its own pool, ratings and round numbers. A no-op until two Skirmish brains are listed.
crons.interval('league skirmish round', { hours: 6 }, internal.leagueRun.runRound, { mode: 'rush', rulesetId: 'skirmish' })

// Forge safety net (Stream D): fail overdue forges and restart quiet polls. See convex/forge.ts sweep.
crons.interval('forge sweep', { minutes: 2 }, internal.forge.sweep, {})

export default crons
