'use client'

import { Component, type ReactNode } from 'react'

/**
 * Renders `fallback` if anything below it throws while loading or drawing, so one
 * bad remote model (a forged rover whose file is unreachable or malformed) can
 * never take down the whole arena canvas. Remount with a new `key` to retry.
 */
export class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('Forged rover failed to load; showing the standard rover', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
