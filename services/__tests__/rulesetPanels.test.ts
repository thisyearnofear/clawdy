import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RulesetPicker } from '../../components/workbench/RulesetPicker'
import { BuildScreen } from '../../components/workbench/BuildScreen'
import { AgentCard } from '../../components/workbench/AgentCard'
import { ViewportHud } from '../../components/workbench/ViewportHud'
import { ArenaEpisode } from '../arenaEpisode'
import { PRACTICE_SCENARIOS } from '../arenaScenarios'
import { baseBuild, buildToTraits } from '../chassis'

const noop = () => {}
const picker = (props: Partial<Parameters<typeof RulesetPicker>[0]> = {}) =>
  renderToStaticMarkup(createElement(RulesetPicker, { unlocked: false, onChange: noop, onSkip: noop, ...props }))

describe('ruleset panels', () => {
  it('offers every locked player an explicit Skip-to-Skirmish CTA (arena-first)', () => {
    const html = picker({ canSkip: true })
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('Skip to Skirmish — clash first')
    expect(html).toContain('Training Grounds stays available')
  })

  it('still hides the skip button when the caller has not granted canSkip', () => {
    // Disclosure decides canSkip; the picker only renders what it is told.
    expect(picker()).not.toContain('Skip to Skirmish')
  })

  it('keeps the unlock available when returning to Training Grounds', () => {
    const html = picker({ unlocked: true })
    expect(html).not.toContain('Skip to Skirmish')
    expect(html).not.toContain('disabled')
    expect(html).toContain('Training Grounds')
  })

  it('explains Skirmish without promising balance or stronger brains', () => {
    const html = picker({ unlocked: true, rulesetId: 'skirmish' })
    expect(html).toContain('Hauler carries 4 cargo')
    expect(html).toContain('up to its free space')
    expect(html).toContain('Scout sees two route hops')
    expect(html).toContain('not balanced')
    expect(html).toContain('Unranked clash')
  })

  it('locks the picker during a run', () => {
    expect((picker({ disabled: true, canSkip: true }).match(/disabled=""/g) ?? []).length).toBe(3)
    expect(picker({ disabled: true, canSkip: true })).toContain('Reset to a fresh setup')
  })

  it('shows all chassis perks only for Skirmish', () => {
    const render = (rulesetId?: 'skirmish') => renderToStaticMarkup(createElement(BuildScreen, {
      build: baseBuild('hauler'), onChange: noop, rulesetId,
    }))
    expect(render('skirmish')).toContain('4 cargo')
    expect(render('skirmish')).toContain('whole load')
    expect(render('skirmish')).toContain('two route hops')
    expect(render('skirmish')).toContain('speed, battery, and bump')
    expect(render()).toContain('No signature perk in Training Grounds')
    expect(render()).toContain('look-only')
    expect(render()).toContain('Switch to Skirmish')
    expect(render()).not.toContain('4 cargo')
  })

  it.each([undefined, 5])('uses actual capacity %s in both cargo readouts', capacity => {
    const agent = new ArenaEpisode(PRACTICE_SCENARIOS[0]).snapshot().agents[0]
    agent.cargo = 2
    if (capacity !== undefined) agent.traits = { ...buildToTraits(baseBuild('hauler')), capacity }
    const card = renderToStaticMarkup(createElement(AgentCard, { agent, policy: 'safe', unlocked: false, onPolicy: noop }))
    expect(card).toContain(` / ${capacity ?? 3}`)
    const hud = renderToStaticMarkup(createElement(ViewportHud, {
      agent, rulesetId: capacity ? 'skirmish' : undefined, phase: 'ready', isMatch: false,
      sideHint: '', score: { you: 0, foe: 0, cargo: 2 }, clock: '0:00', flooded: false,
      drained: false, floodEndsIn: null, nextFloodIn: null, runTip: null, feed: [], error: null, onRetry: noop,
    }))
    expect(hud).toContain(`2/${capacity ?? 3}`)
    expect(hud).toContain(capacity ? 'Skirmish' : 'Training Grounds')
  })
})
