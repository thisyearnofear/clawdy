'use client'

import { useState, useEffect } from 'react'
import { agentProtocol, AgentSession, VehicleType } from '../services/AgentProtocol'
import { CLOUD_PRESETS } from './CloudManager'

export function AgentTerminal() {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeAgentId, setActiveAgentId] = useState<string>('')
  const [worldState, setWorldState] = useState(agentProtocol.getWorldState())
  const [weatherStatus, setWeatherStatus] = useState(agentProtocol.getWeatherStatus())
  const [logs, setLogs] = useState<string[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>('tank')

  useEffect(() => {
    const interval = setInterval(() => {
      setSessions(agentProtocol.getSessions())
      setWorldState(agentProtocol.getWorldState())
      setWeatherStatus(agentProtocol.getWeatherStatus())
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 5))
  }

  const spawnAgent = async (name: string) => {
    await agentProtocol.authorizeAgent(name, 3600000)
    setActiveAgentId(name)
    addLog(`${name} joined Base Network`)
  }

  const triggerAgentAction = (type: 'storm' | 'candy' | 'chaos', bid: number) => {
    if (!activeAgentId) return
    let config = {}
    if (type === 'storm') config = { ...CLOUD_PRESETS.stormy, spawnRate: 0.5 }
    if (type === 'candy') config = { ...CLOUD_PRESETS.candy, spawnRate: 8 }
    if (type === 'chaos') config = { count: 20, volume: 20, speed: 2, spawnRate: 10, color: '#ff0000' }

    agentProtocol.processCommand({
      agentId: activeAgentId,
      timestamp: Date.now(),
      bid,
      config,
      duration: 5000
    }).then(success => {
      if (success) addLog(`${activeAgentId} WON bid for ${type} (${bid} ETH)`)
      else addLog(`${activeAgentId} bid failed for ${type}`)
    })
  }

  const deployAgentVehicle = () => {
     agentProtocol.processVehicleCommand({
      agentId: activeAgentId,
      vehicleId: activeAgentId === 'Agent-Zero' ? 'agent-1' : 'agent-2',
      type: selectedVehicle,
      inputs: { forward: 0, turn: 0, brake: true }
    })
    addLog(`${activeAgentId} deployed ${selectedVehicle}`)
  }

  const drive = (direction: 'forward' | 'left' | 'right' | 'stop') => {
    let inputs = { forward: 0, turn: 0, brake: false }
    if (direction === 'forward') inputs.forward = 1
    if (direction === 'left') inputs.turn = 1
    if (direction === 'right') inputs.turn = -1
    if (direction === 'stop') inputs.brake = true

    agentProtocol.processVehicleCommand({
      agentId: activeAgentId,
      vehicleId: activeAgentId === 'Agent-Zero' ? 'agent-1' : 'agent-2',
      inputs
    })
  }

  return (
    <div className="absolute bottom-8 left-8 w-96 bg-black/60 backdrop-blur-xl p-6 rounded-2xl border border-white/10 text-white font-mono text-xs z-30">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold uppercase tracking-widest text-sky-400">Agentic Sandbox (Multi-Agent)</h3>
        <span className="text-[10px] opacity-50 px-2 py-0.5 bg-white/10 rounded">BASE MAINNET SIM</span>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {!sessions.find(s => s.agentId === 'Agent-Zero') && (
          <button onClick={() => spawnAgent('Agent-Zero')} className="bg-sky-600/40 p-2 rounded whitespace-nowrap">+ SPAWN ZERO</button>
        )}
        {!sessions.find(s => s.agentId === 'Agent-One') && (
          <button onClick={() => spawnAgent('Agent-One')} className="bg-purple-600/40 p-2 rounded whitespace-nowrap">+ SPAWN ONE</button>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="space-y-4">
          {/* Agent Switcher */}
          <div className="flex gap-2">
            {sessions.map(s => (
              <button 
                key={s.agentId}
                onClick={() => setActiveAgentId(s.agentId)}
                className={`flex-1 p-2 rounded border transition-all ${activeAgentId === s.agentId ? 'bg-white/20 border-white' : 'bg-black/40 border-white/5 opacity-50'}`}
              >
                {s.agentId}
                <div className="text-[8px] mt-1 text-green-400">Ξ{s.balance.toFixed(3)}</div>
              </button>
            ))}
          </div>

          {activeAgentId && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => triggerAgentAction('storm', 0.05)} className="bg-red-900/40 p-2 rounded border border-red-500/20">BID STORM</button>
                <button onClick={() => triggerAgentAction('candy', 0.02)} className="bg-pink-900/40 p-2 rounded border border-pink-500/20">BID CANDY</button>
                <button onClick={() => triggerAgentAction('chaos', 0.1)} className="bg-orange-900/40 p-2 rounded border border-orange-500/20">BID CHAOS</button>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="flex gap-1 mb-2">
                  {(['truck', 'tank', 'monster', 'speedster'] as VehicleType[]).map(t => (
                    <button key={t} onClick={() => setSelectedVehicle(t)} className={`flex-1 py-1 rounded text-[8px] uppercase font-bold border ${selectedVehicle === t ? 'bg-sky-500 border-white' : 'bg-white/5'}`}>{t}</button>
                  ))}
                </div>
                <button onClick={deployAgentVehicle} className="w-full py-1 bg-white/10 rounded text-[9px] font-bold mb-3">DEPLOY VEHICLE</button>
                
                <div className="grid grid-cols-4 gap-1">
                  <button onClick={() => drive('left')} className="bg-white/5 p-1 rounded">L</button>
                  <button onClick={() => drive('forward')} className="bg-white/5 p-1 rounded">F</button>
                  <button onClick={() => drive('right')} className="bg-white/5 p-1 rounded">R</button>
                  <button onClick={() => drive('stop')} className="bg-red-900/20 p-1 rounded">X</button>
                </div>
              </div>

              {sessions.find(s => s.agentId === activeAgentId) && (
                <div className="space-y-2 bg-black/20 p-2 rounded">
                  <div className="flex justify-between text-[9px]">
                    <span>VITALITY</span>
                    <span className="text-green-400">{sessions.find(s => s.agentId === activeAgentId)?.vitality}%</span>
                  </div>
                  <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full transition-all" style={{ width: `${sessions.find(s => s.agentId === activeAgentId)?.vitality}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-white/10 space-y-1">
        <div className="flex justify-between items-center mb-2 text-[10px] text-yellow-400">
          <span className="uppercase">Current Weather Control:</span>
          <span>{weatherStatus.agentId || 'DECENTRALIZED'}</span>
        </div>
        {logs.map((log, i) => (
          <div key={i} className="opacity-80 truncate text-[10px]">{`> ${log}`}</div>
        ))}
      </div>
    </div>
  )
}