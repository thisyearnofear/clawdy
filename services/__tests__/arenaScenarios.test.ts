import { describe, expect, it } from 'vitest'
import { isEvaluationScenario, rejectEvaluationExamples } from '../arenaScenarios'

describe('evaluation scenario guard', () => {
  it('rejects compete scenarios on both the retired and current worlds', () => {
    expect(isEvaluationScenario('sandstone-compete-01')).toBe(true)
    expect(isEvaluationScenario('cloudbank-compete-01')).toBe(true)
    expect(isEvaluationScenario('sandstone-practice-01')).toBe(false)
    expect(isEvaluationScenario('sandstone-practice-deep-01')).toBe(false)
    expect(isEvaluationScenario('cloudbank-practice-01')).toBe(false)
  })

  it('blocks training examples sourced from sandstone compete', () => {
    expect(() => rejectEvaluationExamples([{ sourceEpisodeId: 'sandstone-compete-01' }])).toThrow('held-out')
    expect(() => rejectEvaluationExamples([{ sourceEpisodeId: 'sandstone-practice-01' }])).not.toThrow()
  })
})
