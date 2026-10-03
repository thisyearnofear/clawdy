import { describe, expect, it } from 'vitest'
import ridgeRunner from '../../starter/teachers/ridge-runner'
import { HELD_OUT_SCENARIOS, PRACTICE_SCENARIOS } from '../arenaScenarios'
import { validateCheckpoint, SEASON_0_BASE_CHECKPOINT } from '../policyModel'
import { collectTeacherExamples, distillTeacher, type Teacher } from '../teacher'

const FEW = PRACTICE_SCENARIOS.slice(0, 1)

describe('Teacher contract', () => {
  it('collects approved, practice-only examples from a code-written teacher', () => {
    const collection = collectTeacherExamples(ridgeRunner, FEW, SEASON_0_BASE_CHECKPOINT, { rivals: ['safe'] })
    expect(collection.examples.length).toBeGreaterThan(5)
    expect(collection.illegalChoices).toBe(0)
    expect(collection.examples.every(example => example.approved && example.source === 'approved')).toBe(true)
    expect(collection.examples.every(example => example.sourceEpisodeId === FEW[0].id)).toBe(true)
    expect(collection.examples.some(example => example.preferredAction.type === 'wait')).toBe(false)
  })

  it('is deterministic', () => {
    const run = () => collectTeacherExamples(ridgeRunner, FEW, SEASON_0_BASE_CHECKPOINT, { rivals: ['safe'] })
    expect(run()).toEqual(run())
  })

  it('refuses held-out scenarios', () => {
    expect(() => collectTeacherExamples(ridgeRunner, HELD_OUT_SCENARIOS.slice(0, 1), SEASON_0_BASE_CHECKPOINT)).toThrow('practice scenarios only')
  })

  it('cannot mutate the live observation', () => {
    const meddler: Teacher = observation => {
      observation.availableActions.length = 0
      return { type: 'wait' }
    }
    const intact = collectTeacherExamples(ridgeRunner, FEW, SEASON_0_BASE_CHECKPOINT, { rivals: ['safe'] })
    collectTeacherExamples(meddler, FEW, SEASON_0_BASE_CHECKPOINT, { rivals: ['safe'] })
    expect(collectTeacherExamples(ridgeRunner, FEW, SEASON_0_BASE_CHECKPOINT, { rivals: ['safe'] })).toEqual(intact)
  })

  it('counts illegal choices and teacher errors instead of crashing the rollout', () => {
    const illegal = collectTeacherExamples(() => ({ type: 'move', edgeId: 'no-such-edge' }), FEW, SEASON_0_BASE_CHECKPOINT, { rivals: ['safe'] })
    expect(illegal.illegalChoices).toBeGreaterThan(0)
    expect(illegal.examples).toHaveLength(0)
    const throwing = collectTeacherExamples(() => { throw new Error('boom') }, FEW, SEASON_0_BASE_CHECKPOINT, { rivals: ['safe'] })
    expect(throwing.failures).toEqual({ count: expect.any(Number), firstMessage: 'boom' })
    expect(throwing.failures.count).toBeGreaterThan(0)
  })

  it('distils a teacher into a normal, valid checkpoint that records its parent', () => {
    const result = distillTeacher(ridgeRunner, FEW, SEASON_0_BASE_CHECKPOINT, { rivals: ['safe'], training: { epochs: 20 }, name: 'Test taught' })
    expect(() => validateCheckpoint(result.checkpoint)).not.toThrow()
    expect(result.checkpoint.name).toBe('Test taught')
    expect(result.checkpoint.parentCheckpointId).toBe(SEASON_0_BASE_CHECKPOINT.id)
  })

  it('explains a teacher that never produces a usable example', () => {
    expect(() => distillTeacher(() => { throw new Error('boom') }, FEW, SEASON_0_BASE_CHECKPOINT, { rivals: ['safe'] })).toThrow('threw on every decision: boom')
    expect(() => distillTeacher(() => ({ type: 'wait' }), FEW, SEASON_0_BASE_CHECKPOINT, { rivals: ['safe'] })).toThrow('no usable examples')
  })
})
