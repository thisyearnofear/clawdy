'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense, useState, useEffect } from 'react'
import Experience from './Experience'
import { Loader } from '@react-three/drei'
import { CloudConfig } from './CloudManager'
import { agentProtocol, AgentSession, WEATHER_AUCTION_ADDRESS } from '../services/AgentProtocol'
import { AgentTerminal } from './AgentTerminal'
import { VehicleType } from '../services/AgentProtocol'
import { ConnectWallet } from './ConnectWallet'
import { useWatchContractEvent } from 'wagmi'
import { WEATHER_AUCTION_ABI } from '../services/abis/WeatherAuction'
import { Leaderboard } from './Leaderboard'
import { GlassPanel } from './GlassPanel'
import { vehicleQueue, QueueState } from '../services/VehicleQueue'
import { useAccount } from 'wagmi'

export default function CloudScene() {
  const { address } = useAccount()
  const playerId = address || 'anonymous'
  
  const [spawnRate, setSpawnRate] = useState(2)
  const [playerVehicle, setPlayerVehicle] = useState<VehicleType>('speedster')
  const [playerSession, setPlayerSession] = useState<AgentSession | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false) // Default to CLOSED
  const [activeTab, setActiveAgentTab] = useState<'weather' | 'vehicles' | 'stats'>('weather')
  const [showQuickControls, setShowQuickControls] = useState(false)
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  
  const [config, setConfig] = useState<CloudConfig>({
    seed: 1, segments: 40, volume: 10, growth: 4, opacity: 0.8,
    speed: 0.2, color: '#ffffff', secondaryColor: '#e0e0e0',
    bounds: [10, 2, 10], count: 5
  })

  useWatchContractEvent({
    address: WEATHER_AUCTION_ADDRESS as `0x${string}`,
    abi: WEATHER_AUCTION_ABI,
    eventName: 'WeatherChanged',
    onLogs(logs: any) {
      const event = logs[0].args
      if (event && event.preset) {
        agentProtocol.processCommand({
          agentId: 'On-Chain', timestamp: Date.now(), bid: 0,
          config: { preset: event.preset as any }, duration: 60000
        })
      }
    },
  })

  useEffect(() => {
    const interval = setInterval(() => {
      setPlayerSession(agentProtocol.getSession('Player') || null)
    }, 500)

    const unsubscribe = agentProtocol.subscribeToWeather((newConfig) => {
      if (newConfig.spawnRate !== undefined) setSpawnRate(newConfig.spawnRate)
      setConfig(prev => ({ ...prev, ...newConfig, preset: 'custom' }))
    })

    // Subscribe to vehicle queue
    const unsubscribeQueue = vehicleQueue.subscribe((state) => {
      setQueueState(state)
    })

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(prev => !prev)
        setShowQuickControls(false)
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        setShowQuickControls(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearInterval(interval)
      unsubscribe()
      unsubscribeQueue()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const updateConfig = (key: keyof CloudConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  // Quick preset selector
  const applyPreset = (preset: string) => {
    updateConfig('preset', preset)
    setShowQuickControls(false)
  }

  return (
    <div className="w-full h-screen bg-gradient-to-b from-sky-400 to-sky-200 relative overflow-hidden">
      <Canvas shadows>
        <Suspense fallback={null}>
          <Experience cloudConfig={config} spawnRate={spawnRate} playerVehicleType={playerVehicle} />
        </Suspense>
      </Canvas>
      <Loader />

      {/* --- MINIMAL HUD LAYER --- */}
      
      {/* Logo - Always visible, compact */}
      <div className="absolute top-6 left-6 flex items-center gap-3 z-10">
        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg">
          <span className="text-2xl">🦞</span>
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-white drop-shadow-lg leading-none">CLAWDY</h1>
          <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">with a chance of meatballs</span>
        </div>
      </div>

      {/* Wallet - Top right */}
      <div className="absolute top-6 right-6 z-30">
        <ConnectWallet />
      </div>

      {/* Floating Action Buttons - Right side */}
      <div className="absolute top-1/2 right-6 -translate-y-1/2 flex flex-col gap-3 z-20">
        {/* Quick Weather Presets */}
        <div className="relative">
          <button
            onClick={() => setShowQuickControls(!showQuickControls)}
            className={`w-12 h-12 rounded-full backdrop-blur-xl border shadow-lg transition-all flex items-center justify-center group ${showQuickControls ? 'bg-sky-500 border-white text-white' : 'bg-black/20 border-white/20 text-white hover:bg-black/30'}`}
            title="Quick Weather [Tab]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </button>
          
          {/* Quick Presets Popup */}
          {showQuickControls && (
            <div className="absolute right-14 top-0 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 p-2 shadow-2xl animate-in fade-in slide-in-from-right-4">
              <div className="flex flex-col gap-1">
                {['stormy', 'sunset', 'candy', 'custom'].map((p) => (
                  <button
                    key={p}
                    onClick={() => applyPreset(p)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${config.preset === p ? 'bg-white text-sky-900' : 'text-white hover:bg-white/10'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Open Full Controls */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="w-12 h-12 rounded-full bg-black/20 backdrop-blur-xl border border-white/20 text-white hover:bg-black/30 transition-all flex items-center justify-center group"
          title="Open Controls [ESC]"
        >
          <svg className="w-5 h-5 group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Agent Terminal Toggle */}
        <AgentTerminal />
      </div>

      {/* Player Status - Bottom right, minimal */}
      {playerSession && (
        <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2 items-end">
          {/* Queue Status */}
          {queueState && address && (
            <QueueStatusBadge playerId={playerId} queueState={queueState} />
          )}
          
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-3 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-white/50 uppercase">Balance</span>
                <span className="text-xs font-mono font-bold text-sky-400">Ξ{playerSession.balance.toFixed(2)}</span>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-green-400">{playerSession.vitality}%</span>
                  <div className="w-16 bg-black/30 h-1 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${playerSession.vitality}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- FULL CONTROL PANEL (Slide-over) --- */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      <div className={`fixed top-0 right-0 h-full w-80 sm:w-96 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 z-50 transition-transform duration-300 flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
              <span className="text-xl">🦞</span>
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider">Control Center</h2>
              <p className="text-[10px] text-white/40">Customize your experience</p>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/50 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 pt-4">
          <div className="flex gap-1 bg-black/20 p-1 rounded-xl">
            {(['weather', 'vehicles', 'stats'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveAgentTab(tab)}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-sky-900 shadow-xl' : 'text-white/40 hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto scrollbar-hide">
          {activeTab === 'weather' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="grid grid-cols-2 gap-2">
                {['custom', 'stormy', 'sunset', 'candy'].map((p) => (
                  <button key={p} onClick={() => updateConfig('preset', p)} className={`px-2 py-3 rounded-xl text-[10px] uppercase font-bold border transition-all ${config.preset === p ? 'bg-white text-sky-900' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>{p}</button>
                ))}
              </div>
              
              <div className={`space-y-5 ${config.preset !== 'custom' ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Intensity <span className="text-sky-400">{spawnRate}</span></label>
                  <input type="range" min="0.2" max="10" step="0.2" value={spawnRate} onChange={(e) => setSpawnRate(Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Density <span className="text-sky-400">{config.volume}</span></label>
                  <input type="range" min="1" max="20" value={config.volume} onChange={(e) => updateConfig('volume', Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Puffiness <span className="text-sky-400">{config.growth}</span></label>
                  <input type="range" min="1" max="10" value={config.growth} onChange={(e) => updateConfig('growth', Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2 block">Sky Tints</label>
                  <div className="flex gap-2 flex-wrap">
                    {['#ffffff', '#ffcccc', '#ccffcc', '#2c3e50'].map(c => (
                      <button key={c} onClick={() => updateConfig('color', c)} className={`w-10 h-10 rounded-full border-2 transition-all ${config.color === c ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-80'}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'vehicles' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Select Platform</p>
              <div className="grid grid-cols-1 gap-2">
                {(['truck', 'tank', 'monster', 'speedster'] as VehicleType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setPlayerVehicle(type)}
                    className={`flex justify-between items-center px-4 py-4 rounded-xl text-[11px] uppercase font-black transition-all border ${
                      playerVehicle === type ? 'bg-white text-sky-900 border-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    <span>{type}</span>
                    {playerVehicle === type && <span className="text-[8px] bg-sky-900/10 px-2 py-0.5 rounded-full">Active</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="animate-in fade-in slide-in-from-right-4 h-full flex flex-col">
              <Leaderboard />
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/20">
           <div className="flex justify-between items-center opacity-30">
              <span className="text-[8px] font-black tracking-tighter italic">CLAWDY</span>
              <span className="text-[8px] font-black tracking-widest">BASE L2 SETTLED</span>
           </div>
        </div>
      </div>

      {/* Help hint - fades out after 5 seconds */}
      <HelpHint />

      {/* Bottom center tagline */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-center pointer-events-none opacity-20 text-[8px] z-10 font-black tracking-[0.5em] uppercase">
        Continuous Decentralized Sandbox
      </div>
    </div>
  )
}

// Help hint component that fades out
function HelpHint() {
  const [visible, setVisible] = useState(true)
  
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [])
  
  if (!visible) return null
  
  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-xl rounded-full px-4 py-2 border border-white/10 animate-in fade-in slide-in-from-bottom-4">
      <p className="text-[10px] text-white/70 font-medium">
        Press <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">ESC</kbd> for controls · <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">Tab</kbd> for quick weather
      </p>
    </div>
  )
}

// Queue status badge component
function QueueStatusBadge({ playerId, queueState }: { playerId: string; queueState: QueueState }) {
  const isActive = queueState.isPlayerActive(playerId)
  const vehicle = queueState.getPlayerVehicle(playerId)
  const player = queueState.queue.find(p => p.id === playerId)
  
  if (isActive && vehicle) {
    // Show active vehicle info
    const timeLeft = player?.sessionEndTime 
      ? Math.max(0, Math.floor((player.sessionEndTime - Date.now()) / 1000))
      : 0
    const minutes = Math.floor(timeLeft / 60)
    const seconds = timeLeft % 60
    
    return (
      <div className="bg-green-500/20 backdrop-blur-xl rounded-xl border border-green-500/50 px-3 py-2 shadow-xl animate-in fade-in slide-in-from-right-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black text-green-400 uppercase">Driving {vehicle.type}</span>
          <span className="text-[10px] font-mono text-white/70">{minutes}:{seconds.toString().padStart(2, '0')}</span>
        </div>
      </div>
    )
  }
  
  if (player?.status === 'waiting') {
    const position = queueState.queue.filter(p => p.status === 'waiting').findIndex(p => p.id === playerId) + 1
    return (
      <div className="bg-yellow-500/20 backdrop-blur-xl rounded-xl border border-yellow-500/50 px-3 py-2 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black text-yellow-400 uppercase">Queue Position: {position}</span>
        </div>
      </div>
    )
  }
  
  // Not in queue - show join button hint
  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 px-3 py-2 shadow-xl">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black text-white/50 uppercase">Connect wallet to drive</span>
      </div>
    </div>
  )
}
