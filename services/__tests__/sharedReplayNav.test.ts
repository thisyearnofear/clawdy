import { afterEach, describe, expect, it } from 'vitest'
import {
  brainMatchesRuleset,
  OPEN_REPLAY_EVENT,
  replayShareHref,
  requestOpenReplay,
  subscribeOpenReplay,
} from '../sharedReplayNav'

describe('replayShareHref', () => {
  it('builds a public capability URL from origin, path and share slug', () => {
    expect(replayShareHref('abc_12-Z', 'https://play.example', '/')).toBe(
      'https://play.example/?replay=abc_12-Z',
    )
    expect(replayShareHref('a/b', 'https://play.example', '/arena')).toBe(
      'https://play.example/arena?replay=a%2Fb',
    )
  })
})

describe('brainMatchesRuleset', () => {
  it('treats absent ruleset as Training Grounds on both sides', () => {
    expect(brainMatchesRuleset(undefined, undefined)).toBe(true)
    expect(brainMatchesRuleset('skirmish', 'skirmish')).toBe(true)
    expect(brainMatchesRuleset('skirmish', undefined)).toBe(false)
    expect(brainMatchesRuleset(undefined, 'skirmish')).toBe(false)
  })
})

describe('open-replay event', () => {
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete globalThis.window
  })

  it('delivers the shareId to subscribers and ignores empty payloads', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>()
    const stubWindow = {
      addEventListener(type: string, handler: (event: Event) => void) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(handler)
      },
      removeEventListener(type: string, handler: (event: Event) => void) {
        listeners.get(type)?.delete(handler)
      },
      dispatchEvent(event: Event) {
        for (const handler of listeners.get(event.type) ?? []) handler(event)
        return true
      },
    }
    // @ts-expect-error stub for node vitest
    globalThis.window = stubWindow

    const seen: string[] = []
    const stop = subscribeOpenReplay(id => seen.push(id))
    requestOpenReplay('share-1')
    stubWindow.dispatchEvent(new CustomEvent(OPEN_REPLAY_EVENT, { detail: {} }))
    requestOpenReplay('')
    stop()
    requestOpenReplay('share-2')
    expect(seen).toEqual(['share-1'])
  })
})
