import { describe, expect, it } from 'vitest'
import { ArenaEpisode, DEFAULT_RUSH_RULES, type ArenaScenario } from '../arenaEpisode'
import { ArenaRunner, type EntrantPolicyOption } from '../arenaPolicy'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'
import { baseBuild, buildToTraits } from '../chassis'
import {
  CHASSIS_FEATURE_DIM, TIMETABLE_EDGE_FEATURE_DIM, TIMETABLE_FEATURE_DIM,
  encodeObservation, extendCheckpointForChassis, extendCheckpointForTimetable, validateCheckpoint,
  type PolicyCheckpoint,
} from '../policyModel'
import { SEASON_0_STARTER_CHECKPOINT } from '../starterCheckpoint'

const rush: ArenaScenario = { ...PRACTICE_SCENARIOS[0], rush: { ...DEFAULT_RUSH_RULES } }
const timetable = extendCheckpointForTimetable(SEASON_0_STARTER_CHECKPOINT)
const chassisAware = extendCheckpointForChassis(timetable)

function observe(scenario: ArenaScenario) {
  const episode = new ArenaEpisode(scenario)
  return episode.observe(scenario.entrants[0].id, { forceDecision: true })
}

function withScout(scenario: ArenaScenario): ArenaScenario {
  const traits = buildToTraits(baseBuild('scout'))
  return { ...scenario, entrants: scenario.entrants.map(entrant => ({ ...entrant, traits })) }
}

describe('chassis-aware policy input', () => {
  it('encodes an unmodified rover as the timetable vector plus zeros', () => {
    const observation = observe(rush)
    const plain = encodeObservation(observation, TIMETABLE_FEATURE_DIM)
    const wide = encodeObservation(observation, CHASSIS_FEATURE_DIM)
    expect(wide).toHaveLength(CHASSIS_FEATURE_DIM)
    expect([...wide.slice(0, TIMETABLE_FEATURE_DIM)]).toEqual([...plain])
    expect([...wide.slice(TIMETABLE_FEATURE_DIM)]).toEqual([0, 0, 0])
  })

  it('encodes the rover traits into the new inputs, bounded', () => {
    const wide = encodeObservation(observe(withScout(rush)), CHASSIS_FEATURE_DIM)
    const [speed, battery, strength] = [...wide.slice(TIMETABLE_FEATURE_DIM)]
    expect(speed).toBeGreaterThan(0)
    expect(battery).toBeLessThan(0)
    expect(strength).toBeLessThan(0)
    for (const value of [speed, battery, strength]) expect(Math.abs(value)).toBeLessThanOrEqual(1)
  })

  it('extends a timetable checkpoint with zero rows and validates', () => {
    expect(() => validateCheckpoint(chassisAware)).not.toThrow()
    expect(chassisAware.weights.hidden1.weights).toHaveLength(CHASSIS_FEATURE_DIM)
    expect(chassisAware.weights.edgeHead!.weights).toHaveLength(TIMETABLE_EDGE_FEATURE_DIM)
    for (const row of chassisAware.weights.hidden1.weights.slice(TIMETABLE_FEATURE_DIM)) expect(row.every(v => v === 0)).toBe(true)
    expect(chassisAware.parentCheckpointId).toBe(timetable.id)
    expect(extendCheckpointForChassis(chassisAware)).toBe(chassisAware)
    expect(extendCheckpointForTimetable(chassisAware)).toBe(chassisAware)
  })

  it('refuses to skip the timetable step', () => {
    expect(() => extendCheckpointForChassis(SEASON_0_STARTER_CHECKPOINT)).toThrow(/timetable/)
  })

  it('still rejects a half-extended edge head', () => {
    const half: PolicyCheckpoint = JSON.parse(JSON.stringify(chassisAware))
    half.weights.edgeHead!.weights.pop()
    expect(() => validateCheckpoint(half)).toThrow(/both be extended/)
  })

  it('plays exactly like its parent until training moves the new weights', () => {
    for (const scenario of [rush, withScout(rush)]) {
      const run = (checkpoint: PolicyCheckpoint) => {
        const options: Record<string, EntrantPolicyOption> = { champion: { strategy: 'learned', checkpoint }, rival: 'safe' }
        const runner = new ArenaRunner(scenario, options)
        runner.advanceTicks(scenario.durationTicks)
        return runner.recording().batches.map(batch => batch.requests.map(request => [request.agentId, request.action]))
      }
      expect(run(chassisAware)).toEqual(run(timetable))
    }
  })
})
