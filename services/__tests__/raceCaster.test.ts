import { describe, expect, it } from 'vitest'
import { CASTER_MAX_LINE, casterFactFromFeed, casterSystemPrompt, casterUserMessage, validateCasterLine } from '../raceCaster'

const score = 'You 3 · Rival 1'

describe('caster fact extraction from recorded feed items', () => {
  it('extracts banks, steals, floods, drains and full-time with their anchor numbers', () => {
    const bank = casterFactFromFeed({ text: 'You bank +3', tone: 'bank' }, { score })
    expect(bank).toMatchObject({ kind: 'bank', agent: 'champion', anchors: ['+3'] })
    const rivalBank = casterFactFromFeed({ text: 'Rival banks +2', tone: 'bank' }, { score })
    expect(rivalBank).toMatchObject({ kind: 'bank', agent: 'rival', anchors: ['+2'] })
    const steal = casterFactFromFeed({ text: 'You steal +1 on bump', tone: 'info' }, { score })
    expect(steal).toMatchObject({ kind: 'steal', agent: 'champion', anchors: ['+1'] })
    const rivalSteal = casterFactFromFeed({ text: 'Rival steals +2 on bump', tone: 'info' }, { score })
    expect(rivalSteal).toMatchObject({ kind: 'steal', agent: 'rival', anchors: ['+2'] })
    expect(casterFactFromFeed({ text: 'Flood on the valley', tone: 'flood' }, { score })).toMatchObject({ kind: 'flood', agent: 'arena' })
    expect(casterFactFromFeed({ text: 'Waters recede — valley open', tone: 'flood' }, { score })).toMatchObject({ kind: 'flood' })
    expect(casterFactFromFeed({ text: 'Drain opened a path', tone: 'info' }, { score })).toMatchObject({ kind: 'drain' })
    const finish = casterFactFromFeed({ text: 'Full time — You 7 · Rival 5', tone: 'info' }, { score })
    expect(finish).toMatchObject({ kind: 'finish', anchors: ['7', '5'] })
  })

  it('ignores non-fact feed items — the caster never rewords tips or telegraphs it cannot anchor', () => {
    expect(casterFactFromFeed({ text: 'Rival sighted on the same stretch — close enough to contest.', tone: 'info' }, { score })).toBeNull()
    expect(casterFactFromFeed({ text: 'Contested ground — both rovers are nearby. Routes and pickups decide the score.', tone: 'info' }, { score })).toBeNull()
    expect(casterFactFromFeed({ text: '', tone: 'info' }, { score })).toBeNull()
  })
})

describe('caster line validation (anti-hallucination)', () => {
  const fact = casterFactFromFeed({ text: 'You bank +3', tone: 'bank' }, { score })!

  it('accepts a flavoured line that keeps the anchor number', () => {
    expect(validateCasterLine('  "Juno banks +3 — clean homecoming!"  ', fact)).toBe('Juno banks +3 — clean homecoming!')
  })

  it('rejects lines that lose the number, invent other numbers, run long, or are not strings', () => {
    expect(validateCasterLine('What a bank by the champion!', fact)).toBeNull() // dropped the +3
    expect(validateCasterLine('Juno banks +4 — huge!', fact)).toBeNull() // wrong number
    expect(validateCasterLine(`x`.repeat(CASTER_MAX_LINE + 1), fact)).toBeNull()
    expect(validateCasterLine('', fact)).toBeNull()
    expect(validateCasterLine(null, fact)).toBeNull()
    expect(validateCasterLine(42, fact)).toBeNull()
  })

  it('strips control characters so a cast can never inject lines', () => {
    const sneaky = 'Juno banks +3\n<script>alert(1)</script>'
    const line = validateCasterLine(sneaky, fact)
    expect(line).not.toBeNull()
    expect(line).not.toContain('\n')
    expect(line).not.toContain('<')
  })
})

describe('caster prompts', () => {
  it('the system prompt states the anti-invention rules', () => {
    const prompt = casterSystemPrompt()
    expect(prompt).toContain('never invent')
    expect(prompt).toContain('120 characters')
  })

  it('the user message carries the fact, the actor and the score', () => {
    const mine = casterUserMessage(casterFactFromFeed({ text: 'You bank +3', tone: 'bank' }, { score })!, 'Juno')
    expect(mine).toContain('You bank +3')
    expect(mine).toContain('Juno')
    expect(mine).toContain(score)
    const rival = casterUserMessage(casterFactFromFeed({ text: 'Rival banks +2', tone: 'bank' }, { score })!, 'Juno')
    expect(rival).toContain('the rival rover')
  })
})
