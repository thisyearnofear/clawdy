'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

export type ToastType = 'collect' | 'bid-win' | 'bid-lose' | 'rent' | 'milestone'

export interface Toast {
  id: number
  type: ToastType
  message: string
  sub?: string
  emoji: string
}

let toastId = 0
type ToastListener = (toast: Toast) => void
const listeners: ToastListener[] = []

export function emitToast(type: ToastType, message: string, sub?: string) {
  const emojis: Record<ToastType, string> = {
    collect: '🍖',
    'bid-win': '🏆',
    'bid-lose': '💸',
    rent: '🚗',
    milestone: '⭐',
  }
  const toast: Toast = { id: toastId++, type, message, sub, emoji: emojis[type] }
  listeners.forEach(l => l(toast))
}

export function useToastEmitter() {
  return emitToast
}

export function GameToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Toast) => {
    setToasts(prev => [...prev.slice(-4), toast])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id))
    }, 3000)
  }, [])

  useEffect(() => {
    listeners.push(addToast)
    return () => {
      const idx = listeners.indexOf(addToast)
      if (idx !== -1) listeners.splice(idx, 1)
    }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-5 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 ${
            toast.type === 'bid-win'
              ? 'bg-yellow-500/20 border-yellow-400/40 text-yellow-200'
              : toast.type === 'milestone'
              ? 'bg-purple-500/20 border-purple-400/40 text-purple-200'
              : toast.type === 'bid-lose'
              ? 'bg-red-500/10 border-red-400/20 text-red-300'
              : 'bg-black/50 border-white/10 text-white'
          }`}
        >
          <span className="text-xl">{toast.emoji}</span>
          <div>
            <div className="text-sm font-black">{toast.message}</div>
            {toast.sub && <div className="text-[10px] opacity-60">{toast.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

// Big celebration overlay for bid wins
export function BidWinCelebration({ preset, onDone }: { preset: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed top-4 right-4 z-[90] pointer-events-none">
      <div className="pointer-events-auto relative flex max-w-sm items-start gap-3 rounded-2xl border border-yellow-400/40 bg-yellow-500/20 px-4 py-3 shadow-2xl shadow-yellow-500/20 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="text-3xl leading-none">🏆</div>
        <div className="min-w-0 pr-4">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-300/70 mb-1">Weather Auction Resolved</div>
          <div className="text-base font-black text-white capitalize leading-tight">{preset} weather</div>
          <div className="text-[11px] text-yellow-100/70 mt-1 leading-tight">Winning bidder controls the environment</div>
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label="Dismiss weather auction celebration"
          className="ml-auto rounded-full border border-white/10 bg-black/20 p-1 text-white/70 transition hover:bg-black/35 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
