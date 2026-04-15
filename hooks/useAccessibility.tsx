'use client'

import { useState, useEffect, useCallback } from 'react'

// Screen reader announcement for dynamic content changes
export function useAnnounce() {
  const [announcement, setAnnouncement] = useState('')

  const announce = useCallback((message: string) => {
    setAnnouncement(message)
    // Clear after announcement (screen readers will have read it)
    setTimeout(() => setAnnouncement(''), 1000)
  }, [])

  return { announcement, announce }
}

// Live region component for accessibility announcements
export function LiveRegion({ announcement, priority = 'polite' }: { announcement: string; priority?: 'polite' | 'assertive' }) {
  if (!announcement) return null

  return (
    <div
      aria-live={priority}
      aria-atomic="true"
      className="absolute w-px h-px p-0 overflow-hidden whitespace-nowrap border-0"
    >
      {announcement}
    </div>
  )
}

// Keyboard navigation helper
export function useKeyboardNavigation(
  items: unknown[],
  onSelect: (index: number) => void
) {
  const [focusedIndex, setFocusedIndex] = useState(0)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex((prev) => (prev + 1) % items.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex((prev) => (prev - 1 + items.length) % items.length)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        onSelect(focusedIndex)
        break
    }
  }, [items.length, focusedIndex, onSelect])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return focusedIndex
}

// Focus trap for modals
export function useFocusTrap(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return

    const focusableElements = document.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstFocusable = focusableElements[0] as HTMLElement
    const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement

    firstFocusable?.focus()

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (document.activeElement === lastFocusable) {
        e.preventDefault()
        firstFocusable?.focus()
      }
    }

    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [isActive])
}

// Reduced motion preference check
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    return false
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return prefersReducedMotion
}

// Skip link component for keyboard navigation
export function SkipLink({ targetId, children }: { targetId: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${targetId}`}
      className="absolute -top-10 left-0 z-50 px-4 py-2 bg-sky-600 text-white font-bold rounded-b-lg transition-all focus:top-0"
    >
      {children}
    </a>
  )
}

// High contrast mode detection
export function useHighContrastMode(): boolean {
  const [isHighContrast, setIsHighContrast] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-contrast: more)').matches
    }
    return false
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: more)')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsHighContrast(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setIsHighContrast(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return isHighContrast
}

// Accessible button variants
interface A11yButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'danger' | 'success'
  isLoading?: boolean
  loadingText?: string
}

export function A11yButton({ 
  variant = 'default', 
  isLoading, 
  loadingText,
  children,
  disabled,
  ...props 
}: A11yButtonProps) {
  const variants = {
    default: 'bg-sky-600 hover:bg-sky-500 text-white',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
    success: 'bg-green-600 hover:bg-green-500 text-white',
  }

  return (
    <button
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      aria-disabled={disabled || isLoading}
      className={`px-4 py-2 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]}`}
      {...props}
    >
      {isLoading ? loadingText || 'Loading...' : children}
    </button>
  )
}