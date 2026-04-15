'use client'

import { useEffect, useRef, useCallback } from 'react'

// Tiny Web Audio API sound manager — no external files needed
// All sounds are synthesized procedurally

type SoundType = 'collect' | 'bid-win' | 'bid-lose' | 'milestone' | 'engine-idle' | 'ui-click'

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playCollect() {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08)
  gain.gain.setValueAtTime(0.15, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.15)
}

function playBidWin() {
  const ctx = getCtx()
  const notes = [523, 659, 784, 1047] // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.1)
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.1 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime + i * 0.1)
    osc.stop(ctx.currentTime + i * 0.1 + 0.3)
  })
}

function playBidLose() {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(300, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.25)
  gain.gain.setValueAtTime(0.08, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.25)
}

function playMilestone() {
  const ctx = getCtx()
  const notes = [440, 554, 659, 880, 1109, 1319] // A4 C#5 E5 A5 C#6 E6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.06)
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + i * 0.06 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.4)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime + i * 0.06)
    osc.stop(ctx.currentTime + i * 0.06 + 0.4)
  })
}

function playUIClick() {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 600
  gain.gain.setValueAtTime(0.06, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.05)
}

const SOUND_MAP: Record<SoundType, () => void> = {
  'collect': playCollect,
  'bid-win': playBidWin,
  'bid-lose': playBidLose,
  'milestone': playMilestone,
  'engine-idle': () => {}, // placeholder
  'ui-click': playUIClick,
}

// Global play function
export function playSound(type: SoundType) {
  try {
    SOUND_MAP[type]?.()
  } catch {
    // Audio context may not be available
  }
}

// Ambient background drone
function startAmbient(ctx: AudioContext): () => void {
  const osc1 = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  osc1.type = 'sine'
  osc1.frequency.value = 80
  osc2.type = 'sine'
  osc2.frequency.value = 120

  filter.type = 'lowpass'
  filter.frequency.value = 200

  gain.gain.value = 0
  gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 2)

  osc1.connect(filter)
  osc2.connect(filter)
  filter.connect(gain).connect(ctx.destination)
  osc1.start()
  osc2.start()

  return () => {
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5)
    setTimeout(() => {
      osc1.stop()
      osc2.stop()
    }, 600)
  }
}

// React component that manages ambient sound + listens for game events
export function SoundManager() {
  const stopAmbientRef = useRef<(() => void) | null>(null)
  const enabledRef = useRef(false)

  const enable = useCallback(() => {
    if (enabledRef.current) return
    enabledRef.current = true
    try {
      const ctx = getCtx()
      stopAmbientRef.current = startAmbient(ctx)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    // Start ambient on first user interaction
    const handler = () => { enable(); window.removeEventListener('click', handler); window.removeEventListener('keydown', handler) }
    window.addEventListener('click', handler)
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('keydown', handler)
      stopAmbientRef.current?.()
    }
  }, [enable])

  return null // invisible component
}
