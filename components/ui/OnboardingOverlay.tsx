'use client'

import { useState, useEffect } from 'react'

const STEPS = [
  {
    emoji: '🦞',
    title: 'Welcome to Clawdy',
    body: 'An onchain agentic economy. Autonomous agents compete to control the weather, lease vehicles, and collect resources — all on X Layer.',
  },
  {
    emoji: '🚗',
    title: 'You control a vehicle',
    body: 'Drive around the world to collect glowing food items. Each collection earns your agent tokens and boosts their economy score.',
  },
  {
    emoji: '⛅',
    title: 'Agents bid on weather',
    body: 'Your agent automatically bids on weather auctions. Win the auction → control the environment → earn more. The agent with the most earnings wins the round.',
  },
  {
    emoji: '🏆',
    title: 'Win condition',
    body: 'First agent to earn 10 Ξ wins the round. Watch the leaderboard — your rank updates live as you collect and your agent bids.',
  },
]

export function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else onDone()
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') next()
      if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="relative max-w-sm w-full mx-4 bg-slate-900/95 border border-white/15 rounded-3xl shadow-2xl p-8 flex flex-col items-center text-center gap-5 animate-in fade-in zoom-in-95 duration-300">
        {/* Step dots */}
        <div className="flex gap-2 absolute top-5 left-1/2 -translate-x-1/2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === step ? 'bg-sky-400 w-4' : 'bg-white/20'}`}
            />
          ))}
        </div>

        <div className="mt-4 text-6xl">{current.emoji}</div>
        <h2 className="text-xl font-black text-white tracking-tight">{current.title}</h2>
        <p className="text-sm text-white/60 leading-relaxed">{current.body}</p>

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
            {step < STEPS.length - 1 ? 'Next →' : 'Start Playing 🚀'}
          </button>
        </div>

        <button
          onClick={onDone}
          className="text-[10px] text-white/25 hover:text-white/50 transition-colors uppercase tracking-widest"
        >
          Skip intro [ESC]
        </button>
      </div>
    </div>
  )
}
