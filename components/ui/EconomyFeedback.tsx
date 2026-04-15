'use client'

import { useState, useEffect, useCallback } from 'react'

interface FeedbackItem {
  id: number
  amount: number
  bidPower: number
  x: number // random horizontal offset for variety
}

let feedbackId = 0
type FeedbackListener = (item: FeedbackItem) => void
const feedbackListeners: FeedbackListener[] = []

// Call this when the player collects food to show the economy link
export function emitEconomyFeedback(amount: number, totalBalance: number) {
  const bidPower = totalBalance * 0.1 // 10% of balance = bid power
  const item: FeedbackItem = {
    id: feedbackId++,
    amount,
    bidPower,
    x: Math.random() * 120 - 60,
  }
  feedbackListeners.forEach(l => l(item))
}

export function EconomyFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([])

  const addItem = useCallback((item: FeedbackItem) => {
    setItems(prev => [...prev.slice(-5), item])
    setTimeout(() => {
      setItems(prev => prev.filter(i => i.id !== item.id))
    }, 2500)
  }, [])

  useEffect(() => {
    feedbackListeners.push(addItem)
    return () => {
      const idx = feedbackListeners.indexOf(addItem)
      if (idx !== -1) feedbackListeners.splice(idx, 1)
    }
  }, [addItem])

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-40 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      {items.map(item => (
        <div
          key={item.id}
          className="absolute animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{
            left: `${item.x}px`,
            animation: 'floatUp 2.5s ease-out forwards',
          }}
        >
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-lg font-black text-green-400 drop-shadow-lg">
              +{item.amount.toFixed(2)} OKB
            </span>
            <span className="text-[9px] font-bold text-sky-300/80 bg-black/30 backdrop-blur-sm rounded-full px-2 py-0.5">
              → Agent bid power: +{item.bidPower.toFixed(3)} OKB
            </span>
          </div>
        </div>
      ))}
      <style jsx>{`
        @keyframes floatUp {
          0% { transform: translateY(0); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translateY(-80px); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
