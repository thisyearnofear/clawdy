import { describe, expect, it } from 'vitest'
import type { ArenaAgentState, ArenaObservation } from '../arenaEpisode'
import { ArenaEpisode } from '../arenaEpisode'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'
import { baseBuild, buildToTraits, SKIRMISH_PERK_TELEGRAPH } from '../chassis'
import {
  decideReason,
  formatDecisionCaption,
  perkTelegraphMoment,
  playerDoorLabel,
  PLAYER_DOOR_COPY,
  recentStealEvent,
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
  rivalCargo?: number
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
      ? [{ id: 'rival', position: [0, 0, 0], cargo: opts.rivalCargo ?? 1, banked: 0, visible: true }]
      : [{ id: 'rival', position: null, cargo: null, banked: null, visible: false }],
  } as unknown as ArenaObservation
}

describe('formatDecisionCaption', () => {
  it('builds planned · alternative · richer reason from real observation data', () => {
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
    expect(caption!.reasonLabel).toBe('cargo pressure')
    expect(caption!.line).toBe(`${caption!.planned} · ${caption!.alternative} · cargo pressure`)
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

  it('picks flood pressure when the valley is flooded', () => {
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
    expect(formatDecisionCaption({ agent, flooded: true })!.reasonLabel).toBe('flood pressure')
  })

  it('picks banking reason when banking', () => {
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
    expect(formatDecisionCaption({ agent })!.reasonLabel).toBe('banking')
  })

  it('picks rival nearby when a rival is visible and no higher stake applies', () => {
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
      rivalCargo: 0,
    })
    expect(decideReason({ agent, observation: obs, flooded: false })).toBe('rival')
    expect(formatDecisionCaption({ agent, observation: obs, flooded: false })!.reasonLabel).toBe('rival nearby')
  })

  it('picks steal window after a recent bump steal', () => {
    const agent = baseAgent({
      id: 'champion',
      cargo: 1,
      energy: 12,
      nodeId: 'ridge-node',
      lastOutcome: {
        agentId: 'champion',
        tick: 50,
        action: { type: 'move', edgeId: 'ridge' },
        accepted: true,
        reason: null,
      },
    })
    const events = [{
      type: 'bump' as const,
      tick: 48,
      winnerId: 'champion',
      loserId: 'rival',
      position: [0, 0, 0] as [number, number, number],
      stolen: 2,
    }]
    expect(recentStealEvent(events, 'champion', 50)).not.toBeNull()
    expect(decideReason({ agent, events, tick: 50, flooded: false })).toBe('steal')
    expect(formatDecisionCaption({ agent, events, tick: 50 })!.reasonLabel).toBe('steal window')
  })

  it('picks steal window for Raider when a loaded rival is visible', () => {
    const agent = baseAgent({
      cargo: 0,
      energy: 12,
      traits: { ...buildToTraits(baseBuild('raider'), 'skirmish') },
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
      rivalCargo: 2,
    })
    expect(decideReason({ agent, observation: obs, flooded: false })).toBe('steal')
  })

  it('picks low energy when the battery is critical', () => {
    const agent = baseAgent({
      cargo: 0,
      energy: 2,
      lastOutcome: {
        agentId: 'champion',
        tick: 0,
        action: { type: 'wait' },
        accepted: true,
        reason: null,
      },
    })
    expect(decideReason({ agent, flooded: false })).toBe('energy')
    expect(formatDecisionCaption({ agent })!.reasonLabel).toBe('low energy')
  })
})

describe('playerDoorLabel', () => {
  it('collapses player doors to Clash vs Prove only', () => {
    expect(playerDoorLabel({ rulesetId: 'skirmish' })).toBe('clash')
    expect(playerDoorLabel({ playMode: 'compete' })).toBe('prove')
    expect(playerDoorLabel({ playMode: 'practice' })).toBe('clash')
    expect(playerDoorLabel({ playMode: 'rush' })).toBe('clash')
    expect(PLAYER_DOOR_COPY.clash).toBe('Clash')
    expect(PLAYER_DOOR_COPY.prove).toBe('Prove')
    expect(Object.keys(PLAYER_DOOR_COPY)).toEqual(['clash', 'prove'])
  })
})

describe('SKIRMISH_PERK_TELEGRAPH', () => {
  it('names Hauler 4, Raider steal, and Scout 2-hop', () => {
    expect(SKIRMISH_PERK_TELEGRAPH.all).toContain('Hauler carries 4')
    expect(SKIRMISH_PERK_TELEGRAPH.all).toContain('Raider steals')
    expect(SKIRMISH_PERK_TELEGRAPH.all).toContain('Scout sees 2 hops')
    expect(SKIRMISH_PERK_TELEGRAPH.hauler).toContain('4 cargo')
    expect(SKIRMISH_PERK_TELEGRAPH.raider).toContain('steals')
    expect(SKIRMISH_PERK_TELEGRAPH.scout).toMatch(/two route hops|vision rings/i)
    expect(buildToTraits(baseBuild('hauler'), 'skirmish').capacity).toBe(4)
    expect(buildToTraits(baseBuild('raider'), 'skirmish').stealAll).toBe(true)
    expect(buildToTraits(baseBuild('scout'), 'skirmish').visionHops).toBe(2)
  })
})

describe('perkTelegraphMoment', () => {
  it('gives on-world HUD + feed copy for each Clash chassis', () => {
    expect(perkTelegraphMoment('hauler').tip).toMatch(/4/)
    expect(perkTelegraphMoment('hauler').feed).toMatch(/4 cargo/i)
    expect(perkTelegraphMoment('raider').tip).toMatch(/steal/i)
    expect(perkTelegraphMoment('scout').tip).toMatch(/two route hops|vision rings/i)
  })
})
