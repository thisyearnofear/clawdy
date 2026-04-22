'use client'

import { useState, useEffect } from 'react'
import { agentProtocol, AgentSession, VehicleType, AGENT_ROLE_CONFIG, CHAIN_NAME } from '../../services/AgentProtocol'
import { CLOUD_PRESETS } from '../environment/CloudManager'
import { GlassPanel } from './GlassPanel'
import { getAgentProfile, getControllableAgents } from '../../services/agents'
import type { SkillDecision, SkillProviderInfo } from '../../services/skillEngine'

export function AgentTerminal() {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeAgentId, setActiveAgentId] = useState<string>('')
  const [weatherStatus, setWeatherStatus] = useState(agentProtocol.getWeatherStatus())
  const [decisionFeed, setDecisionFeed] = useState<SkillDecision[]>(agentProtocol.getDecisionFeed())
  const [skillProvider, setSkillProvider] = useState<SkillProviderInfo>(agentProtocol.getSkillProvider())
  const [logs, setLogs] = useState<string[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>('tank')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setSessions(agentProtocol.getSessions())
      setWeatherStatus(agentProtocol.getWeatherStatus())
      setDecisionFeed(agentProtocol.getDecisionFeed())
      setSkillProvider(agentProtocol.getSkillProvider())
    }, 500)
    const unsubscribeDecisions = agentProtocol.subscribeToDecisions((decision) => {
      setDecisionFeed((prev) => [decision, ...prev].slice(0, 6))
    })
    return () => {
      clearInterval(interval)
      unsubscribeDecisions()
    }
  }, [])

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 5))
  }

  const spawnAgent = async (name: string) => {
    await agentProtocol.authorizeAgent(name, 3600000)
    const created = agentProtocol.getSession(name)
    setActiveAgentId(name)
    addLog(`${name} joined ${CHAIN_NAME} as ${created ? AGENT_ROLE_CONFIG[created.role].label : 'agent'}`)
  }

  const toggleAutoPilot = () => {
    if (activeAgentId) {
      agentProtocol.toggleAutoPilot(activeAgentId)
      const session = agentProtocol.getSession(activeAgentId)
      addLog(`${activeAgentId} Auto-Pilot: ${session?.autoPilot ? 'ENABLED' : 'DISABLED'}`)
    }
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

  const deployAgentVehicle = async () => {
     const vehicleId = agentProtocol.getSession(activeAgentId)?.vehicleId || activeAgentId
     const success = await agentProtocol.rentVehicleOnChain(activeAgentId, vehicleId, selectedVehicle, 5)
     if (success) {
       agentProtocol.processVehicleCommand({
        agentId: activeAgentId,
        vehicleId,
        type: selectedVehicle,
        inputs: { forward: 0, turn: 0, brake: true }
      })
      addLog(`${activeAgentId} rented ${selectedVehicle}`)
     }
  }

  const drive = (direction: 'forward' | 'left' | 'right' | 'stop') => {
    const inputs = {
      forward: direction === 'forward' ? 1 : 0,
      turn: direction === 'left' ? 1 : direction === 'right' ? -1 : 0,
      brake: direction === 'stop',
    }

    agentProtocol.processVehicleCommand({
      agentId: activeAgentId,
      vehicleId: agentProtocol.getSession(activeAgentId)?.vehicleId || activeAgentId,
      inputs
    })
  }

  const fire = () => {
    if (!activeAgentId) return
    agentProtocol.processVehicleCommand({
      agentId: activeAgentId,
      vehicleId: agentProtocol.getSession(activeAgentId)?.vehicleId || activeAgentId,
      inputs: { forward: 0, turn: 0, brake: false, action: true }
    })
    addLog(`${activeAgentId} weapon fired!`)
  }

  const activeSession = sessions.find(s => s.agentId === activeAgentId)

  // Count active agents for badge
  const agentCount = sessions.filter(s => s.agentId !== 'Player').length

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-12 h-12 rounded-full backdrop-blur-xl border shadow-lg transition-all flex items-center justify-center relative ${isOpen ? 'bg-purple-500 border-white text-white' : 'bg-black/20 border-white/20 text-white hover:bg-black/30'}`}
        title="Agent Terminal"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        {agentCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-900">
            {agentCount}
          </span>
        )}
      </button>

      {/* Agent Terminal Panel - Floating */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Panel */}
          <div className="fixed bottom-24 right-6 w-80 sm:w-96 z-40 animate-in fade-in slide-in-from-bottom-4">
            <GlassPanel 
              title="Agentic Sandbox" 
              icon="🤖" 
              className="shadow-2xl"
              onClose={() => setIsOpen(false)}
            >
              <div className="mb-3 rounded-lg border border-sky-400/20 bg-sky-500/10 px-3 py-2">
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-sky-300">{CHAIN_NAME} command mesh</div>
                <div className="mt-1 text-[10px] text-white/60">A single runtime hosts role-based agents and a pluggable skill policy layer for this submission build.</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/70">
                    Provider: {skillProvider.label}
                  </span>
                  <span className="text-[9px] text-white/45">{skillProvider.summary}</span>
                </div>
              </div>
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {getControllableAgents().map((profile) => (
                  !sessions.find((session) => session.agentId === profile.id) ? (
                    <button key={profile.id} onClick={() => spawnAgent(profile.id)} className="bg-sky-600/40 hover:bg-sky-600/60 px-3 py-2 rounded-lg text-[10px] font-bold transition-colors whitespace-nowrap">
                      + {profile.shortLabel}
                    </button>
                  ) : null
                ))}
              </div>

              {sessions.length > 0 && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    {sessions.filter(s => s.agentId !== 'Player').map(s => {
                      const profile = getAgentProfile(s.agentId)
                      return (
                      <button 
                        key={s.agentId}
                        onClick={() => setActiveAgentId(s.agentId)}
                        className={`flex-1 p-2 rounded-lg border transition-all ${activeAgentId === s.agentId ? 'bg-white/20 border-white' : 'bg-black/40 border-white/5 opacity-50 hover:opacity-80'}`}
                      >
                        <span className="text-[10px] font-bold">{s.agentId}</span>
                        <div className="text-[8px] mt-1" style={{ color: profile?.accentColor || '#7dd3fc' }}>{AGENT_ROLE_CONFIG[s.role].label}</div>
                        <div className="text-[8px] mt-1 text-green-400">{s.balance.toFixed(3)} 0G</div>
                      </button>
                      )
                    })}
                  </div>

                  {activeAgentId && activeSession && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-[9px] font-black uppercase tracking-widest text-white/50">{AGENT_ROLE_CONFIG[activeSession.role].label}</div>
                        <div className="mt-1 text-[10px] text-white/65">{activeSession.mission}</div>
                        <div className="mt-2 text-[9px] text-sky-300">Loyalty: {activeSession.agentLoyalty.toFixed(0)}</div>
                      </div>

                      {decisionFeed.length > 0 && decisionFeed[0].agentId === activeAgentId && (
                        <div className="border border-white/10 bg-black/40 p-3 rounded-lg">
                           <div className="text-[9px] text-white/50 mb-1">Pending Decision:</div>
                           <div className="text-[11px] font-bold text-white mb-2">{decisionFeed[0].title}</div>
                           <div className="flex gap-2">
                             <button onClick={() => addLog("Approved.")} className="flex-1 bg-emerald-600/40 p-2 text-[10px] rounded">APPROVE</button>
                             <button onClick={() => addLog("Rejected.")} className="flex-1 bg-red-600/40 p-2 text-[10px] rounded">REJECT</button>
                           </div>
                        </div>
                      )}

                      <div className="grid grid-cols-4 gap-2">

                        <button onClick={() => triggerAgentAction('storm', 0.05)} className="bg-red-900/40 hover:bg-red-900/60 p-2 rounded-lg border border-red-500/20 text-[10px] font-bold transition-colors">STORM</button>
                        <button onClick={() => triggerAgentAction('candy', 0.02)} className="bg-pink-900/40 hover:bg-pink-900/60 p-2 rounded-lg border border-pink-500/20 text-[10px] font-bold transition-colors">CANDY</button>
                        <button onClick={() => triggerAgentAction('chaos', 0.1)} className="bg-orange-900/40 hover:bg-orange-900/60 p-2 rounded-lg border border-orange-500/20 text-[10px] font-bold transition-colors">CHAOS</button>
                      </div>

                      <div className="pt-2 border-t border-white/5">
                        <div className="flex gap-1 mb-2">
                          {(['truck', 'tank', 'monster', 'speedster'] as VehicleType[]).map(t => (
                            <button key={t} onClick={() => setSelectedVehicle(t)} className={`flex-1 py-1.5 rounded-lg text-[8px] uppercase font-bold border transition-all ${selectedVehicle === t ? 'bg-sky-500 border-white' : 'bg-white/5 hover:bg-white/10'}`}>{t}</button>
                          ))}
                        </div>
                        <button onClick={deployAgentVehicle} className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold mb-3 transition-colors">RENT & DEPLOY</button>
                        
                        <div className="grid grid-cols-5 gap-1 mb-2">
                          <button onClick={() => drive('left')} className="bg-white/5 hover:bg-white/10 p-2 rounded-lg text-[10px] font-bold transition-colors">◀</button>
                          <button onClick={() => drive('forward')} className="bg-white/5 hover:bg-white/10 p-2 rounded-lg text-[10px] font-bold transition-colors">▲</button>
                          <button onClick={() => drive('right')} className="bg-white/5 hover:bg-white/10 p-2 rounded-lg text-[10px] font-bold transition-colors">▶</button>
                          <button onClick={() => drive('stop')} className="bg-red-900/20 hover:bg-red-900/40 p-2 rounded-lg text-[10px] font-bold transition-colors">⏹</button>
                          <button onClick={fire} className="bg-orange-500/40 hover:bg-orange-500/60 p-2 rounded-lg font-black border border-orange-500/50 text-[10px] transition-colors">🔥</button>
                        </div>

                        <button 
                          onClick={toggleAutoPilot} 
                          className={`w-full py-2 rounded-lg text-[10px] font-black border transition-all ${
                            activeSession.autoPilot 
                              ? 'bg-green-500/20 border-green-500 text-green-400' 
                              : 'bg-white/5 border-white/10 opacity-50 hover:opacity-100'
                          }`}
                        >
                          {activeSession.autoPilot ? 'AUTO-PILOT ACTIVE' : 'ENABLE AUTO-PILOT'}
                        </button>
                      </div>

                      <div className="space-y-2 bg-black/20 p-3 rounded-lg">
                        <div className="flex justify-between text-[9px]">
                          <span className="font-bold text-white/50">VITALITY</span>
                          <span className="text-green-400 font-bold">{activeSession.vitality}%</span>
                        </div>
                        <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-green-500 h-full transition-all" style={{ width: `${activeSession.vitality}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-white/10 space-y-1">
                <div className="flex justify-between items-center mb-2 text-[10px] text-yellow-400">
                  <span className="uppercase font-bold tracking-widest">Weather:</span>
                  <span className="font-black">{weatherStatus.agentId || 'DECENTRALIZED'}</span>
                </div>
                {decisionFeed.slice(0, 3).map((decision, index) => (
                  <div key={`${decision.agentId}-${decision.createdAt}-${index}`} className="rounded-lg border border-white/5 bg-white/5 px-2 py-2">
                    <div className="text-[9px] font-black uppercase tracking-wider text-sky-300">{decision.title}</div>
                    <div className="mt-1 text-[10px] text-white/60">{decision.summary}</div>
                  </div>
                ))}
                {logs.map((log, i) => (
                  <div key={i} className="opacity-80 truncate text-[10px] font-mono">{`> ${log}`}</div>
                ))}
              </div>
            </GlassPanel>
          </div>
        </>
      )}
    </>
  )
}
