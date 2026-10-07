import { describe, expect, it } from 'vitest'
import type { ArenaAgentState, ArenaObservation } from '../arenaEpisode'
import { ArenaEpisode } from '../arenaEpisode'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'
import { baseBuild, buildToTraits, SKIRMISH_PERK_TELEGRAPH } from '../chassis'
import {
  decideReason,
  formatDecisionCaption,
  playerDoorLabel,
  PLAYER_DOOR_COPY,
} from '../decisionCaption'

function baseAgent(over: Partial<ArenaAgentState> = {}): ArenaAgentState {
  const episode = new ArenaEpisode(PRACTICE_SCENARIOS[0])
  return { ...episode.snapshot().agents[0], ...over }
}

function observation(opts: {
  nodeId: string
  edges: { id: string; from: string; to: string; travelTicks?: number; floodable?: boolean }[]
  legal: ArenaObservation['availableActions']
  flooded?: boolean
  rivalsVisible?: boolean
}): ArenaObservation {
  return {
    self: { nodeId: opts.nodeId },
    availableActions: opts.legal,
    edges: opts.edges.map((edge, i) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      length: 1,
      currentTravelTicks: edge.travelTicks ?? 10 + i,
      floodable: edge.floodable ?? false,
      blocked: false,
    })),
    weather: { flooded: opts.flooded ?? false, drainedUntilTick: 0 },
    rivals: opts.rivalsVisible
      ? [{ id: 'rival', position: [0, 0, 0], cargo: 1, banked: 0, visible: true }]
      : [{ id: 'rival', position: null, cargo: null, banked: null, visible: false }],
  } as unknown as ArenaObservation
}

describe('formatDecisionCaption', () => {
  it('builds planned · alternative · reason from real observation data', () => {
    const agent = baseAgent({
      cargo: 3,
      nodeId: 'ridge-node',
      lastOutcome: {
        agentId: 'champion',
        tick: 10,
        action: { type: 'move', edgeId: 'ridge' },
        accepted: true,
        reason: null,
      },
    })
    const obs = observation({
      nodeId: 'a',
      edges: [
        { id: 'ridge', from: 'a', to: 'b' },
        { id: 'valley', from: 'a', to: 'c', floodable: true },
      ],
      legal: [
        { type: 'move', edgeId: 'ridge' },
        { type: 'move', edgeId: 'valley' },
        { type: 'wait' },
      ],
    })
    const caption = formatDecisionCaption({ agent, observation: obs, flooded: false })
    expect(caption).not.toBeNull()
    expect(caption!.planned).toMatch(/ridge|take/i)
    expect(caption!.alternative).toMatch(/valley|take/i)
    expect(caption!.reason).toBe('cargo')
    expect(caption!.line).toBe(`${caption!.planned} · ${caption!.alternative} · cargo`)
  })

  it('does not invent an alternative without observation', () => {
    const agent = baseAgent({
      transit: { edgeId: 'ridge', from: 'a', to: 'b', progressUnits: 1, requiredUnits: 10 },
      lastOutcome: null,
    })
    const caption = formatDecisionCaption({ agent })
    expect(caption).not.toBeNull()
    expect(caption!.alternative).toBeNull()
    expect(caption!.line).toMatch(/heading to/i)
    expect(caption!.line.split('·').length).toBeLessThanOrEqual(2)
  })

  it('picks flood reason when the valley is flooded', () => {
    const agent = baseAgent({
      transit: { edgeId: 'valley', from: 'a', to: 'b', progressUnits: 1, requiredUnits: 10 },
      lastOutcome: {
        agentId: 'champion',
        tick: 0,
        action: { type: 'move', edgeId: 'valley' },
        accepted: true,
        reason: null,
      },
    })
    expect(decideReason({ agent, flooded: true })).toBe('flood')
  })

  it('picks bank reason when banking', () => {
    const agent = baseAgent({
      cargo: 0,
      lastOutcome: {
        agentId: 'champion',
        tick: 0,
        action: { type: 'bank' },
        accepted: true,
        reason: null,
      },
    })
    expect(decideReason({ agent })).toBe('bank')
  })

  it('picks rival reason when a rival is visible and no higher stake applies', () => {
    const agent = baseAgent({
      cargo: 0,
      energy: 12,
      lastOutcome: {
        agentId: 'champion',
        tick: 0,
        action: { type: 'move', edgeId: 'ridge' },
        accepted: true,
        reason: null,
      },
    })
    const obs = observation({
      nodeId: 'a',
      edges: [{ id: 'ridge', from: 'a', to: 'b' }],
      legal: [{ type: 'move', edgeId: 'ridge' }],
      rivalsVisible: true,
    })
    expect(decideReason({ agent, observation: obs, flooded: false })).toBe('rival')
  })
})

describe('playerDoorLabel', () => {
  it('prefers Clash vs Prove player-facing doors', () => {
    expect(playerDoorLabel({ rulesetId: 'skirmish' })).toBe('clash')
    expect(playerDoorLabel({ playMode: 'compete' })).toBe('prove')
    expect(playerDoorLabel({ playMode: 'practice' })).toBe('tutor')
    expect(playerDoorLabel({ playMode: 'rush' })).toBe('rush')
    expect(PLAYER_DOOR_COPY.clash).toBe('Clash')
    expect(PLAYER_DOOR_COPY.prove).toBe('Prove')
  })
})

describe('SKIRMISH_PERK_TELEGRAPH', () => {
  it('names Hauler 4, Raider steal, and Scout 2-hop', () => {
    expect(SKIRMISH_PERK_TELEGRAPH.all).toContain('Hauler carries 4')
    expect(SKIRMISH_PERK_TELEGRAPH.all).toContain('Raider steals')
    expect(SKIRMISH_PERK_TELEGRAPH.all).toContain('Scout sees 2 hops')
    expect(SKIRMISH_PERK_TELEGRAPH.hauler).toContain('4 cargo')
    expect(SKIRMISH_PERK_TELEGRAPH.raider).toContain('steals')
    expect(SKIRMISH_PERK_TELEGRAPH.scout).toContain('two route hops')
    expect(buildToTraits(baseBuild('hauler'), 'skirmish').capacity).toBe(4)
    expect(buildToTraits(baseBuild('raider'), 'skirmish').stealAll).toBe(true)
    expect(buildToTraits(baseBuild('scout'), 'skirmish').visionHops).toBe(2)
  })
})
