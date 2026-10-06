import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReplayPanel } from '../../components/workbench/ReplayPanel'
import type { StoryMoment } from '../replayStory'

const noop = () => {}
const moments: StoryMoment[] = [
  { tick: 100, frame: 20, kind: 'bump', tone: 'bad', text: 'Rival bumped you and took 3 cargo. You were staggered' },
  { tick: 160, frame: 32, kind: 'bank', tone: 'good', text: 'You banked 3' },
]

const panel = (props: Partial<Parameters<typeof ReplayPanel>[0]> = {}) =>
  renderToStaticMarkup(createElement(ReplayPanel, {
    tick: 100, replayIndex: 20, replayLength: 80, championNodeId: 'n1', championCargo: 0, flooded: false,
    cinematic: false, coachingLocked: false, coachContext: null, selectedAction: null, frameAdvice: null,
    onSeek: noop, onToggleCinematic: noop, onSelectAction: noop, onQueueCorrection: noop, ...props,
  }))

describe('replay panel story', () => {
  it('lists what happened with its times and marks the current frame', () => {
    const html = panel({ moments })
    expect(html).toContain('What happened (2)')
    expect(html).toContain('Rival bumped you and took 3 cargo. You were staggered')
    expect(html).toContain('5.0s') // tick 100 at 50 ms
    expect(html).toContain('8.0s') // tick 160
    expect(html).toContain('You banked 3')
    // Frame 20 is the bump's own frame.
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
  })

  it('announces the caption for the moment that just happened', () => {
    const html = panel({ moments, captionNow: moments[0] })
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
  })

  it('renders nothing extra for a run without moments, so older callers are unchanged', () => {
    const html = panel()
    expect(html).not.toContain('What happened')
    expect(html).not.toContain('aria-live')
    expect(panel({ moments: [] })).not.toContain('What happened')
  })
})
