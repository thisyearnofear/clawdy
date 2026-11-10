import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import Home from '../../app/page'
import { ConvexAppProvider } from '../../components/ConvexClientProvider'

describe('consolidated application entrypoint', () => {
  it('renders the new loading shell without wallet or queue onboarding', () => {
    const html = renderToStaticMarkup(createElement(ConvexAppProvider, null, createElement(Home)))
    expect(html).toContain('CLAWDY')
    expect(html).toContain('Your words are about to build this.')
    expect(html).toContain('Describe the world · coach the brain · prove it holds')
    expect(html).toContain('Help')
    // First-run brain is the bundled trained starter, not the untrained base.
    expect(html).toContain('Starter brain')
    expect(html).not.toContain('Connect Wallet')
    expect(html).not.toContain('Joining Arena')
    expect(html).not.toContain('Agentic Wallet')
  })
})
