import { describe, it, expect, vi } from 'vitest'

vi.mock('../protocolTypes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../protocolTypes')>()
  return actual
})

import { getSkillProviderInfo } from '../skillEngine'

describe('skillEngine', () => {
  describe('getSkillProviderInfo', () => {
    it('returns provider info with required fields', () => {
      const info = getSkillProviderInfo()
      expect(info).toHaveProperty('id')
      expect(info).toHaveProperty('label')
      expect(info).toHaveProperty('mode')
      expect(info).toHaveProperty('summary')
    })

    it('defaults to local-policy provider', () => {
      const info = getSkillProviderInfo()
      expect(info.id).toBe('local-policy')
    })
  })
})
