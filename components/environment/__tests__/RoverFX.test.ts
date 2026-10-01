import { describe, expect, it } from 'vitest'
import { shouldResetTrail } from '../RoverFX'

describe('tyre trail reset', () => {
  it('clears marks on a new ready state or a rewind', () => {
    expect(shouldResetTrail(100, 0, 0, true)).toBe(true)
    expect(shouldResetTrail(100, 50, 0, false)).toBe(true)
  })

  it('breaks tracks on a recovery jump, but not normal motion', () => {
    expect(shouldResetTrail(100, 101, 2.1, false)).toBe(true)
    expect(shouldResetTrail(100, 101, 0.3, false)).toBe(false)
    expect(shouldResetTrail(100, 101, 2, false)).toBe(false)
  })
})
