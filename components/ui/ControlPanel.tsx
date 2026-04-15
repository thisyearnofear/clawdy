'use client'

import { Leaderboard } from './Leaderboard'
import { CloudConfig } from '../environment/CloudManager'
import { VehicleType } from '../../services/AgentProtocol'
import { useGameStore } from '../../services/gameStore'

interface ControlPanelProps {
  isOpen: boolean
  onClose: () => void
  activeTab: 'weather' | 'vehicles' | 'stats'
  setActiveTab: (tab: 'weather' | 'vehicles' | 'stats') => void
  cloudConfig: CloudConfig
  updateConfig: <K extends keyof CloudConfig>(key: K, value: CloudConfig[K]) => void
  spawnRate: number
  setSpawnRate: (rate: number) => void
  playerVehicle: VehicleType
  setPlayerVehicle: (v: VehicleType) => void
}

export function ControlPanel({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  cloudConfig,
  updateConfig,
  spawnRate,
  setSpawnRate,
  playerVehicle,
  setPlayerVehicle
}: ControlPanelProps) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={`fixed top-0 right-0 h-full w-80 sm:w-96 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 z-50 transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
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
            onClick={onClose}
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
                onClick={() => setActiveTab(tab)}
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
                {(['custom', 'stormy', 'sunset', 'candy'] as const).map((p) => (
                  <button key={p} onClick={() => updateConfig('preset', p)} className={`px-2 py-3 rounded-xl text-[10px] uppercase font-bold border transition-all ${cloudConfig.preset === p ? 'bg-white text-sky-900' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>{p}</button>
                ))}
              </div>
              
              <div className={`space-y-5 ${cloudConfig.preset !== 'custom' ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Intensity <span className="text-sky-400">{spawnRate}</span></label>
                  <input type="range" min="0.2" max="10" step="0.2" value={spawnRate} onChange={(e) => setSpawnRate(Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Density <span className="text-sky-400">{cloudConfig.volume}</span></label>
                  <input type="range" min="1" max="20" value={cloudConfig.volume} onChange={(e) => updateConfig('volume', Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Puffiness <span className="text-sky-400">{cloudConfig.growth}</span></label>
                  <input type="range" min="1" max="10" value={cloudConfig.growth} onChange={(e) => updateConfig('growth', Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2 block">Sky Tints</label>
                  <div className="flex gap-2 flex-wrap">
                    {['#ffffff', '#ffcccc', '#ccffcc', '#2c3e50'].map(c => (
                      <button key={c} onClick={() => updateConfig('color', c)} className={`w-10 h-10 rounded-full border-2 transition-all ${cloudConfig.color === c ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-80'}`} style={{ backgroundColor: c }} />
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
    </>
  )
}
