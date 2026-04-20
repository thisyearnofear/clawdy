'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../../services/gameStore'

// Tiny Web Audio API sound manager — no external files needed
// All sounds are synthesized procedurally

type SoundType = 'collect' | 'bid-win' | 'bid-lose' | 'milestone' | 'engine-idle' | 'ui-click' | 'thunder' | 'splash'

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

function playThunder() {
  const ctx = getCtx()
  // Variation: sometimes distant rumble, sometimes close crack.
  const distance = Math.random() // 0=close, 1=distant
  const isDistant = distance > 0.55

  // Low rumble (always)
  const rumble = ctx.createOscillator()
  const rumbleGain = ctx.createGain()
  rumble.type = 'sawtooth'
  rumble.frequency.setValueAtTime(isDistant ? 55 : 85, ctx.currentTime)
  rumble.frequency.exponentialRampToValueAtTime(isDistant ? 24 : 32, ctx.currentTime + (isDistant ? 1.8 : 1.2))
  rumbleGain.gain.setValueAtTime(0.0001, ctx.currentTime)
  rumbleGain.gain.exponentialRampToValueAtTime(isDistant ? 0.08 : 0.14, ctx.currentTime + 0.06)
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isDistant ? 2.2 : 1.4))
  rumble.connect(rumbleGain).connect(ctx.destination)
  rumble.start()
  rumble.stop(ctx.currentTime + (isDistant ? 2.3 : 1.5))

  if (!isDistant) {
    // Crack (close thunder only)
    const crack = ctx.createOscillator()
    const crackGain = ctx.createGain()
    crack.type = 'triangle'
    crack.frequency.setValueAtTime(1300, ctx.currentTime + 0.02)
    crack.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.16)
    crackGain.gain.setValueAtTime(0.0001, ctx.currentTime + 0.02)
    crackGain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.05)
    crackGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    crack.connect(crackGain).connect(ctx.destination)
    crack.start(ctx.currentTime + 0.02)
    crack.stop(ctx.currentTime + 0.22)
  }
}

function playSplash() {
  const ctx = getCtx()

  // Quick filtered noise burst (water hiss) + tiny pop
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)

  const src = ctx.createBufferSource()
  src.buffer = buffer

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 700

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 4200

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)

  src.connect(hp)
  hp.connect(lp)
  lp.connect(gain).connect(ctx.destination)
  src.start()
  src.stop(ctx.currentTime + 0.09)

  const pop = ctx.createOscillator()
  const popGain = ctx.createGain()
  pop.type = 'sine'
  pop.frequency.setValueAtTime(220, ctx.currentTime)
  pop.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.06)
  popGain.gain.setValueAtTime(0.0001, ctx.currentTime)
  popGain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01)
  popGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)
  pop.connect(popGain).connect(ctx.destination)
  pop.start()
  pop.stop(ctx.currentTime + 0.08)
}

const SOUND_MAP: Record<SoundType, () => void> = {
  'collect': playCollect,
  'bid-win': playBidWin,
  'bid-lose': playBidLose,
  'milestone': playMilestone,
  'engine-idle': () => {}, // placeholder
  'ui-click': playUIClick,
  'thunder': playThunder,
  'splash': playSplash,
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

function makeNoiseBuffer(ctx: AudioContext, seconds = 2) {
  const sampleRate = ctx.sampleRate
  const length = Math.max(1, Math.floor(sampleRate * seconds))
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * 0.6
  return buffer
}

type StormAmbienceController = {
  setMix: (opts: { storm: number; night: number }) => void
  stop: () => void
}

// Storm ambience bed (rain/noise + distant wind) whose mix can be ramped.
function startStormAmbience(ctx: AudioContext): StormAmbienceController {
  const buffer = makeNoiseBuffer(ctx, 2.5)

  // Rain noise (bandpassed)
  const rain = ctx.createBufferSource()
  rain.buffer = buffer
  rain.loop = true
  const rainHP = ctx.createBiquadFilter()
  rainHP.type = 'highpass'
  rainHP.frequency.value = 450
  const rainLP = ctx.createBiquadFilter()
  rainLP.type = 'lowpass'
  rainLP.frequency.value = 5200
  const rainGain = ctx.createGain()
  rainGain.gain.value = 0
  rain.connect(rainHP)
  rainHP.connect(rainLP)
  rainLP.connect(rainGain).connect(ctx.destination)
  rain.start()

  // Night wind / ambience (lowpassed noise + slow wobble)
  const wind = ctx.createBufferSource()
  wind.buffer = buffer
  wind.loop = true
  const windLP = ctx.createBiquadFilter()
  windLP.type = 'lowpass'
  windLP.frequency.value = 260
  const windGain = ctx.createGain()
  windGain.gain.value = 0
  const windLfo = ctx.createOscillator()
  windLfo.type = 'sine'
  windLfo.frequency.value = 0.15
  const windLfoGain = ctx.createGain()
  windLfoGain.gain.value = 0.6
  windLfo.connect(windLfoGain).connect(windGain.gain)
  wind.connect(windLP).connect(windGain).connect(ctx.destination)
  windLfo.start()
  wind.start()

  const setMix = ({ storm, night }: { storm: number; night: number }) => {
    const now = ctx.currentTime
    const s = Math.max(0, Math.min(1, storm))
    const n = Math.max(0, Math.min(1, night))

    // Keep these subtle so they don't fatigue.
    const rainTarget = 0.03 + s * 0.09
    const windTarget = 0.015 + n * 0.04 + s * 0.01

    rainGain.gain.cancelScheduledValues(now)
    windGain.gain.cancelScheduledValues(now)
    rainGain.gain.linearRampToValueAtTime(rainTarget, now + 0.35)
    windGain.gain.linearRampToValueAtTime(windTarget, now + 0.6)
  }

  const stop = () => {
    const now = ctx.currentTime
    rainGain.gain.linearRampToValueAtTime(0, now + 0.3)
    windGain.gain.linearRampToValueAtTime(0, now + 0.5)
    setTimeout(() => {
      try { rain.stop(); } catch {}
      try { wind.stop(); } catch {}
      try { windLfo.stop(); } catch {}
      rain.disconnect()
      wind.disconnect()
      windLfo.disconnect()
    }, 700)
  }

  return { setMix, stop }
}

// React component that manages ambient sound + listens for game events
export function SoundManager() {
  const stopAmbientRef = useRef<(() => void) | null>(null)
  const stormAmbienceRef = useRef<StormAmbienceController | null>(null)
  const enabledRef = useRef(false)

  const preset = useGameStore(s => s.cloudConfig.preset) || 'custom'
  const lightning = useGameStore(s => s.activeWeatherEffects.lightning?.intensity ?? 0)
  const dayNight = useGameStore(s => s.activeWeatherEffects.dayNight?.intensity ?? 0)

  const enable = useCallback(() => {
    if (enabledRef.current) return
    enabledRef.current = true
    try {
      const ctx = getCtx()
      stopAmbientRef.current = startAmbient(ctx)
      stormAmbienceRef.current = startStormAmbience(ctx)
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
      stormAmbienceRef.current?.stop()
    }
  }, [enable])

  useEffect(() => {
    if (!enabledRef.current) return
    // Map weather state to an ambience mix.
    const isStorm = preset === 'stormy' || lightning > 0.25
    const storm = Math.max(0, Math.min(1, (isStorm ? 0.5 : 0) + lightning))
    const night = Math.max(0, Math.min(1, dayNight))
    stormAmbienceRef.current?.setMix({ storm, night })
  }, [preset, lightning, dayNight])

  return null // invisible component
}
