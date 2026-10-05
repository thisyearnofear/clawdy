import { CHASSIS_IDS, type ChassisId } from './chassis'

/**
 * Forge your champion (league plan, Stream D): a Convex action asks Tripo for a
 * rover body in the player's chosen chassis and paint. Everything that decides
 * whether a forge may run, and what the player is told, lives here as pure
 * functions so the limits are unit-tested without Convex or the network.
 */

/** Tripo P1 text-to-model with PBR textures consumed 40 credits per task when measured on Oct 5. */
export const FORGE_CREDITS = 40
/** Successful or in-flight forges one account may hold. */
export const DEFAULT_PER_ACCOUNT_LIMIT = 2
/** Credits the Forge may reserve across all accounts. Failed forges are refunded. */
export const DEFAULT_GLOBAL_CREDIT_CAP = 2000
/** Give up polling Tripo after this long. */
export const FORGE_TIMEOUT_MS = 8 * 60_000
export const FORGE_POLL_MS = 5_000
/** A pending forge whose poll has not started for this long is restarted by the sweep. */
export const FORGE_POLL_STALE_MS = 45_000

/** Paint is a fixed menu, never free text, so the prompt cannot be steered by a player. */
export const FORGE_PAINTS = ['moss', 'ember', 'ice', 'violet', 'sand'] as const
export type ForgePaint = (typeof FORGE_PAINTS)[number]

const PAINT_WORDS: Record<ForgePaint, string> = {
  moss: 'moss green and charcoal',
  ember: 'ember orange and charcoal',
  ice: 'ice blue and white',
  violet: 'violet and gunmetal',
  sand: 'sand yellow and brown',
}

const CHASSIS_WORDS: Record<ChassisId, string> = {
  scout: 'Small light fast scout rover robot, sleek low aerodynamic body, four wheels, compact sensor mast',
  hauler: 'Low wide heavy tracked cargo hauler robot, thick plated armor, open cargo bed, rugged and sturdy',
  raider: 'Aggressive angular raider rover robot, wedge-shaped front with a heavy steel ram plate, chunky wheels',
}

export const FORGE_NEGATIVE_PROMPT = 'ground, base, platform, text, people, floating parts, detached pieces'

export function isForgePaint(value: string): value is ForgePaint {
  return (FORGE_PAINTS as readonly string[]).includes(value)
}

export function isForgeChassis(value: string): value is ChassisId {
  return (CHASSIS_IDS as readonly string[]).includes(value)
}

export function buildForgePrompt(chassis: ChassisId, paint: ForgePaint): string {
  return `${CHASSIS_WORDS[chassis]}, ${PAINT_WORDS[paint]} armor, game asset, single object, one connected body`
}

export type ForgeErrorCode =
  | 'sign-in-required'
  | 'invalid-chassis'
  | 'invalid-paint'
  | 'forge-busy'
  | 'forge-limit-reached'
  | 'forge-cap-reached'
  | 'forge-not-configured'
  | 'tripo-rejected'
  | 'tripo-credits'
  | 'tripo-failed'
  | 'tripo-timeout'

/** What the player sees. Every failure path has a distinct, plain message. */
export const FORGE_MESSAGES: Record<ForgeErrorCode, string> = {
  'sign-in-required': 'Sign in to forge your champion.',
  'invalid-chassis': 'Pick one of the three chassis to forge.',
  'invalid-paint': 'Pick a paint from the list.',
  'forge-busy': 'A forge is already running for your account. Wait for it to finish.',
  'forge-limit-reached': 'You have used all of your forges. Your forged champions stay available.',
  'forge-cap-reached': 'The forge has hit its shared credit cap for this event, so no new forges can start. Your champion keeps its standard look.',
  'forge-not-configured': 'The forge is not set up on this server yet.',
  'tripo-rejected': 'The model service rejected the request. No forge was used up; try again later.',
  'tripo-credits': 'The model service is out of credits. No forge was used up.',
  'tripo-failed': 'The model service could not build this rover. No forge was used up; try again.',
  'tripo-timeout': 'The model service took too long. No forge was used up; try again.',
}

export interface ForgeLimits {
  perAccount: number
  globalCreditCap: number
}

export function forgeLimits(env: { FORGE_PER_ACCOUNT_LIMIT?: string; FORGE_GLOBAL_CREDIT_CAP?: string } = {}): ForgeLimits {
  const read = (raw: string | undefined, fallback: number) => {
    const n = Number(raw)
    return raw !== undefined && raw.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
  }
  return {
    perAccount: read(env.FORGE_PER_ACCOUNT_LIMIT, DEFAULT_PER_ACCOUNT_LIMIT),
    globalCreditCap: read(env.FORGE_GLOBAL_CREDIT_CAP, DEFAULT_GLOBAL_CREDIT_CAP),
  }
}

export interface ForgeUsage {
  /** Forges this account has pending or ready (failed ones are refunded and do not count). */
  accountPending: number
  accountCounted: number
  /** Credits currently reserved by pending and ready forges across every account. */
  globalReserved: number
}

export type ForgeDecision = { ok: true } | { ok: false; code: ForgeErrorCode }

/** Order matters: busy beats limit beats global cap, so the player sees the most actionable reason. */
export function decideForge(usage: ForgeUsage, limits: ForgeLimits): ForgeDecision {
  if (usage.accountPending > 0) return { ok: false, code: 'forge-busy' }
  if (usage.accountCounted >= limits.perAccount) return { ok: false, code: 'forge-limit-reached' }
  if (usage.globalReserved + FORGE_CREDITS > limits.globalCreditCap) return { ok: false, code: 'forge-cap-reached' }
  return { ok: true }
}

/** Map Tripo's failure into a forge code. 2010 is Tripo's "insufficient credits" API code. */
export function classifyTripoFailure(input: { httpStatus?: number; apiCode?: number; taskStatus?: string }): ForgeErrorCode {
  if (input.apiCode === 2010) return 'tripo-credits'
  if (input.httpStatus === 402) return 'tripo-credits'
  if (input.taskStatus === 'failed' || input.taskStatus === 'cancelled' || input.taskStatus === 'banned' || input.taskStatus === 'expired') return 'tripo-failed'
  return 'tripo-rejected'
}
