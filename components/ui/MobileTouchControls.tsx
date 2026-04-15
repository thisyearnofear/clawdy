'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// Dispatches synthetic keyboard events so useKeyboardControls picks them up
function dispatchKey(code: string, type: 'keydown' | 'keyup') {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))
}

interface JoystickState {
  active: boolean
  dx: number // -1 to 1
  dy: number // -1 to 1
}

export function MobileTouchControls() {
  const [isMobile, setIsMobile] = useState(false)
  const joystickRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<JoystickState>({ active: false, dx: 0, dy: 0 })
  const activeKeysRef = useRef<Set<string>>(new Set())
  const touchIdRef = useRef<number | null>(null)
  const boostTouchRef = useRef<number | null>(null)

  useEffect(() => {
    const check = () => {
      setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const pressKey = useCallback((code: string) => {
    if (!activeKeysRef.current.has(code)) {
      activeKeysRef.current.add(code)
      dispatchKey(code, 'keydown')
    }
  }, [])

  const releaseKey = useCallback((code: string) => {
    if (activeKeysRef.current.has(code)) {
      activeKeysRef.current.delete(code)
      dispatchKey(code, 'keyup')
    }
  }, [])

  const releaseAll = useCallback(() => {
    for (const code of activeKeysRef.current) {
      dispatchKey(code, 'keyup')
    }
    activeKeysRef.current.clear()
  }, [])

  const updateFromJoystick = useCallback((dx: number, dy: number) => {
    const deadzone = 0.2
    // Forward/backward
    if (dy < -deadzone) pressKey('KeyW')
    else releaseKey('KeyW')
    if (dy > deadzone) pressKey('KeyS')
    else releaseKey('KeyS')
    // Left/right
    if (dx < -deadzone) pressKey('KeyA')
    else releaseKey('KeyA')
    if (dx > deadzone) pressKey('KeyD')
    else releaseKey('KeyD')
  }, [pressKey, releaseKey])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return
    const touch = e.changedTouches[0]
    touchIdRef.current = touch.identifier
    stateRef.current.active = true
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchIdRef.current === null) return
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current)
    if (!touch || !joystickRef.current) return

    const rect = joystickRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const maxR = rect.width / 2

    let dx = (touch.clientX - cx) / maxR
    let dy = (touch.clientY - cy) / maxR
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 1) { dx /= dist; dy /= dist }

    stateRef.current.dx = dx
    stateRef.current.dy = dy

    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx * maxR * 0.6}px, ${dy * maxR * 0.6}px)`
    }

    updateFromJoystick(dx, dy)
  }, [updateFromJoystick])

  const handleTouchEnd = useCallback(() => {
    touchIdRef.current = null
    stateRef.current = { active: false, dx: 0, dy: 0 }
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(0px, 0px)'
    }
    releaseAll()
  }, [releaseAll])

  // Boost button handlers
  const handleBoostStart = useCallback((e: React.TouchEvent) => {
    boostTouchRef.current = e.changedTouches[0].identifier
    pressKey('Space')
  }, [pressKey])

  const handleBoostEnd = useCallback(() => {
    boostTouchRef.current = null
    releaseKey('Space')
  }, [releaseKey])

  if (!isMobile) return null

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {/* Virtual joystick - bottom left */}
      <div
        ref={joystickRef}
        className="absolute bottom-8 left-8 w-32 h-32 rounded-full bg-white/10 backdrop-blur-sm border-2 border-white/20 pointer-events-auto touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Knob */}
        <div
          ref={knobRef}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/30 backdrop-blur-xl border border-white/40 shadow-lg transition-none"
        />
        {/* Direction indicators */}
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-white/30 text-[8px] font-black">▲</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-white/30 text-[8px] font-black">▼</span>
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-white/30 text-[8px] font-black">◀</span>
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-white/30 text-[8px] font-black">▶</span>
      </div>

      {/* Boost / Jump button - bottom right */}
      <div
        className="absolute bottom-8 right-8 w-20 h-20 rounded-full bg-sky-500/20 backdrop-blur-sm border-2 border-sky-400/40 pointer-events-auto touch-none flex items-center justify-center active:bg-sky-500/40 active:scale-95 transition-all"
        onTouchStart={handleBoostStart}
        onTouchEnd={handleBoostEnd}
        onTouchCancel={handleBoostEnd}
      >
        <span className="text-white font-black text-xs uppercase tracking-wider">Boost</span>
      </div>

      {/* Label */}
      <div className="absolute bottom-44 left-8 text-white/30 text-[8px] font-black uppercase tracking-widest pointer-events-none">
        Touch to drive
      </div>
    </div>
  )
}
