import { describe, expect, it } from 'vitest'
import {
  POLICY_SCHEMA_VERSION,
  SEASON_0_BASE_CHECKPOINT,
  validateCheckpoint,
} from '../policyModel'
import { evaluatePolicyCheckpoint } from '../policyTrainer'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'
import { SEASON_0_STARTER_CHECKPOINT } from '../starterCheckpoint'

describe('bundled starter checkpoint', () => {
  it('is a validated, executable v3 checkpoint descended from the base', () => {
    expect(() => validateCheckpoint(SEASON_0_STARTER_CHECKPOINT)).not.toThrow()
    expect(SEASON_0_STARTER_CHECKPOINT.schemaVersion).toBe(POLICY_SCHEMA_VERSION)
    expect(Object.isFrozen(SEASON_0_STARTER_CHECKPOINT)).toBe(true)
    expect(SEASON_0_STARTER_CHECKPOINT.id).not.toBe(SEASON_0_BASE_CHECKPOINT.id)
    expect(SEASON_0_STARTER_CHECKPOINT.parentCheckpointId).toBe(SEASON_0_BASE_CHECKPOINT.id)
    expect(SEASON_0_STARTER_CHECKPOINT.trainingSummary.epochs).toBeGreaterThan(0)
  })

  it('out-plays the untrained base on the builder practice set it shipped with', () => {
    const starter = evaluatePolicyCheckpoint(SEASON_0_STARTER_CHECKPOINT, PRACTICE_SCENARIOS)
    const base = evaluatePolicyCheckpoint(SEASON_0_BASE_CHECKPOINT, PRACTICE_SCENARIOS)
    expect(starter.totalBanked).toBeGreaterThan(0)
    expect(starter.totalBanked).toBeGreaterThanOrEqual(base.totalBanked)
  })
})
