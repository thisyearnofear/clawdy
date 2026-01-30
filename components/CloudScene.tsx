'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense, useState, useEffect } from 'react'
import Experience from './Experience'
import { Loader } from '@react-three/drei'
import { CloudConfig } from './CloudManager'
import { agentProtocol, AgentSession } from '../services/AgentProtocol'
import { AgentTerminal } from './AgentTerminal'
import { VehicleType } from '../services/AgentProtocol'

export default function CloudScene() {
  const [spawnRate, setSpawnRate] = useState(2)
  const [playerVehicle, setPlayerVehicle] = useState<VehicleType>('speedster')
  const [playerSession, setPlayerSession] = useState<AgentSession | null>(null)
  const [config, setConfig] = useState<CloudConfig>({
    seed: 1,
    segments: 40,
    volume: 10,
    growth: 4,
    opacity: 0.8,
    speed: 0.2,
    color: '#ffffff',
    secondaryColor: '#e0e0e0',
    bounds: [10, 2, 10],
    count: 5
  })

  useEffect(() => {
    const interval = setInterval(() => {
      setPlayerSession(agentProtocol.getSession('Player') || null)
    }, 500)

    const unsubscribe = agentProtocol.subscribeToWeather((newConfig) => {
      if (newConfig.spawnRate !== undefined) {
        setSpawnRate(newConfig.spawnRate)
      }
      
      setConfig(prev => ({
        ...prev,
        ...newConfig,
        preset: 'custom'
      }))
    })
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [])

  const updateConfig = (key: keyof CloudConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="w-full h-screen bg-gradient-to-b from-sky-400 to-sky-200 relative">
      <Canvas shadows>
        <Suspense fallback={null}>
          <Experience cloudConfig={config} spawnRate={spawnRate} playerVehicleType={playerVehicle} />
        </Suspense>
      </Canvas>
      <Loader />

      <AgentTerminal />

      {/* Player HUD */}
      {playerSession && (
        <div className="absolute bottom-8 right-8 w-64 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-white z-10 pointer-events-none">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-black uppercase tracking-widest opacity-70">Pilot Status</h3>
            <span className="text-[10px] bg-sky-500 px-2 py-0.5 rounded-full font-bold">Ξ{playerSession.balance.toFixed(2)}</span>
          </div>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[10px] mb-1 font-bold">
                <span>VITALITY</span>
                <span className="text-green-400">{playerSession.vitality}%</span>
              </div>
              <div className="w-full bg-black/30 h-2 rounded-full overflow-hidden">
                <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${playerSession.vitality}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] mb-1 font-bold">
                <span>BURDEN</span>
                <span className="text-orange-400">{playerSession.burden}%</span>
              </div>
              <div className="w-full bg-black/30 h-2 rounded-full overflow-hidden">
                <div className="bg-orange-500 h-full transition-all duration-500" style={{ width: `${playerSession.burden}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* UI Overlay (Brand) */}
      <div className="absolute top-8 left-8 text-white pointer-events-none z-10">
        <h1 className="text-6xl font-black tracking-tighter drop-shadow-md">CLAWDY</h1>
        <p className="text-xl font-medium opacity-90 drop-shadow-sm">It's raining food!</p>
      </div>

      {/* Evolution Controls */}
      <div className="absolute top-8 right-8 w-80 max-h-[60vh] overflow-y-auto bg-white/20 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/30 text-white z-10 scrollbar-hide">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span>☁️</span> Cloud Evolution
        </h2>

        {/* Vehicle Selection */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase mb-2 opacity-60">Your Vehicle</p>
          <div className="grid grid-cols-2 gap-2">
            {(['truck', 'tank', 'monster', 'speedster'] as VehicleType[]).map((type) => (
              <button
                key={type}
                onClick={() => setPlayerVehicle(type)}
                className={`px-2 py-2 rounded-lg text-[10px] uppercase font-bold transition-all ${
                  playerVehicle === type ? 'bg-white text-sky-900 shadow-md scale-105' : 'bg-black/20 hover:bg-black/30'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div className="mb-6 grid grid-cols-2 gap-2">
          {['custom', 'stormy', 'sunset', 'candy'].map((preset) => (
            <button
              key={preset}
              onClick={() => updateConfig('preset', preset)}
              className={`px-3 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                config.preset === preset 
                  ? 'bg-white text-sky-900 shadow-md' 
                  : 'bg-black/20 hover:bg-black/30 text-white/80'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
        
        <div className={`space-y-4 text-sm font-medium transition-opacity ${config.preset !== 'custom' ? 'opacity-50 pointer-events-none' : ''}`}>
          
          <div>
            <label className="flex justify-between mb-1">
              Food Rain Intensity
              <span>{spawnRate} items/s</span>
            </label>
            <input 
              type="range" 
              min="0.2" max="10" step="0.2" 
              value={spawnRate}
              onChange={(e) => setSpawnRate(Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          <div className="pt-2 border-t border-white/10"></div>

          <div>
            <label className="flex justify-between mb-1">
              Cloud Count
              <span>{config.count}</span>
            </label>
            <input 
              type="range" 
              min="1" max="20" step="1" 
              value={config.count}
              onChange={(e) => updateConfig('count', Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          <div>
            <label className="flex justify-between mb-1">
              Density
              <span>{config.volume}</span>
            </label>
            <input 
              type="range" 
              min="1" max="20" step="1" 
              value={config.volume}
              onChange={(e) => updateConfig('volume', Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          <div>
            <label className="flex justify-between mb-1">
              Puffiness
              <span>{config.growth}</span>
            </label>
            <input 
              type="range" 
              min="1" max="10" step="1" 
              value={config.growth}
              onChange={(e) => updateConfig('growth', Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          <div>
            <label className="flex justify-between mb-1">
              Wind Speed
              <span>{config.speed}</span>
            </label>
            <input 
              type="range" 
              min="0" max="2" step="0.1" 
              value={config.speed}
              onChange={(e) => updateConfig('speed', Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          <div>
            <label className="flex justify-between mb-1">
              Tint (Primary)
              <span className="text-xs opacity-70">{config.color}</span>
            </label>
            <div className="flex gap-2 mt-1 mb-2 flex-wrap">
              {['#ffffff', '#ffcccc', '#ccffcc', '#ccccff', '#2c3e50'].map(c => (
                <button
                  key={c}
                  onClick={() => updateConfig('color', c)}
                  className={`w-6 h-6 rounded-full border-2 ${config.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>

             <label className="flex justify-between mb-1">
              Tint (Secondary)
              <span className="text-xs opacity-70">{config.secondaryColor}</span>
            </label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {['#e0e0e0', '#636e72', '#ff6b6b', '#feca57', '#54a0ff'].map(c => (
                <button
                  key={c}
                  onClick={() => updateConfig('secondaryColor', c)}
                  className={`w-6 h-6 rounded-full border-2 ${config.secondaryColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Select secondary color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/20 text-xs opacity-70 text-center">
          Adjust parameters to evolve the cloud system.
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white text-center pointer-events-none opacity-30 text-sm z-10">
        <p>Built with Next.js, R3F & Rapier | Base Mainnet Simulation</p>
      </div>
    </div>
  )
}
