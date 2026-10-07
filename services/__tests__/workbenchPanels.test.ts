import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../components/ConvexClientProvider', () => ({ ConvexLineageBadge: () => null }))

import { CoachPanel } from '../../components/workbench/CoachPanel'
import { BuildScreen } from '../../components/workbench/BuildScreen'
import { TrainingControls } from '../../components/workbench/TrainingControls'
import { LessonComparison } from '../../components/workbench/LessonComparison'
import type { PracticeComparison } from '../practiceComparison'
import { SEASON_0_STARTER_CHECKPOINT } from '../starterCheckpoint'
import type { ArenaRecording } from '../arenaEpisode'
import { baseBuild, CHASSIS_BASE, DEFAULT_BUILD, setAxisLevel, STAT_BUDGET, toggleModule } from '../buildBudget'
import { DEFAULT_TRAINING_CONFIG, setKnob, TRAINING_KNOBS, TRAINING_LABELS } from '../trainingConfig'

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
    build: baseBuild(DEFAULT_BUILD.chassis),
    onBuildChange: noop,
    trainingConfig: { ...DEFAULT_TRAINING_CONFIG },
    onTrainingConfigChange: noop,
    ...props,
  }))
}

describe('CoachPanel hierarchy', () => {
  it('leads with the correction queue, Train control and status, not keyword guidance', () => {
    const html = coachPanel()
    const approve = html.indexOf('Approve (0)')
    const train = html.indexOf('Train (0)')
    // The summary is titled by the disclosure ladder: with an empty queue the
    // guidance block is the only way forward, so it opens and leads.
    const guidance = html.indexOf('How to teach it')
    expect(approve).toBeGreaterThan(-1)
    expect(train).toBeGreaterThan(-1)
    expect(guidance).toBeGreaterThan(-1)
    expect(approve).toBeLessThan(guidance)
    expect(train).toBeLessThan(guidance)
    expect(html).toContain('Approve the lessons your champion learns from, then train a new brain.')
    // The empty state must name both ways to create a lesson, since neither is
    // discoverable on its own.
    expect(html).toContain('Call a route')
    expect(html).toContain('Replay')
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

describe('BuildScreen', () => {
  const render = (props: Partial<Parameters<typeof BuildScreen>[0]> = {}) =>
    renderToStaticMarkup(createElement(BuildScreen, { build: baseBuild(DEFAULT_BUILD.chassis), onChange: noop, ...props }))

  it('renders every chassis, axis and module as a labelled control', () => {
    const html = render()
    for (const chassis of ['Scout', 'Hauler', 'Raider']) expect(html).toContain(chassis)
    for (const axis of ['Navigation', 'Speed', 'Battery', 'Bump defence', 'Bump attack']) expect(html).toContain(axis)
    for (const label of ['Wide sensor', 'Armour', 'Ram plate', 'Extra cell']) expect(html).toContain(label)
  })

  it('shows the remaining budget in plain words', () => {
    expect(render()).toContain(`${STAT_BUDGET} of ${STAT_BUDGET} points left`)
  })

  it('caps each slider at what the budget allows, so a drag cannot overspend', () => {
    const spent = setAxisLevel(baseBuild('hauler'), 'speed', 4)
    const html = render({ build: spent })
    // Two points on speed cost 1 + 2 = 3, the whole budget, so no axis may
    // offer an increase beyond what is already held.
    expect(html).toMatch(/max="4"/)
    expect(html).toContain(`0 of ${STAT_BUDGET} points left`)
  })

  it('prices the next point per axis instead of showing a bare number', () => {
    const html = render()
    expect(html).toContain('next costs 1')
  })

  it('labels an inert axis as roadmap rather than implying an effect', () => {
    const html = render()
    expect(html).toContain('roadmap')
    expect(html).toContain('no effect in this sim yet')
  })

  it('announces the readout as a live region for assistive tech', () => {
    const html = render()
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('role="status"')
  })

  it('gives every slider an accessible value text', () => {
    const html = render()
    expect(html).toMatch(/aria-valuetext="Speed \d+ of \d+"/)
    expect(html).toContain('Raises route travel rate')
    expect(html).toContain('Raises battery capacity')
    expect(html).toContain('Adds to bump strength')
    expect(html).toContain('aria-describedby=')
  })

  it('disables a third module slot rather than overfilling', () => {
    const two = toggleModule(toggleModule(baseBuild('hauler'), 'armour'), 'ram-plate')
    const html = render({ build: two })
    expect(html).toMatch(/aria-pressed="true"/)
    // The remaining chips are disabled once both slots are full.
    expect(html).toContain('disabled')
  })

  it('surfaces an invalid build as an alert instead of silently accepting it', () => {
    const invalid = { ...baseBuild('hauler'), points: { ...CHASSIS_BASE.hauler, speed: 99 } }
    const html = render({ build: invalid })
    expect(html).toContain('role="alert"')
    // Stream A's message, verbatim: the readout must not invent its own rules.
    expect(html).toContain('speed must be an integer from 0 to 6')
    // The readout must survive an invalid build rather than throwing mid-render.
    expect(html).toContain('This build is not legal yet')
  })

  it('never renders a nonsensical remaining-point count', () => {
    const invalid = { ...baseBuild('hauler'), points: { ...CHASSIS_BASE.hauler, speed: 99 } }
    const html = render({ build: invalid })
    expect(html).not.toMatch(/-\d+ of \d+ points left/)
    expect(html).toContain('over the 3-point budget')
  })

  it('disables every control during a locked match', () => {
    const html = render({ disabled: true })
    expect(html).toContain('disabled')
  })
})

describe('TrainingControls', () => {
  const render = (props: Partial<Parameters<typeof TrainingControls>[0]> = {}) =>
    renderToStaticMarkup(createElement(TrainingControls, { config: { ...DEFAULT_TRAINING_CONFIG }, onChange: noop, ...props }))

  it('renders every Stream B knob as a labelled range control', () => {
    const html = render()
    for (const knob of TRAINING_KNOBS) expect(html).toContain(TRAINING_LABELS[knob])
    for (const knob of TRAINING_KNOBS) expect(html).toContain(`id="training-${knob}"`)
    expect((html.match(/type="range"/g) ?? []).length).toBe(TRAINING_KNOBS.length)
  })

  it('labels each slider for assistive tech rather than leaving a bare number', () => {
    const html = render()
    // aria-valuetext carries the meaning a bare number cannot.
    for (const knob of TRAINING_KNOBS) expect(html).toContain(`aria-valuetext="${TRAINING_LABELS[knob]}`)
    expect(html).toContain('aria-describedby=')
  })

  it('shows the real run cost in plain words', () => {
    expect(render()).toContain('30 generations of 16 candidates')
    expect(render()).toContain('480')
  })

  it('announces a changed config as a live region', () => {
    const dirty = setKnob(DEFAULT_TRAINING_CONFIG, 'generations', 50)
    expect(render({ config: dirty })).toContain('Changed from the builder defaults')
    expect(render()).not.toContain('Changed from the builder defaults')
  })

  it('reports an out-of-range config in an alert instead of silently clamping', () => {
    const html = render({ config: { ...DEFAULT_TRAINING_CONFIG, generations: 0 } })
    expect(html).toContain('role="alert"')
    expect(html).toContain('between 1 and 500')
  })

  it('disables every control during a locked match', () => {
    expect(render({ disabled: true })).toContain('disabled')
  })

  it('is reachable from the Coach panel', () => {
    expect(coachPanel()).toContain('Training controls')
    expect(coachPanel()).toContain('Generations')
  })
})
