import { describe, expect, it } from 'vitest'
import type { ArenaAgentState, ArenaRecording, ArenaSnapshot } from '../arenaEpisode'
import { buildReplayStory, captionAt, CAPTION_WINDOW_TICKS, frameForTick, MAX_STORY_MOMENTS } from '../replayStory'

const agent = (id: string, over: Partial<Record<string, unknown>> = {}): ArenaAgentState => ({
  id, baseNode: 'n1', policyVersion: `learned.${id}`, nodeId: 'n1', position: [0, 0, 0], transit: null,
  energy: 12, cargo: 0, banked: 0, cooldownUntilTick: 0, staggeredUntilTick: 0, lastOutcome: null,
  visitedNodes: ['n1'], knownResources: [], grounded: true, rotation: [0, 0, 0, 1], blockedTicks: 0,
  blockedEdges: [], recoveries: 0, ...over,
} as ArenaAgentState)

function recording(states: Partial<ArenaSnapshot>[]): ArenaRecording {
  return {
    schemaVersion: 'arena-recording-v1',
    rulesVersion: 'season-0.reference.3',
    controllerVersion: 'route-reference-v2',
    scenario: {
      id: 's1', worldVersion: 'w1', split: 'evaluation', seed: 1, durationTicks: 400,
      nodes: [{ id: 'n1', position: [0, 0, 0] }], edges: [],
      entrants: [
        { id: 'champion', baseNode: 'n1', policyVersion: 'learned.champ' },
        { id: 'rival', baseNode: 'n1', policyVersion: 'learned.rival' },
      ],
      resources: [], floods: [],
    },
    finalTick: states.length - 1,
    batches: [],
    checkpoints: states.map(over => ({
      state: {
        rulesVersion: 'season-0.reference.3', controllerVersion: 'route-reference-v2',
        tick: 0, status: 'running', winner: null,
        agents: [agent('champion'), agent('rival')], resources: [],
        weather: { flooded: false, drainedUntilTick: 0 }, events: [],
        ...over,
      } as ArenaSnapshot,
    })),
  }
}

const you = { you: 'champion', names: { champion: 'Your champion', rival: 'Rival' } }

// The markers below come from the real summariser, so the wording of its notes
// (which the story parses) is checked against the actual producer.
const bumpEvent = (winnerId: string, loserId: string, stolen: number) =>
  ({ type: 'bump', tick: 100, winnerId, loserId, stolen }) as never

describe('replay story', () => {
  it('tells a bump from the viewer\'s side: lost, won, and from outside', () => {
    const lost = recording([{ tick: 0 }, { tick: 100, events: [bumpEvent('rival', 'champion', 3)] }])
    expect(buildReplayStory(lost, you)[0]).toMatchObject({ kind: 'bump', tone: 'bad', text: 'Rival bumped you and took 3 cargo. You were staggered' })

    const won = recording([{ tick: 0 }, { tick: 100, events: [bumpEvent('champion', 'rival', 2)] }])
    expect(buildReplayStory(won, you)[0]).toMatchObject({ tone: 'good', text: 'You bumped Rival and took 2 cargo' })

    // A shared replay has no "you": both sides are named.
    const shared = buildReplayStory(lost, { names: { champion: 'Alice · alpha', rival: 'Bob · beta' } })
    expect(shared[0]).toMatchObject({ tone: 'neutral', text: 'Bob · beta bumped Alice · alpha and took 3 cargo' })
  })

  it('does not claim a steal when nothing was taken', () => {
    const empty = recording([{ tick: 0 }, { tick: 100, events: [bumpEvent('rival', 'champion', 0)] }])
    expect(buildReplayStory(empty, you)[0].text).toBe('Rival bumped you. You were staggered')
  })

  it('reports battery-outs, recoveries and banks and points each at a frame', () => {
    const story = buildReplayStory(recording([
      { tick: 0 },
      { tick: 50, agents: [agent('champion', { banked: 3 }), agent('rival')] },
      { tick: 100, agents: [agent('champion', { banked: 3, recoveries: 1 }), agent('rival', { energy: 0 })] },
    ]), you)
    expect(story.map(moment => moment.text)).toEqual([
      'You banked 3',
      'Rival ran out of energy',
      'You got stuck and recovered',
    ])
    expect(story.map(moment => moment.frame)).toEqual([1, 2, 2])
    expect(story.map(moment => moment.tone)).toEqual(['good', 'neutral', 'bad'])
  })

  it('keeps core spawns out of the story and caps it, dropping banks before bumps', () => {
    const states: Partial<ArenaSnapshot>[] = [{ tick: 0 }]
    for (let index = 1; index <= 20; index++) {
      states.push({ tick: index * 5, agents: [agent('champion', { banked: index }), agent('rival')] })
    }
    states.push({ tick: 200, events: [{ type: 'core_spawn', tick: 5, resourceId: 'r1', nodeId: 'n1', value: 2 } as never, bumpEvent('rival', 'champion', 1)] })
    const story = buildReplayStory(recording(states), you)
    expect(story).toHaveLength(MAX_STORY_MOMENTS)
    expect(story.some(moment => moment.kind === 'bump')).toBe(true)
    expect(story.every(moment => moment.text.length > 0 && !moment.text.includes('r1'))).toBe(true)
    expect(story.map(moment => moment.tick)).toEqual([...story.map(moment => moment.tick)].sort((a, b) => a - b))
  })

  it('shows a caption only while its moment is fresh', () => {
    const story = buildReplayStory(recording([{ tick: 0 }, { tick: 100, events: [bumpEvent('rival', 'champion', 1)] }]), you)
    expect(captionAt(story, 99)).toBeNull()
    expect(captionAt(story, 100)?.kind).toBe('bump')
    expect(captionAt(story, 100 + CAPTION_WINDOW_TICKS)?.kind).toBe('bump')
    expect(captionAt(story, 100 + CAPTION_WINDOW_TICKS + 1)).toBeNull()
  })

  it('maps a tick to the first checkpoint at or after it', () => {
    const rec = recording([{ tick: 0 }, { tick: 5 }, { tick: 10 }])
    expect(frameForTick(rec, 0)).toBe(0)
    expect(frameForTick(rec, 6)).toBe(2)
    expect(frameForTick(rec, 999)).toBe(2)
  })

  it('is pure and cached per recording and viewer', () => {
    const rec = recording([{ tick: 0 }, { tick: 100, events: [bumpEvent('rival', 'champion', 1)] }])
    const first = buildReplayStory(rec, you)
    expect(buildReplayStory(rec, you)).toBe(first)
    expect(buildReplayStory(rec, { names: you.names })).not.toBe(first)
    expect(JSON.stringify(rec)).toBe(JSON.stringify(recording([{ tick: 0 }, { tick: 100, events: [bumpEvent('rival', 'champion', 1)] }])))
  })
})
