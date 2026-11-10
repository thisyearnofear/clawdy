/**
 * Track D — Live AI surface (AI Builder Hackathon, Nov 2026).
 *
 * An LLM race caster that rewords **recorded feed facts** into commentary.
 * It cannot invent events: the input is one fact the simulation already
 * published (a bank delta, a steal, a flood flip, the full-time score) and
 * the output is one short line that must still contain the fact's numbers.
 * Anything that fails `validateCasterLine` is dropped and the deterministic
 * caption stands — the caster can only add flavour, never change what happened.
 * Presentation only: no effect on score, sim, training, or evaluation.
 */

export type CasterFactKind = 'bank' | 'steal' | 'flood' | 'drain' | 'finish' | 'sighting' | 'clash'

export interface CasterFact {
  kind: CasterFactKind
  /** The deterministic caption this fact already produced (never sent to waste). */
  fallback: string
  /** Numbers that must survive into the cast line, verbatim substrings. */
  anchors: string[]
  agent: 'champion' | 'rival' | 'arena'
  /** Score at the moment of the fact, for context. */
  score: string
}

/** Max cast-line length; toasts are transient, long lines clip. */
export const CASTER_MAX_LINE = 120
/** Minimum gap between casts so the caster never talks over itself. */
export const CASTER_MIN_INTERVAL_MS = 8000

const VOICE_PROMPT = [
  'You are the race caster for a rover arena league. Given one recorded race fact, reply with a single short commentary line.',
  'Rules: at most 120 characters; no emojis; plain text; never invent events or numbers that are not in the fact;',
  'keep every score/delta number from the fact in your line exactly (e.g. "+3", "4 - 2");',
  'one line, no preamble, no quotes — just the commentary.',
  'Voice: punchy, warm, a little wry — a great esports radio voice, family-friendly.',
].join(' ')

export function casterSystemPrompt(): string {
  return VOICE_PROMPT
}

/** Validates a cast line against its fact. Returns null to keep the fallback. */
export function validateCasterLine(reply: unknown, fact: CasterFact): string | null {
  if (typeof reply !== 'string') return null
  const line = reply
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'\u201c]|["'\u201d]$/g, '')
  if (line.length === 0 || line.length > CASTER_MAX_LINE) return null
  // Anti-hallucination: every anchor number must appear verbatim.
  for (const anchor of fact.anchors) {
    if (!line.includes(anchor)) return null
  }
  return line
}

/** Classifies a deterministic feed item into a castable fact, or null when it is not a race fact. */
export function casterFactFromFeed(
  item: { text: string; tone: 'bank' | 'flood' | 'info' },
  context: { score: string },
): CasterFact | null {
  const { text } = item
  const bankMatch = /^(You bank|Rival banks) \+(\d+)$/.exec(text)
  if (bankMatch) {
    return {
      kind: 'bank',
      fallback: text,
      anchors: [`+${bankMatch[2]}`],
      agent: bankMatch[1] === 'You bank' ? 'champion' : 'rival',
      score: context.score,
    }
  }
  const stealMatch = /^(You steal|Rival steals) \+(\d+) on bump$/.exec(text)
  if (stealMatch) {
    return {
      kind: 'steal',
      fallback: text,
      anchors: [`+${stealMatch[2]}`],
      agent: stealMatch[1] === 'You steal' ? 'champion' : 'rival',
      score: context.score,
    }
  }
  if (text === 'Flood on the valley') return { kind: 'flood', fallback: text, anchors: [], agent: 'arena', score: context.score }
  if (text === 'Waters recede — valley open') return { kind: 'flood', fallback: text, anchors: [], agent: 'arena', score: context.score }
  if (text === 'Drain opened a path') return { kind: 'drain', fallback: text, anchors: [], agent: 'arena', score: context.score }
  const finishMatch = /^Full time — You (\d+) · Rival (\d+)$/.exec(text)
  if (finishMatch) {
    return {
      kind: 'finish',
      fallback: text,
      anchors: [finishMatch[1], finishMatch[2]],
      agent: 'arena',
      score: context.score,
    }
  }
  return null
}

/** The user message for the caster call. */
export function casterUserMessage(fact: CasterFact, championName: string): string {
  const who = fact.agent === 'champion' ? championName : fact.agent === 'rival' ? 'the rival rover' : 'the arena'
  return `Fact (${fact.kind}): ${fact.fallback} — involving ${who}. Current score: ${fact.score}.`
}
