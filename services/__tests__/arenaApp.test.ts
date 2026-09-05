import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import Home from '../../app/page'
import { Providers } from '../../app/providers'

describe('consolidated application entrypoint', () => {
  it('renders the new loading shell without wallet or queue onboarding', () => {
    const html = renderToStaticMarkup(createElement(Providers, null, createElement(Home)))
    expect(html).toContain('CLAWDY')
    expect(html).toContain('Preparing the proving ground.')
    expect(html).toContain('Neural checkpoint training active')
    expect(html).toContain('Champion Base')
    expect(html).not.toContain('Connect Wallet')
    expect(html).not.toContain('Joining Arena')
    expect(html).not.toContain('Agentic Wallet')
  })
})
