'use client'

import { useState, useEffect, useCallback } from 'react'

interface ChatBubble {
  id: number
  agentId: string
  message: string
  emoji: string
  createdAt: number
}

const CHATTER_LINES: Record<string, { emoji: string; lines: string[] }> = {
  'asset-collected': {
    emoji: '😋',
    lines: [
      'Yoink!',
      'Mine now.',
      'Nom nom nom',
      'Easy pickings',
      'Delicious!',
      'Five second rule!',
      'Finders keepers',
      '*crunch*',
    ],
  },
  'bid-won': {
    emoji: '🎯',
    lines: [
      'I control the skies now!',
      'Weather is MY domain',
      'Let it rain!',
      'Bow to the weather king',
      'Outbid, outplayed',
      'The forecast? ME.',
      'Pay up, losers',
    ],
  },
  'bid-lose': {
    emoji: '😤',
    lines: [
      'Next time...',
      'Rigged!',
      'I\'ll be back',
      'Saving my 0G anyway',
      'Whatever.',
      'That was MY bid!',
    ],
  },
  'milestone': {
    emoji: '🏆',
    lines: [
      'Getting rich!',
      'Stack those 0G',
      'To the moon!',
      'Unstoppable',
      'Who\'s the boss?',
    ],
  },
  'agent-died': {
    emoji: '💀',
    lines: [
      'I\'ll remember this...',
      'Respawning in 3... 2...',
      'Not like this!',
      'GG',
      'Tell my tokens I loved them',
    ],
  },
  'idle': {
    emoji: '💭',
    lines: [
      'Where\'s the food at?',
      'Nice weather we\'re having',
      'I should bid more aggressively',
      '*honk honk*',
      'Is anyone even watching?',
      'Vroom vroom',
      'This terrain is bumpy',
      'I smell meatballs...',
    ],
  },
}

let chatterListeners: ((bubble: ChatBubble) => void)[] = []
let nextId = 0

export function emitChatter(agentId: string, eventType: string) {
  const category = CHATTER_LINES[eventType] || CHATTER_LINES['idle']
  const line = category.lines[Math.floor(Math.random() * category.lines.length)]
  const bubble: ChatBubble = {
    id: nextId++,
    agentId,
    message: line,
    emoji: category.emoji,
    createdAt: Date.now(),
  }
  chatterListeners.forEach(l => l(bubble))
}

// Periodic idle chatter
let idleInterval: ReturnType<typeof setInterval> | null = null
const IDLE_AGENTS = ['Scout', 'Weather', 'Mobility', 'Treasury']

function startIdleChatter() {
  if (idleInterval) return
  idleInterval = setInterval(() => {
    const agent = IDLE_AGENTS[Math.floor(Math.random() * IDLE_AGENTS.length)]
    emitChatter(agent, 'idle')
  }, 8000 + Math.random() * 7000) // every 8-15s
}

export function AgentChatter() {
  const [bubbles, setBubbles] = useState<ChatBubble[]>([])

  const addBubble = useCallback((bubble: ChatBubble) => {
    setBubbles(prev => {
      const next = [...prev, bubble]
      return next.length > 4 ? next.slice(-4) : next
    })
  }, [])

  useEffect(() => {
    chatterListeners.push(addBubble)
    startIdleChatter()
    return () => {
      chatterListeners = chatterListeners.filter(l => l !== addBubble)
    }
  }, [addBubble])

  // Auto-remove after 3.5s
  useEffect(() => {
    if (bubbles.length === 0) return
    const timer = setTimeout(() => {
      setBubbles(prev => prev.filter(b => Date.now() - b.createdAt < 3500))
    }, 3600)
    return () => clearTimeout(timer)
  }, [bubbles])

  return (
    <div className="fixed bottom-40 left-6 z-20 flex flex-col gap-2 pointer-events-none max-w-[260px]">
      {bubbles.map((b) => (
        <div
          key={b.id}
          className="flex items-start gap-2 animate-in slide-in-from-left-4 fade-in duration-300"
        >
          <span className="text-lg flex-shrink-0">{b.emoji}</span>
          <div className="bg-black/50 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-white/10">
            <span className="text-[9px] font-bold text-sky-400/70 uppercase tracking-wider block">{b.agentId}</span>
            <span className="text-xs text-white/80 leading-tight">{b.message}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
