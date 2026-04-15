'use client'

import { useState, useEffect } from 'react'

interface LoadingStateProps {
  message?: string
  duration?: number
  showSpinner?: boolean
  className?: string
}

export function LoadingState({
  message = 'Loading...',
  duration = 0,
  showSpinner = true,
  className = ''
}: LoadingStateProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (duration > 0) {
      const interval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 100))
      }, duration / 10)
      return () => clearInterval(interval)
    }
  }, [duration])

  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      {showSpinner && (
        <div className="relative">
          <div className="w-12 h-12 border-4 border-sky-500/20 rounded-full" />
          <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-t-sky-400 rounded-full animate-spin" />
        </div>
      )}
      <p className="text-sm font-medium text-white/70">{message}</p>
      {duration > 0 && (
        <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

// Skeleton loading component for cards
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white/5 rounded-xl p-4 animate-pulse ${className}`}>
      <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
      <div className="h-3 bg-white/10 rounded w-1/2" />
    </div>
  )
}

// Skeleton loading for stats
export function SkeletonStats() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white/5 rounded-lg p-3 animate-pulse">
          <div className="h-3 bg-white/10 rounded w-16 mb-1" />
          <div className="h-5 bg-white/10 rounded w-12" />
        </div>
      ))}
    </div>
  )
}

// Loading overlay for full-screen
export function LoadingOverlay({
  isLoading,
  children,
  message = 'Loading...'
}: {
  isLoading: boolean
  children: React.ReactNode
  message?: string
}) {
  if (!isLoading) return <>{children}</>

  return (
    <div className="relative">
      {children}
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-40 flex items-center justify-center">
        <LoadingState message={message} />
      </div>
    </div>
  )
}

// Button loading state
export function ButtonLoading({ className = '' }: { className?: string }) {
  return (
    <div className={`w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin ${className}`} />
  )
}

// Wallet connection loading
export function WalletConnecting({ status }: { status: string }) {
  const [dots, setDots] = useState('')

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'))
    }, 300)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-2 text-sky-400 text-sm">
      <div className="w-4 h-4 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
      <span>{status}{dots}</span>
    </div>
  )
}

// Transaction pending indicator
export function TransactionPending({ type }: { type: 'bid' | 'rent' | 'collect' }) {
  const labels = {
    bid: 'Submitting weather bid',
    rent: 'Processing vehicle rental',
    collect: 'Collecting reward'
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-sky-500/10 border border-sky-500/30 rounded-lg">
      <div className="w-3 h-3 bg-sky-400 rounded-full animate-pulse" />
      <span className="text-xs font-medium text-sky-300">{labels[type]}</span>
    </div>
  )
}

// WebGL context lost recovery
export function WebGLError() {
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = () => {
    setIsRetrying(true)
    setTimeout(() => window.location.reload(), 1000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95">
      <div className="text-center p-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">WebGL Error</h2>
        <p className="text-white/50 mb-4">Your browser may have run out of graphics memory.</p>
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="px-6 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-600/50 text-white font-bold rounded-xl transition-colors"
        >
          {isRetrying ? 'Reloading...' : 'Reload Page'}
        </button>
      </div>
    </div>
  )
}