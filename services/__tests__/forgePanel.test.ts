import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  client: {} as object | null,
  authenticated: false,
  rows: [] as unknown[],
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated, isLoading: false }),
  useQuery: (_ref: unknown, args: unknown) => (args === 'skip' ? undefined : state.rows),
  useAction: () => async () => ({ forgeId: 'new' }),
}))
vi.mock('../../components/ConvexClientProvider', () => ({ useConvexClient: () => state.client, ConvexLineageBadge: () => null }))

import { ForgePanel } from '../../components/workbench/ForgePanel'
import { CoachPanel } from '../../components/workbench/CoachPanel'
import { SEASON_0_STARTER_CHECKPOINT } from '../starterCheckpoint'
import { baseBuild, DEFAULT_BUILD } from '../buildBudget'
import { DEFAULT_TRAINING_CONFIG } from '../trainingConfig'
import { FORGE_MESSAGES } from '../forge'

const ready = { id: 'f1', chassis: 'raider', paint: 'ember', status: 'ready', createdAt: 2, url: 'https://files.example/f1', error: null }
const pending = { id: 'f2', chassis: 'scout', paint: 'ice', status: 'pending', createdAt: 3, url: null, error: null }
const failed = { id: 'f3', chassis: 'hauler', paint: 'moss', status: 'failed', createdAt: 4, url: null, error: FORGE_MESSAGES['tripo-failed'] }

function render() {
  return renderToStaticMarkup(createElement(ForgePanel, {}))
}

describe('ForgePanel', () => {
  beforeEach(() => {
    state.client = {}
    state.authenticated = true
    state.rows = []
  })

  it('renders nothing when Convex is not configured, so offline play is untouched', () => {
    state.client = null
    expect(render()).toBe('')
  })

  it('asks signed-out players to sign in and disables the Forge button', () => {
    state.authenticated = false
    const html = render()
    expect(html).toContain(FORGE_MESSAGES['sign-in-required'])
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Forge<\/button>/)
  })

  it('offers every chassis and paint and enables Forge for a signed-in player', () => {
    const html = render()
    for (const label of ['scout', 'hauler', 'raider', 'moss', 'ember', 'ice', 'violet', 'sand']) expect(html).toContain(`>${label}</button>`)
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Forge<\/button>/)
  })

  it('shows the busy rule and progress while a forge is running', () => {
    state.rows = [pending]
    const html = render()
    expect(html).toContain(FORGE_MESSAGES['forge-busy'])
    expect(html).toContain('Forging… this takes about a minute')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Forge<\/button>/)
  })

  it('marks the newest ready forge as the look in use and offers the standard rover', () => {
    state.rows = [ready]
    const html = render()
    expect(html).toContain('In use')
    expect(html).toContain('Use the standard rover')
  })

  it('shows a clear message when the last forge did not finish', () => {
    state.rows = [failed]
    const html = render()
    expect(html).toContain(FORGE_MESSAGES['tripo-failed'])
    expect(html).toContain('Did not finish')
  })
})

const noop = () => {}

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
    fileInputRef: createRef<HTMLInputElement>(),
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

describe('Forge in the Coach panel', () => {
  beforeEach(() => {
    state.client = {}
    state.authenticated = true
    state.rows = []
  })

  it('is absent unless the scene asks for forged looks', () => {
    expect(coachPanel()).not.toContain('Forge your champion')
  })

  it('sits with the other disclosures and stays usable during a scored match', () => {
    const html = coachPanel({ onForgedLookChange: noop, coachingLocked: true })
    expect(html).toContain('Forge your champion')
    expect(html.indexOf('Training controls')).toBeLessThan(html.indexOf('Forge your champion'))
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Forge<\/button>/)
  })
})
