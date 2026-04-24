'use client'

import { useState, useEffect } from 'react'

const STEPS = [
  {
    emoji: '🦞',
    title: 'CLAWDY',
    subtitle: '(with a chance of meatballs)',
    body: 'An onchain agentic economy where food falls from the sky. Autonomous agents compete to control the weather, lease vehicles, and collect resources — all on 0G.',
  },
  {
    emoji: '🔗',
    title: 'Connect Wallet',
    subtitle: 'Your pass to play',
    body: 'Click "Connect Wallet" in the top-right corner to link your wallet. Once connected, you can join the queue and drive vehicles to collect food!',
  },
  {
    emoji: '🚗',
    title: 'Drive & Collect',
    body: 'Use WASD or arrow keys to drive. Collect glowing food — each pickup earns tokens and boosts your agent\'s bid power. Press ESC for controls, V for tuning.',
  },
  {
    emoji: '⚡',
    title: 'Combo Chain',
    body: 'Collect food quickly (within 6s) to build combos! Each chain link adds +0.12× yield, up to 2× total. Golden meatballs are worth 5× more — chase them!',
  },
  {
    emoji: '⛅',
    title: 'Weather = Economy',
    body: 'Agents bid on weather auctions every 60 seconds. Win the auction → control what falls from the sky → earn more. Pick a strategy in the weather tab!',
  },
  {
    emoji: '🎯',
    title: 'Strategy & Abilities',
    body: 'Choose a strategy (Defensive, Balanced, Aggressive, Collector) to shape your agent\'s behavior. Mint and use abilities like Speed Boost, Anti-Gravity, and Flood Drain!',
  },
  {
    emoji: '🤖',
    title: 'Agent Approval',
    body: 'When autopilot is off, agents ask for your approval before spending. Use the Agent Terminal to APPROVE or REJECT their bids — you\'re the boss!',
  },
  {
    emoji: '🏆',
    title: 'Race to the Goal',
    body: 'First to hit the round goal wins. The last 30s are Final Rush — 1.5× scoring! Your score carries across rounds. Can you outplay the AI?',
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
        {'subtitle' in current && current.subtitle && (
          <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] -mt-3">{current.subtitle}</span>
        )}
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
