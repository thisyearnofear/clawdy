import { describe, expect, it } from 'vitest'
import { PROVERBS, isFlavourZhOn, withProverb } from '../flavour'

describe('flavour', () => {
  it('defaults to off and only appends the proverb when on', () => {
    expect(isFlavourZhOn()).toBe(false)
    expect(withProverb('Controls off.', PROVERBS.handoff, false)).toBe('Controls off.')
    expect(withProverb('Controls off.', PROVERBS.handoff, true)).toBe(`Controls off. ${PROVERBS.handoff}`)
  })
})
