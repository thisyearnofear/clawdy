import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CoachPanel } from '../../components/workbench/CoachPanel'
import { LessonComparison } from '../../components/workbench/LessonComparison'
import type { PracticeComparison } from '../practiceComparison'
import { SEASON_0_STARTER_CHECKPOINT } from '../starterCheckpoint'
import type { ArenaRecording } from '../arenaEpisode'

const noop = () => {}
const fileInputRef = createRef<HTMLInputElement>()

function coachPanel(props: Partial<Parameters<typeof CoachPanel>[0]> = {}) {
  return renderToStaticMarkup(createElement(CoachPanel, {
    activeCheckpoint: SEASON_0_STARTER_CHECKPOINT,
    checkpoints: [SEASON_0_STARTER_CHECKPOINT],
    phase: 'ready',
    coachingLocked: false,
    trainFocusLine: null,
    onSelectCheckpoint: noop,
    onExportCheckpoint: noop,
    onImportClick: noop,
    onFileChange: noop,
    fileInputRef,
    onPropose: noop,
    promptText: '',
    onPromptTextChange: noop,
    approvedCount: 0,
    isTraining: false,
    onTrain: noop,
    examples: [],
    onToggleApprove: noop,
    onRemoveExample: noop,
    trainMessage: null,
    ...props,
  }))
}

describe('CoachPanel hierarchy', () => {
  it('leads with the correction queue, Train control and status, not keyword guidance', () => {
    const html = coachPanel()
    const approve = html.indexOf('Approve (0)')
    const train = html.indexOf('Train (0)')
    const guidance = html.indexOf('Keyword guidance (limited parser)')
    expect(approve).toBeGreaterThan(-1)
    expect(train).toBeGreaterThan(-1)
    expect(guidance).toBeGreaterThan(-1)
    expect(approve).toBeLessThan(guidance)
    expect(train).toBeLessThan(guidance)
    expect(html).toContain('Choose an alternative road or wait/drain action in Replay. Approve the draft here, then train.')
  })

  it('keeps bank/collect out of the teachable chips and rules', () => {
    const html = coachPanel()
    expect(html).toContain('Pickup and full-cargo return are shared controller rules')
    expect(html).not.toContain('Bank &amp; cargo')
    expect(html).not.toContain('Grab cores')
    expect(html).not.toContain('Deliver when full')
    expect(html).not.toContain('Prioritize adjacent cores')
  })

  it('locks coaching and training controls in a scored match', () => {
    const html = coachPanel({ coachingLocked: true, phase: 'running' })
    expect(html).toContain('Scored match')
    expect(html).toContain('Coaching and training stay off')
    expect(html).toContain('disabled')
  })

  it('renders training status honestly while a job is in flight', () => {
    const html = coachPanel({ isTraining: true, approvedCount: 2, trainMessage: 'Teaching from the approved notes…' })
    expect(html).toContain('Training…')
    expect(html).toContain('Teaching from the approved notes…')
  })
})

const recordingStub = { scenario: { id: 'practice-ep-1' }, checkpoints: [], decisions: [] } as unknown as ArenaRecording

function comparisonFixture(overrides: Partial<PracticeComparison> = {}): PracticeComparison {
  return {
    scenarioId: 'sandstone-basin.practice',
    worldVersion: 'sandstone-basin.v1',
    controllerVersion: 'season-0.reference.3',
    rival: 'safe',
    baseline: {
      checkpointId: 'parent-1',
      checkpointName: 'Starter brain',
      weightsHash: 'abcd1234abcd1234abcd1234',
      banked: 4,
      rivalBanked: 5,
      winner: 'rival',
      recoveries: 0,
      recording: recordingStub,
      decisions: [],
    },
    trained: {
      checkpointId: 'child-1',
      checkpointName: 'Rook v2',
      weightsHash: 'ffff1234ffff1234ffff1234',
      banked: 2,
      rivalBanked: 5,
      winner: 'rival',
      recoveries: 0,
      recording: recordingStub,
      decisions: [],
    },
    bankedDelta: -2,
    firstDivergence: null,
    ...overrides,
  }
}

describe('LessonComparison presentation', () => {
  it('shows a negative score change without claiming improvement', () => {
    const html = renderToStaticMarkup(createElement(LessonComparison, {
      comparison: comparisonFixture(),
      reviewing: null,
      onWatch: noop,
      onJumpToDivergence: noop,
    }))
    expect(html).toContain('Score change')
    expect(html).toContain('-2')
    expect(html).toContain('No different accepted decisions on this practice run.')
    expect(html).toContain('Matched physical practice, not held-out or ranked')
    expect(html).not.toContain('Improvement')
  })

  it('reports the first different accepted decision with friendly labels', () => {
    const html = renderToStaticMarkup(createElement(LessonComparison, {
      comparison: comparisonFixture({
        bankedDelta: 3,
        firstDivergence: {
          tick: 10,
          parentAction: { type: 'move', edgeId: 'valley-v1' },
          childAction: { type: 'move', edgeId: 'ridge-r1' },
        },
      }),
      reviewing: 'trained',
      onWatch: noop,
      onJumpToDivergence: noop,
    }))
    expect(html).toContain('+3')
    expect(html).toContain('First different accepted decision at tick 10')
    expect(html).toContain('take the valley')
    expect(html).toContain('take the ridge')
    expect(html).toContain('Jump to first different decision')
    expect(html).toContain('Watch the lesson')
    expect(html).toContain('Parent replay')
  })
})
