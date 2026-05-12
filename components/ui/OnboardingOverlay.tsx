'use client'

import { useState, useEffect } from 'react'

interface VehicleOption {
  type: 'speedster' | 'truck'
  emoji: string
  name: string
  tagline: string
  stats: { speed: number; armor: number; floodResist: number }
}

const VEHICLE_OPTIONS: VehicleOption[] = [
  {
    type: 'speedster',
    emoji: '🏎️',
    name: 'SPEEDSTER',
    tagline: 'Fast · Agile · Fragile',
    stats: { speed: 3, armor: 1, floodResist: 1 },
  },
  {
    type: 'truck',
    emoji: '🚛',
    name: 'TRUCK',
    tagline: 'Tough · Heavy · Flood-proof',
    stats: { speed: 1, armor: 3, floodResist: 3 },
  },
]

function StatBar({ value, max = 3 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-4 rounded-full ${i < value ? 'bg-sky-400' : 'bg-white/10'}`}
        />
      ))}
    </div>
  )
}

const STEPS = [
  {
    emoji: '🤖',
    title: 'CLAWDY',
    subtitle: 'Outsmart the AI',
    body: 'Four autonomous AI agents are racing you for food in a Marble-generated world. Steal their drops, hijack their weather, beat their score.',
  },
  {
    emoji: '🚗',
    title: 'Drive & Collect',
    body: 'WASD / arrows to drive. Space to brake. Collect food before the AI does — chain pickups within 6s for combo multipliers up to 2×. First to hit the round goal wins.',
  },
  {
    emoji: '⛅',
    title: 'Weather Is a Weapon',
    body: 'Win the weather auction to control storms, fog, and gravity. The AI will outbid you if you let it. Open the sidebar (ESC) to bid and use abilities.',
  },
]

const VEHICLE_PICKER_STEP_INDEX = STEPS.length

export function OnboardingOverlay({ onDone }: { onDone: (preferredVehicle?: 'speedster' | 'truck') => void }) {
  const [step, setStep] = useState(0)
  const [chosenVehicle, setChosenVehicle] = useState<'speedster' | 'truck' | null>(null)
  const isVehiclePicker = step === VEHICLE_PICKER_STEP_INDEX
  const totalSteps = STEPS.length + 1

  const next = () => {
    if (step < VEHICLE_PICKER_STEP_INDEX) setStep(s => s + 1)
    else onDone(chosenVehicle ?? undefined)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') next()
      if (e.key === 'Escape') onDone(chosenVehicle ?? undefined)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="relative max-w-sm w-full mx-4 bg-slate-900/95 border border-white/15 rounded-3xl shadow-2xl p-8 flex flex-col items-center text-center gap-5 animate-in fade-in zoom-in-95 duration-300">
        {/* Step dots */}
        <div className="flex gap-2 absolute top-5 left-1/2 -translate-x-1/2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === step ? 'bg-sky-400 w-4' : 'bg-white/20'}`}
            />
          ))}
        </div>

        {isVehiclePicker ? (
          <>
            <div className="mt-4 text-5xl">🚗</div>
            <h2 className="text-xl font-black text-white tracking-tight">Choose Your Ride</h2>
            <p className="text-sm text-white/50 -mt-2">Pick a vehicle — you can switch next round</p>

            <div className="flex gap-3 w-full">
              {VEHICLE_OPTIONS.map(v => (
                <button
                  key={v.type}
                  onClick={() => setChosenVehicle(v.type)}
                  className={`flex-1 rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all ${
                    chosenVehicle === v.type
                      ? 'border-sky-400 bg-sky-500/15 shadow-lg shadow-sky-500/20'
                      : 'border-white/10 bg-white/5 hover:border-white/25'
                  }`}
                >
                  <span className="text-4xl">{v.emoji}</span>
                  <span className="text-[11px] font-black text-white tracking-widest">{v.name}</span>
                  <span className="text-[10px] text-white/40">{v.tagline}</span>
                  <div className="w-full mt-1 flex flex-col gap-1 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] text-white/40 uppercase tracking-wider w-14">Speed</span>
                      <StatBar value={v.stats.speed} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] text-white/40 uppercase tracking-wider w-14">Armor</span>
                      <StatBar value={v.stats.armor} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] text-white/40 uppercase tracking-wider w-14">Flood</span>
                      <StatBar value={v.stats.floodResist} />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3 w-full mt-1">
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex-1 py-3 rounded-2xl border border-white/10 text-white/50 text-sm font-bold hover:bg-white/5 transition-all"
              >
                Back
              </button>
              <button
                onClick={next}
                className="flex-1 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-black text-sm transition-all shadow-lg shadow-sky-500/30"
              >
                {chosenVehicle ? `Start Playing ${chosenVehicle === 'speedster' ? '🏎️' : '🚛'}` : 'Start Playing 🎲'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 text-6xl">{STEPS[step].emoji}</div>
            <h2 className="text-xl font-black text-white tracking-tight">{STEPS[step].title}</h2>
            {'subtitle' in STEPS[step] && STEPS[step].subtitle && (
              <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] -mt-3">{STEPS[step].subtitle}</span>
            )}
            <p className="text-sm text-white/60 leading-relaxed">{STEPS[step].body}</p>

            <div className="flex gap-3 w-full mt-2">
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="flex-1 py-3 rounded-2xl border border-white/10 text-white/50 text-sm font-bold hover:bg-white/5 transition-all"
                >
                  Back
                </button>
              )}
              <button
                onClick={next}
                className="flex-1 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-black text-sm transition-all shadow-lg shadow-sky-500/30"
              >
                {step < STEPS.length - 1 ? 'Next →' : 'Choose Vehicle 🚗'}
              </button>
            </div>
          </>
        )}

        <button
          onClick={() => onDone(chosenVehicle ?? undefined)}
          className="text-[10px] text-white/25 hover:text-white/50 transition-colors uppercase tracking-widest"
        >
          Skip · start driving [ESC]
        </button>
      </div>
    </div>
  )
}
