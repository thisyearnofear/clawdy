import { describe, expect, it } from 'vitest'
import {
  getChampionLook,
  loadChampionIdentity,
  normalizeChampionName,
  saveChampionIdentity,
} from '../championIdentity'
import { summarizeCoachFocus } from '../coachingEngine'

describe('championIdentity', () => {
  it('normalizes empty names to Champion', () => {
    expect(normalizeChampionName('   ')).toBe('Champion')
    expect(normalizeChampionName('Ridge Runner')).toBe('Ridge Runner')
    expect(normalizeChampionName('x'.repeat(40)).length).toBe(24)
  })

  it('resolves look accents', () => {
    expect(getChampionLook('tide').accent).toBe('#6bc8c4')
    expect(getChampionLook('canopy').label).toBe('Canopy')
  })

  it('round-trips through a store', () => {
    const memory = new Map<string, string>()
    const store = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) },
    }
    saveChampionIdentity({ name: 'Moss', lookId: 'ember' }, store)
    expect(loadChampionIdentity(store)).toEqual({ name: 'Moss', lookId: 'ember' })
  })
})

describe('summarizeCoachFocus', () => {
  it('returns null for an empty batch', () => {
    expect(summarizeCoachFocus([])).toBeNull()
  })

  it('names the dominant coaching themes', () => {
    const line = summarizeCoachFocus([
      { rationale: 'Flooding is active; take the ridge', preferredAction: { type: 'move' }, approved: true },
      { rationale: 'Flooding is active; take the ridge', preferredAction: { type: 'move' }, approved: true },
      { rationale: 'Deliver banked resources', preferredAction: { type: 'bank' }, approved: true },
    ])
    expect(line).toContain('weather / ridge')
    expect(line).toContain('bank & cargo')
  })
})
