'use client'

import { Component, ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    Sentry.captureException(event.error)
  })

  window.addEventListener('unhandledrejection', (event) => {
    Sentry.captureException(event.reason)
  })
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } })
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f2f3e9', color: '#233531', fontFamily: 'var(--font-geist-sans), sans-serif', padding: 20 }}>
          <div style={{ maxWidth: 420, width: '100%', padding: '22px 24px', background: '#ffffff', border: '1px solid #d8ded2', borderRadius: 14 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Something went wrong</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6e7971' }}>The arena hit an unexpected error. Your trained brains are safe in local storage.</p>

            <div style={{ background: '#f7f7ef', border: '1px solid #e3e7dc', borderRadius: 8, padding: 10, marginBottom: 16, overflow: 'auto', maxHeight: 96 }}>
              <p style={{ margin: 0, fontSize: 11, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: '#9a3b2e' }}>
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={this.handleRetry}
                style={{ flex: 1, padding: '9px 14px', background: '#233531', color: '#f2f3e9', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ flex: 1, padding: '9px 14px', background: 'transparent', color: '#233531', border: '1px solid #d8ded2', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}