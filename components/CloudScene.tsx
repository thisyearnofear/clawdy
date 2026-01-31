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

export default function CloudScene() {
  const [spawnRate, setSpawnRate] = useState(2)
  const [playerVehicle, setPlayerVehicle] = useState<VehicleType>('speedster')
  const [playerSession, setPlayerSession] = useState<AgentSession | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [activeTab, setActiveAgentTab] = useState<'weather' | 'vehicles' | 'stats'>('weather')
  
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(prev => !prev)
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearInterval(interval)
      unsubscribe()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const updateConfig = (key: keyof CloudConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="w-full h-screen bg-gradient-to-b from-sky-400 to-sky-200 relative overflow-hidden">
      <Canvas shadows>
        <Suspense fallback={null}>
          <Experience cloudConfig={config} spawnRate={spawnRate} playerVehicleType={playerVehicle} />
        </Suspense>
      </Canvas>
      <Loader />

      {/* --- HUD LAYER (Always Visible) --- */}
      <div className="absolute top-8 left-8 flex flex-col gap-2 z-10">
        <h1 className="text-4xl font-black tracking-tighter text-white drop-shadow-lg">CLAWDY</h1>
        <button 
          onClick={() => setIsSidebarOpen(prev => !prev)}
          className={`px-4 py-2 backdrop-blur-md border text-[10px] font-black rounded-lg transition-all w-fit uppercase tracking-widest ${isSidebarOpen ? 'bg-sky-500 border-white text-white' : 'bg-white/10 border-white/20 text-white'}`}
        >
          {isSidebarOpen ? 'Close Controls' : '[ESC] Open Controls'}
        </button>
      </div>

      <div className="absolute top-8 right-8 z-30">
        <ConnectWallet />
      </div>

      <AgentTerminal />

      {playerSession && (
        <div className="absolute bottom-8 right-8 w-64 z-10 pointer-events-none">
          <GlassPanel title="Pilot Status" icon="🏎️">
            <div className="flex justify-between items-center mb-3">
               <span className="text-[10px] bg-sky-500 px-2 py-0.5 rounded-full font-bold text-white">Ξ{playerSession.balance.toFixed(2)}</span>
               <span className="text-[8px] opacity-50 font-mono uppercase tracking-tighter">Live Status</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[9px] mb-1 font-bold text-white/70">
                  <span>VITALITY</span>
                  <span className="text-green-400">{playerSession.vitality}%</span>
                </div>
                <div className="w-full bg-black/30 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${playerSession.vitality}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[9px] mb-1 font-bold text-white/70">
                  <span>BURDEN</span>
                  <span className="text-orange-400">{playerSession.burden}%</span>
                </div>
                <div className="w-full bg-black/30 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-orange-500 h-full transition-all duration-500" style={{ width: `${playerSession.burden}%` }} />
                </div>
              </div>
            </div>
          </GlassPanel>
        </div>
      )}

      {/* --- THE CONTROL TOWER (Sidebar Approach) --- */}
      <div className={`absolute top-0 left-0 h-full w-96 bg-black/20 backdrop-blur-xl border-r border-white/10 z-40 transition-transform duration-500 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mt-32 p-6 flex-1 flex flex-col gap-6 overflow-y-auto scrollbar-hide">
          
          {/* Tab Switcher */}
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

          {activeTab === 'weather' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
              <div className="grid grid-cols-2 gap-2">
                {['custom', 'stormy', 'sunset', 'candy'].map((p) => (
                  <button key={p} onClick={() => updateConfig('preset', p)} className={`px-2 py-2 rounded-lg text-[10px] uppercase font-bold border transition-all ${config.preset === p ? 'bg-white text-sky-900' : 'bg-white/5 border-white/10 text-white'}`}>{p}</button>
                ))}
              </div>
              
              <div className={`space-y-5 ${config.preset !== 'custom' ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Intensity <span>{spawnRate}</span></label>
                  <input type="range" min="0.2" max="10" step="0.2" value={spawnRate} onChange={(e) => setSpawnRate(Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Density <span>{config.volume}</span></label>
                  <input type="range" min="1" max="20" value={config.volume} onChange={(e) => updateConfig('volume', Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Puffiness <span>{config.growth}</span></label>
                  <input type="range" min="1" max="10" value={config.growth} onChange={(e) => updateConfig('growth', Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2 block">Sky Tints</label>
                  <div className="flex gap-2 flex-wrap">
                    {['#ffffff', '#ffcccc', '#ccffcc', '#2c3e50'].map(c => (
                      <button key={c} onClick={() => updateConfig('color', c)} className={`w-8 h-8 rounded-full border-2 ${config.color === c ? 'border-white scale-110' : 'border-transparent opacity-50'}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'vehicles' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
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
            <div className="animate-in fade-in slide-in-from-left-4 h-full flex flex-col">
              <Leaderboard />
            </div>
          )}

        </div>
        
        <div className="p-6 border-t border-white/10 bg-black/40">
           <div className="flex justify-between items-center opacity-30 grayscale contrast-200">
              <span className="text-[8px] font-black tracking-tighter italic">CLAWDY v1.0.4</span>
              <span className="text-[8px] font-black tracking-widest">BASE L2 SETTLED</span>
           </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white text-center pointer-events-none opacity-20 text-[8px] z-10 font-black tracking-[0.5em] uppercase">
        Continuous Decentralized Sandbox
      </div>
    </div>
  )
}