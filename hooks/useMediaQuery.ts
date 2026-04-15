'use client'

import { useState, useEffect } from 'react'

type MediaQueryCallback = (event: MediaQueryListEvent) => void

/**
 * Custom hook to track media query matches for responsive design
 * @param query - Media query string (e.g., '(max-width: 768px)')
 * @returns boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    // Default to false during SSR
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)

    // Create event listener
    const callback: MediaQueryCallback = (event) => {
      setMatches(event.matches)
    }

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', callback)
      return () => mediaQuery.removeEventListener('change', callback)
    } 
    // Deprecated fallback
    else {
      mediaQuery.addListener(callback)
      return () => mediaQuery.removeListener(callback)
    }
  }, [query])

  return matches
}

/**
 * Hook to detect if device is in touch mode
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const checkTouch = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
    }
    
    checkTouch()
    
    // Also listen for changes (e.g., detachable keyboards)
    window.addEventListener('touchstart', checkTouch, { once: true })
    
    return () => {
      window.removeEventListener('touchstart', checkTouch)
    }
  }, [])

  return isTouch
}

/**
 * Hook to detect if device is in reduced motion mode (accessibility)
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/**
 * Hook to get current viewport dimensions
 */
export function useViewportSize() {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateSize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  return size
}

/**
 * Breakpoint constants for common device sizes
 */
export const BREAKPOINTS = {
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
  mobile: '(max-width: 639px)',
  tablet: '(min-width: 640px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
} as const

/**
 * Hook to check common breakpoints
 */
export function useBreakpoint() {
  const isMobile = useMediaQuery(BREAKPOINTS.mobile)
  const isTablet = useMediaQuery(BREAKPOINTS.tablet)
  const isDesktop = useMediaQuery(BREAKPOINTS.desktop)
  const isSmallMobile = useMediaQuery('(max-width: 479px)')

  return {
    isMobile,
    isTablet,
    isDesktop,
    isSmallMobile,
    isLarge: useMediaQuery(BREAKPOINTS.xl),
  }
}