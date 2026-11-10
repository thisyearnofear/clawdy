import { describe, expect, it } from 'vitest'
import { ArenaRunner } from '../arenaPolicy'
import { recordedCoachContext } from '../coachingReview'
import type { ArenaScenario } from '../arenaEpisode'
import { legalActionSummary, resolveCoachIntent } from '../coachIntent'
import { parseIntentReply } from '../../app/api/coach-intent/route'

const scenario: ArenaScenario = {
  id: 'coach-intent-practice', worldVersion: 'intent-fixture-v1', split: 'practice', seed: 1, durationTicks: 100,
  nodes: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [1, 0, 0] }, { id: 'c', position: [0, 0, 1] }],
  edges: [
    { id: 'ab', from: 'a', to: 'b', travelTicks: 5, floodable: false },
    { id: 'ac', from: 'a', to: 'c', travelTicks: 7, floodable: true },
  ],
  entrants: [{ id: 'champion', baseNode: 'a', policyVersion: 'test' }, { id: 'rival', baseNode: 'b', policyVersion: 'test' }],
  resources: [{ id: 'core-b', nodeId: 'b', value: 1 }, { id: 'core-c', nodeId: 'c', value: 1 }], floods: [],
}

function context() {
  const runner = new ArenaRunner(scenario, { champion: 'safe', rival: 'greedy' })
  runner.advanceTicks(scenario.durationTicks)
  return recordedCoachContext(runner.recording(), 1)!
}

describe('coach intent resolver (plain-language → reviewable draft)', () => {
  it('accepts an intent naming a legal, different action and labels it AI-interpreted', () => {
    const ctx = context()
    const alternatives = ctx.alternatives
    const target = alternatives.find(action => action.type === 'move')!
    const intent = { action: target, rationale: 'take the northern route to dodge the flood' }
    const draft = resolveCoachIntent(intent, ctx.observation, ctx.originalAction, scenario.id)
    expect(draft).not.toBeNull()
    expect(draft!.preferredAction).toEqual(target)
    expect(draft!.approved).toBe(false)
    expect(draft!.source).toBe('draft')
    expect(draft!.rationale).toContain('AI-interpreted note:')
    expect(draft!.rationale).toContain('dodge the flood')
    // Detached observation: mutating the draft must not touch the recorded context.
    draft!.observation.tick = -99
    expect(ctx.observation.tick).not.toBe(-99)
  })

  it('rejects invented actions, ids, and the original action', () => {
    const ctx = context()
    expect(resolveCoachIntent({ action: { type: 'move', edgeId: 'does-not-exist' }, rationale: 'go' }, ctx.observation, ctx.originalAction, scenario.id)).toBeNull()
    expect(resolveCoachIntent({ action: { type: 'fly' }, rationale: 'go' }, ctx.observation, ctx.originalAction, scenario.id)).toBeNull()
    expect(resolveCoachIntent(ctx.originalAction, ctx.observation, ctx.originalAction, scenario.id)).toBeNull()
    expect(resolveCoachIntent({ action: ctx.originalAction, rationale: 'same' }, ctx.observation, ctx.originalAction, scenario.id)).toBeNull()
  })

  it('rejects malformed payloads: missing/oversized rationale, non-object intent', () => {
    const ctx = context()
    const move = ctx.alternatives.find(action => action.type === 'move')!
    expect(resolveCoachIntent(null, ctx.observation, ctx.originalAction, scenario.id)).toBeNull()
    expect(resolveCoachIntent({ action: move }, ctx.observation, ctx.originalAction, scenario.id)).toBeNull()
    expect(resolveCoachIntent({ action: move, rationale: 'x'.repeat(401) }, ctx.observation, ctx.originalAction, scenario.id)).toBeNull()
    expect(resolveCoachIntent({ action: move, rationale: '   ' }, ctx.observation, ctx.originalAction, scenario.id)).toBeNull()
  })

  it('summarizes the legal action set for the translator without leaking anything private', () => {
    const summary = legalActionSummary(context().observation)
    expect(summary).toContain('route ab')
    expect(summary).toContain('collect core')
    expect(summary).toContain('wait: hold position')
    expect(summary).toContain('tick ')
    expect(summary).not.toMatch(/[0-9a-f]{32}/) // no seeds or hidden ids beyond public route/core ids
  })
})

describe('coach-intent API reply parsing', () => {
  it('parses plain JSON and fenced JSON, and rejects no-fit replies', () => {
    const good = parseIntentReply('{"action":{"type":"wait"},"rationale":"hold here"}')
    expect(good).toEqual({ action: { type: 'wait' }, rationale: 'hold here' })
    const fenced = parseIntentReply('```json\n{"action":{"type":"bank"},"rationale":"deliver"}\n```')
    expect(fenced).toEqual({ action: { type: 'bank' }, rationale: 'deliver' })
    expect(parseIntentReply('{"action":null,"rationale":"no fit"}')).toBeNull()
    expect(parseIntentReply('not json at all')).toBeNull()
    expect(parseIntentReply('[]')).toBeNull()
  })
})
