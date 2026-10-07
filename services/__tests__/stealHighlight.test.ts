import { describe, expect, it, vi } from 'vitest'
import type { ArenaSimEvent } from '../arenaEpisode'
import {
  FULL_LOAD_STEAL_MIN,
  buildStealStoryboard,
  detectFullLoadSteal,
  isFullLoadSteal,
} from '../stealHighlight'
import { requestStealClip, stubStealClip } from '../stealHighlightClip'

type BumpEvent = Extract<ArenaSimEvent, { type: 'bump' }>
const bump = (over: Partial<BumpEvent> & Pick<BumpEvent, 'stolen' | 'tick'>): BumpEvent => ({
  type: 'bump',
  winnerId: 'champion',
  loserId: 'rival',
  position: [1, 0, 2],
  ...over,
})

describe('full-load steal detection', () => {
  it('treats stolen >= 2 as a Raider full-load steal', () => {
    expect(isFullLoadSteal(bump({ stolen: 1, tick: 10 }))).toBe(false)
    expect(isFullLoadSteal(bump({ stolen: FULL_LOAD_STEAL_MIN, tick: 10 }))).toBe(true)
    expect(isFullLoadSteal(bump({ stolen: 3, tick: 10 }))).toBe(true)
  })

  it('ignores core_spawn and single-unit bumps', () => {
    const events: ArenaSimEvent[] = [
      { type: 'core_spawn', tick: 5, resourceId: 'core-0', nodeId: 'field', value: 3 },
      bump({ stolen: 1, tick: 20 }),
    ]
    expect(detectFullLoadSteal(events)).toBeNull()
  })

  it('returns the latest full-load steal after afterTick', () => {
    const events: ArenaSimEvent[] = [
      bump({ stolen: 3, tick: 40, winnerId: 'rival' }),
      bump({ stolen: 2, tick: 120, winnerId: 'champion' }),
      bump({ stolen: 1, tick: 200 }),
    ]
    expect(detectFullLoadSteal(events)?.tick).toBe(120)
    expect(detectFullLoadSteal(events, 120)).toBeNull()
    expect(detectFullLoadSteal(events, 39)?.winnerId).toBe('champion')
  })

  it('handles undefined / empty event logs', () => {
    expect(detectFullLoadSteal(undefined)).toBeNull()
    expect(detectFullLoadSteal([])).toBeNull()
  })
})

describe('steal storyboard from battle facts', () => {
  it('rebuilds captions only from recorded bump fields', () => {
    const facts = detectFullLoadSteal([bump({ stolen: 3, tick: 88 })])!
    const board = buildStealStoryboard(facts)
    expect(board.id).toContain('88')
    expect(board.title).toBe('FULL-LOAD STEAL')
    expect(board.subtitle).toContain('3 cores')
    expect(board.subtitle).toContain('tick 88')
    expect(board.prompt).toContain('steals a glowing full cargo load of 3')
    expect(board.audioPrompt).toContain('no spoken instructions')
    expect(board.beats).toHaveLength(4)
    expect(board.beats.map(beat => beat.id)).toEqual(['approach', 'impact', 'transfer', 'stagger'])
    expect(board.facts.stolen).toBe(3)
  })

  it('is deterministic for the same facts', () => {
    const facts = detectFullLoadSteal([bump({ stolen: 2, tick: 50, winnerId: 'rival', loserId: 'champion' })])!
    expect(buildStealStoryboard(facts)).toEqual(buildStealStoryboard(facts))
  })
})

describe('steal highlight clip stub path', () => {
  it('stub works without keys and never throws', () => {
    const board = buildStealStoryboard(detectFullLoadSteal([bump({ stolen: 2, tick: 10 })])!)
    const clip = stubStealClip(board)
    expect(clip.mode).toBe('stub')
    expect(clip.videoUrl).toBeNull()
    expect(clip.posterUrl.startsWith('data:image/svg+xml')).toBe(true)
    expect(clip.label).toMatch(/no FAL_KEY/i)
  })

  it('requestStealClip falls back to stub when the API fails', async () => {
    const board = buildStealStoryboard(detectFullLoadSteal([bump({ stolen: 2, tick: 10 })])!)
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }))
    const clip = await requestStealClip(board, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(clip.mode).toBe('stub')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('requestStealClip accepts a fal upgrade when the API returns one', async () => {
    const board = buildStealStoryboard(detectFullLoadSteal([bump({ stolen: 2, tick: 10 })])!)
    const fetchImpl = vi.fn(async () =>
      Response.json({
        mode: 'fal',
        videoUrl: 'https://example.test/steal.mp4',
        posterUrl: 'data:image/svg+xml,x',
        label: 'fal highlight',
        storyboardId: board.id,
      }),
    )
    const clip = await requestStealClip(board, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(clip.mode).toBe('fal')
    expect(clip.videoUrl).toBe('https://example.test/steal.mp4')
  })

  it('requestStealClip falls back to stub on abort / network error', async () => {
    const board = buildStealStoryboard(detectFullLoadSteal([bump({ stolen: 2, tick: 10 })])!)
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    const clip = await requestStealClip(board, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(clip.mode).toBe('stub')
  })
})
