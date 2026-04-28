'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { playSound } from './SoundManager'

export type ToastType = 'collect' | 'bid-win' | 'bid-lose' | 'rent' | 'milestone'

// ── Discovery Nudges ─────────────────────────────────────────────────────────
// Clickable contextual hints that surface onchain features at the right moment.

export interface DiscoveryNudge {
  id: number
  emoji: string
  title: string
  body: string
  cta: string
  tab: 'weather' | 'vehicles' | 'stats'
}

let nudgeId = 0
type NudgeListener = (nudge: DiscoveryNudge) => void
const nudgeListeners: NudgeListener[] = []

export function emitDiscoveryNudge(nudge: Omit<DiscoveryNudge, 'id'>) {
  const full: DiscoveryNudge = { ...nudge, id: nudgeId++ }
  nudgeListeners.forEach(l => l(full))
}

export function DiscoveryNudges({ onOpen }: { onOpen: (tab: DiscoveryNudge['tab']) => void }) {
  const [nudges, setNudges] = useState<DiscoveryNudge[]>([])

  const addNudge = useCallback((nudge: DiscoveryNudge) => {
    setNudges(prev => {
      // Deduplicate by tab — only one nudge per tab at a time
      const filtered = prev.filter(n => n.tab !== nudge.tab)
      return [...filtered, nudge]
    })
    setTimeout(() => {
      setNudges(prev => prev.filter(n => n.id !== nudge.id))
    }, 8000)
  }, [])

  useEffect(() => {
    nudgeListeners.push(addNudge)
    return () => {
      const idx = nudgeListeners.indexOf(addNudge)
      if (idx !== -1) nudgeListeners.splice(idx, 1)
    }
  }, [addNudge])

  if (nudges.length === 0) return null

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {nudges.map(nudge => (
        <div
          key={nudge.id}
          className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-purple-400/30 bg-purple-900/70 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-300 max-w-xs w-full pointer-events-auto"
        >
          <span className="text-2xl shrink-0">{nudge.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-black text-white">{nudge.title}</div>
            <div className="text-[9px] text-white/55 leading-snug mt-0.5">{nudge.body}</div>
          </div>
          <button
            onClick={() => {
              onOpen(nudge.tab)
              setNudges(prev => prev.filter(n => n.id !== nudge.id))
            }}
            className="shrink-0 px-2.5 py-1.5 rounded-xl bg-purple-500/40 hover:bg-purple-500/60 border border-purple-400/30 text-purple-200 text-[9px] font-black uppercase tracking-wider transition-all"
          >
            {nudge.cta}
          </button>
          <button
            onClick={() => setNudges(prev => prev.filter(n => n.id !== nudge.id))}
            className="shrink-0 text-white/30 hover:text-white/60 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

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

// ── Auction Flash ─────────────────────────────────────────────────────────────
// Full-screen dramatic announcement when an agent wins a weather auction.

export interface AuctionFlashData {
  agentId: string
  preset: string
}

type AuctionFlashListener = (data: AuctionFlashData) => void
const auctionFlashListeners: AuctionFlashListener[] = []

export function emitAuctionFlash(data: AuctionFlashData) {
  auctionFlashListeners.forEach(l => l(data))
}

const PRESET_EMOJI: Record<string, string> = {
  stormy: '⛈️',
  cosmic: '🌌',
  sunset: '🌅',
  candy: '🍭',
  blizzard: '❄️',
  custom: '🌀',
}

export function AuctionFlash() {
  const [flash, setFlash] = useState<AuctionFlashData | null>(null)

  const handleFlash = useCallback((data: AuctionFlashData) => {
    setFlash(data)
    playSound('bid-win')
    setTimeout(() => setFlash(null), 3500)
  }, [])

  useEffect(() => {
    auctionFlashListeners.push(handleFlash)
    return () => {
      const idx = auctionFlashListeners.indexOf(handleFlash)
      if (idx !== -1) auctionFlashListeners.splice(idx, 1)
    }
  }, [handleFlash])

  if (!flash) return null

  const emoji = PRESET_EMOJI[flash.preset] ?? '🌩️'
  const agentShort = flash.agentId.length > 12 ? flash.agentId.slice(0, 10) + '…' : flash.agentId

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center animate-in fade-in duration-200">
      {/* Vignette flash */}
      <div className="absolute inset-0 bg-yellow-400/10 animate-pulse" style={{ animationDuration: '0.4s' }} />
      {/* Border flash */}
      <div className="absolute inset-0 border-4 border-yellow-400/60 rounded-none animate-in fade-in duration-100" />
      {/* Center card */}
      <div className="relative flex flex-col items-center gap-3 px-10 py-8 rounded-3xl border-2 border-yellow-400/50 bg-black/75 backdrop-blur-2xl shadow-2xl shadow-yellow-500/30 animate-in zoom-in-75 duration-300">
        <div className="text-6xl leading-none">{emoji}</div>
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-300/70">Weather Auction Won</div>
        <div className="text-3xl font-black text-white capitalize text-center leading-tight">
          {flash.preset} Weather
        </div>
        <div className="text-[13px] text-yellow-100/70 font-semibold">
          ⚡ <span className="text-yellow-300">{agentShort}</span> controls the skies
        </div>
      </div>
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
